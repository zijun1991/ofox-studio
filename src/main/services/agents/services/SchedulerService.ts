import { loggerService } from '@logger'
import { config as apiConfigService } from '@main/apiServer/config'
import powerMonitorService from '@main/services/PowerMonitorService'
import { isTransientNetworkError, withRetry } from '@main/utils/retry'
import { CronJob } from 'cron'
import { and, count, desc, eq, isNull, lte, or } from 'drizzle-orm'

import { BaseService } from '../BaseService'
import type { InsertSchedulerLogRow, InsertSchedulerRow, SchedulerRow } from '../database/schema'
import { schedulerLogsTable, schedulersTable } from '../database/schema'
import { SessionService } from './SessionService'

const logger = loggerService.withContext('SchedulerService')

// Types
export interface CreateSchedulerRequest {
  name: string
  description?: string
  agent_id: string
  session_id: string
  cron_expression: string
  timezone?: string
  message_content: string
  enabled?: boolean
  close_on_trigger?: boolean
  delete_on_trigger?: boolean
}

export interface UpdateSchedulerRequest extends Partial<CreateSchedulerRequest> {
  id: string
}

export interface ListSchedulersOptions {
  agent_id?: string
  enabled?: boolean
  limit?: number
  offset?: number
}

export interface ListSchedulerLogsOptions {
  scheduler_id?: string
  status?: 'pending' | 'running' | 'success' | 'failed' | 'timeout'
  limit?: number
  offset?: number
  from_date?: string
  to_date?: string
}

export interface SchedulerEntity {
  id: string
  name: string
  description?: string
  agent_id: string
  session_id: string
  cron_expression: string
  timezone: string
  message_content: string
  enabled: boolean
  close_on_trigger: boolean
  delete_on_trigger: boolean
  last_run_at?: string
  next_run_at?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface SchedulerLogEntity {
  id: number
  scheduler_id: string
  triggered_at: string
  completed_at?: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout'
  message_sent: boolean
  error_message?: string
  response_preview?: string
  duration_ms?: number
  created_at: string
}

interface ScheduledJob {
  id: string
  job: CronJob
  cronExpression: string
  timezone: string
}

// Log retention period in days
const LOG_RETENTION_DAYS = 30

// Execution timeout in milliseconds (2 minutes)
const EXECUTION_TIMEOUT_MS = 120000

// Watchdog interval in milliseconds (60 seconds)
const WATCHDOG_INTERVAL_MS = 60000

// Grace period before considering a job as missed (30 seconds)
const MISSED_EXECUTION_GRACE_MS = 30000

export class SchedulerService extends BaseService {
  private static instance: SchedulerService | null = null
  private jobs: Map<string, ScheduledJob> = new Map()
  private isInitialized = false
  private cleanupJob: CronJob | null = null
  private executingJobs: Set<string> = new Set()
  private watchdogTimer: ReturnType<typeof setInterval> | null = null

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService()
    }
    return SchedulerService.instance
  }

  /**
   * Initialize: Load all enabled schedulers and start cron jobs
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      const database = await this.getDatabase()
      const enabledSchedulers = await database.select().from(schedulersTable).where(eq(schedulersTable.enabled, true))

      // Validate schedulers and disable invalid ones
      const validSchedulers = await this.validateAndCleanupSchedulers(enabledSchedulers)

      for (const scheduler of validSchedulers) {
        await this.startJob(scheduler.id, scheduler.cron_expression, scheduler.timezone || 'Asia/Shanghai')
      }

      // Clean up old logs on startup
      await this.cleanupOldLogs()

      // Schedule daily cleanup at 3:00 AM
      this.cleanupJob = new CronJob(
        '0 0 3 * * *',
        async () => {
          logger.info('Running scheduled log cleanup')
          await this.cleanupOldLogs()
        },
        null,
        true,
        'Asia/Shanghai'
      )

      this.isInitialized = true

      // Start watchdog to detect missed executions and unhealthy jobs
      this.startWatchdog()

      // Register system resume handler to recover after sleep
      powerMonitorService.registerResumeHandler(() => this.handleSystemResume())

      const disabledCount = enabledSchedulers.length - validSchedulers.length
      logger.info(`SchedulerService initialized with ${validSchedulers.length} jobs`, {
        total: enabledSchedulers.length,
        disabled: disabledCount
      })
    } catch (error) {
      logger.error('Failed to initialize SchedulerService:', error as Error)
      throw error
    }
  }

  /**
   * Create a scheduler
   */
  async createScheduler(data: CreateSchedulerRequest): Promise<SchedulerEntity> {
    // Verify session exists
    const session = await SessionService.getInstance().getSession(data.agent_id, data.session_id)
    if (!session) {
      throw new Error('Session not found')
    }

    const id = `scheduler_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    const now = new Date().toISOString()

    // Calculate next run time
    const nextRunAt = this.calculateNextRun(data.cron_expression, data.timezone || 'Asia/Shanghai')

    const insertData: InsertSchedulerRow = {
      id,
      name: data.name,
      description: data.description || null,
      agent_id: data.agent_id,
      session_id: data.session_id,
      cron_expression: data.cron_expression,
      timezone: data.timezone || 'Asia/Shanghai',
      message_content: data.message_content,
      enabled: data.enabled ?? true,
      close_on_trigger: data.close_on_trigger ?? false,
      delete_on_trigger: data.delete_on_trigger ?? false,
      last_run_at: null,
      next_run_at: nextRunAt?.toISOString() || null,
      created_by: 'ai',
      created_at: now,
      updated_at: now
    }

    const database = await this.getDatabase()
    await database.insert(schedulersTable).values(insertData)

    // Start job if enabled
    if (data.enabled !== false) {
      await this.startJob(id, data.cron_expression, data.timezone || 'Asia/Shanghai')
    }

    const result = await this.getScheduler(id)
    if (!result) throw new Error('Failed to create scheduler')

    logger.info('Scheduler created', { id, name: data.name })
    return result
  }

  /**
   * Get a scheduler by ID
   */
  async getScheduler(id: string): Promise<SchedulerEntity | null> {
    const database = await this.getDatabase()
    const result = await database.select().from(schedulersTable).where(eq(schedulersTable.id, id)).limit(1)
    return result[0] ? this.deserializeScheduler(result[0]) : null
  }

  /**
   * List schedulers with pagination
   */
  async listSchedulers(options: ListSchedulersOptions = {}): Promise<{ schedulers: SchedulerEntity[]; total: number }> {
    const database = await this.getDatabase()

    // Build base query
    const baseQuery = database.select().from(schedulersTable)

    // Apply filters and get results
    let results: SchedulerRow[]
    let totalResult: { count: number }[]

    if (options.agent_id && options.enabled !== undefined) {
      results = await baseQuery
        .where(and(eq(schedulersTable.agent_id, options.agent_id), eq(schedulersTable.enabled, options.enabled)))
        .orderBy(desc(schedulersTable.created_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database
        .select({ count: count() })
        .from(schedulersTable)
        .where(and(eq(schedulersTable.agent_id, options.agent_id), eq(schedulersTable.enabled, options.enabled)))
    } else if (options.agent_id) {
      results = await baseQuery
        .where(eq(schedulersTable.agent_id, options.agent_id))
        .orderBy(desc(schedulersTable.created_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database
        .select({ count: count() })
        .from(schedulersTable)
        .where(eq(schedulersTable.agent_id, options.agent_id))
    } else if (options.enabled !== undefined) {
      results = await baseQuery
        .where(eq(schedulersTable.enabled, options.enabled))
        .orderBy(desc(schedulersTable.created_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database
        .select({ count: count() })
        .from(schedulersTable)
        .where(eq(schedulersTable.enabled, options.enabled))
    } else {
      results = await baseQuery
        .orderBy(desc(schedulersTable.created_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database.select({ count: count() }).from(schedulersTable)
    }

    return {
      schedulers: results.map((r) => this.deserializeScheduler(r)),
      total: totalResult[0].count
    }
  }

  /**
   * Update a scheduler
   */
  async updateScheduler(id: string, updates: Partial<CreateSchedulerRequest>): Promise<SchedulerEntity | null> {
    const existing = await this.getScheduler(id)
    if (!existing) return null

    const now = new Date().toISOString()
    const updateData: Partial<InsertSchedulerRow> = {
      updated_at: now
    }

    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.cron_expression !== undefined) {
      updateData.cron_expression = updates.cron_expression
      updateData.next_run_at = this.calculateNextRun(
        updates.cron_expression,
        updates.timezone || existing.timezone
      )?.toISOString()
    }
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone
    if (updates.message_content !== undefined) updateData.message_content = updates.message_content
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled
    if (updates.close_on_trigger !== undefined) updateData.close_on_trigger = updates.close_on_trigger
    if (updates.delete_on_trigger !== undefined) updateData.delete_on_trigger = updates.delete_on_trigger

    const database = await this.getDatabase()
    await database.update(schedulersTable).set(updateData).where(eq(schedulersTable.id, id))

    // Restart job if cron or timezone changed
    if (updates.cron_expression || updates.timezone) {
      await this.stopJob(id)
      if (updates.enabled !== false && existing.enabled) {
        const newCron = updates.cron_expression || existing.cron_expression
        const newTz = updates.timezone || existing.timezone
        await this.startJob(id, newCron, newTz)
      }
    }

    // Handle enable/disable
    if (updates.enabled !== undefined && updates.enabled !== existing.enabled) {
      if (updates.enabled) {
        await this.startJob(id, existing.cron_expression, existing.timezone)
      } else {
        await this.stopJob(id)
      }
    }

    return await this.getScheduler(id)
  }

  /**
   * Delete a scheduler
   */
  async deleteScheduler(id: string): Promise<boolean> {
    await this.stopJob(id)

    const database = await this.getDatabase()
    const result = await database.delete(schedulersTable).where(eq(schedulersTable.id, id))

    logger.info('Scheduler deleted', { id })
    return result.rowsAffected > 0
  }

  /**
   * Toggle scheduler enabled status
   */
  async toggleScheduler(id: string, enabled: boolean): Promise<SchedulerEntity | null> {
    return await this.updateScheduler(id, { enabled })
  }

  /**
   * Manually trigger a scheduler execution
   */
  async triggerScheduler(id: string): Promise<void> {
    logger.info('Manually triggering scheduler', { id })
    await this.executeJob(id)
  }

  /**
   * List scheduler logs with pagination
   */
  async listLogs(options: ListSchedulerLogsOptions = {}): Promise<{ logs: SchedulerLogEntity[]; total: number }> {
    const database = await this.getDatabase()

    // Build base query
    const baseQuery = database.select().from(schedulerLogsTable)

    // Apply filters and get results
    let results: any[]
    let totalResult: { count: number }[]

    if (options.scheduler_id && options.status) {
      results = await baseQuery
        .where(
          and(eq(schedulerLogsTable.scheduler_id, options.scheduler_id), eq(schedulerLogsTable.status, options.status))
        )
        .orderBy(desc(schedulerLogsTable.triggered_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database
        .select({ count: count() })
        .from(schedulerLogsTable)
        .where(
          and(eq(schedulerLogsTable.scheduler_id, options.scheduler_id), eq(schedulerLogsTable.status, options.status))
        )
    } else if (options.scheduler_id) {
      results = await baseQuery
        .where(eq(schedulerLogsTable.scheduler_id, options.scheduler_id))
        .orderBy(desc(schedulerLogsTable.triggered_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database
        .select({ count: count() })
        .from(schedulerLogsTable)
        .where(eq(schedulerLogsTable.scheduler_id, options.scheduler_id))
    } else if (options.status) {
      results = await baseQuery
        .where(eq(schedulerLogsTable.status, options.status))
        .orderBy(desc(schedulerLogsTable.triggered_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database
        .select({ count: count() })
        .from(schedulerLogsTable)
        .where(eq(schedulerLogsTable.status, options.status))
    } else {
      results = await baseQuery
        .orderBy(desc(schedulerLogsTable.triggered_at))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0)

      totalResult = await database.select({ count: count() }).from(schedulerLogsTable)
    }

    return { logs: results as SchedulerLogEntity[], total: totalResult[0].count }
  }

  /**
   * Clear logs (all or for specific scheduler)
   */
  async clearLogs(schedulerId?: string): Promise<number> {
    const database = await this.getDatabase()

    if (schedulerId) {
      const result = await database.delete(schedulerLogsTable).where(eq(schedulerLogsTable.scheduler_id, schedulerId))
      return result.rowsAffected
    } else {
      const result = await database.delete(schedulerLogsTable)
      return result.rowsAffected
    }
  }

  /**
   * Start a cron job
   */
  private async startJob(id: string, cronExpression: string, timezone: string): Promise<void> {
    if (this.jobs.has(id)) {
      await this.stopJob(id)
    }

    try {
      const job = CronJob.from({
        cronTime: cronExpression,
        onTick: async () => await this.executeJob(id),
        start: true,
        timeZone: timezone,
        errorHandler: (error: unknown) => {
          logger.error('CronJob error', { id, error: error instanceof Error ? error.message : String(error) })
        }
      })

      this.jobs.set(id, { id, job, cronExpression, timezone })
      logger.info('Job started', { id, cronExpression, timezone })
    } catch (error) {
      logger.error('Failed to start job', { id, error: error as Error })
      throw error
    }
  }

  /**
   * Stop a cron job
   */
  private async stopJob(id: string): Promise<void> {
    const scheduledJob = this.jobs.get(id)
    if (scheduledJob) {
      scheduledJob.job.stop()
      this.jobs.delete(id)
      logger.info('Job stopped', { id })
    }
  }

  /**
   * Execute a scheduled job via internal HTTP API
   */
  private async executeJob(id: string): Promise<void> {
    // Concurrent execution guard
    if (this.executingJobs.has(id)) {
      logger.warn('Job already executing, skipping', { id })
      return
    }

    this.executingJobs.add(id)
    try {
      await this.executeJobInternal(id)
    } finally {
      this.executingJobs.delete(id)
    }
  }

  private async executeJobInternal(id: string): Promise<void> {
    const scheduler = await this.getScheduler(id)
    if (!scheduler || !scheduler.enabled) {
      logger.warn('Scheduler not found or disabled, skipping', { id })
      return
    }

    const logId = await this.createLog(id, 'running')
    const startTime = Date.now()

    try {
      logger.info('Executing scheduled job', { id, name: scheduler.name })

      // Get API server config
      const apiConfig = await apiConfigService.get()

      // Send message via internal HTTP API with timeout and retry
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort('Scheduler execution timeout')
      }, EXECUTION_TIMEOUT_MS)

      try {
        const response = await withRetry(
          async () => {
            const res = await fetch(
              `http://localhost:${apiConfig.port}/internal/sessions/${scheduler.agent_id}/${scheduler.session_id}/messages`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: scheduler.message_content }),
                signal: controller.signal
              }
            )

            if (!res.ok) {
              const body = await res.text()
              const error = new Error(`HTTP ${res.status}: ${body}`)
              // Only retry on 5xx; 4xx should fail immediately
              if (res.status >= 500) {
                ;(error as any).retryable = true
              }
              throw error
            }

            return res
          },
          {
            maxAttempts: 3,
            baseDelayMs: 2000,
            maxDelayMs: 10000,
            retryableCheck: (error: unknown) => {
              if (isTransientNetworkError(error)) return true
              if (error && typeof error === 'object' && 'retryable' in error) {
                return !!(error as any).retryable
              }
              return false
            }
          }
        )

        // Read SSE stream and collect response preview
        let responsePreview = ''
        const reader = response.body?.getReader()
        if (reader) {
          const decoder = new TextDecoder()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value)
            // Parse SSE data lines
            const lines = text.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.type === 'done' && data.response_preview) {
                    responsePreview = data.response_preview
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        }

        clearTimeout(timeoutId)

        // Update log as success
        await this.updateLog(logId, {
          status: 'success',
          completed_at: new Date().toISOString(),
          message_sent: true,
          response_preview: responsePreview,
          duration_ms: Date.now() - startTime
        })

        // Update scheduler execution times
        const database = await this.getDatabase()
        const nextRunAt = this.calculateNextRun(scheduler.cron_expression, scheduler.timezone)
        await database
          .update(schedulersTable)
          .set({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt?.toISOString() || null,
            updated_at: new Date().toISOString()
          })
          .where(eq(schedulersTable.id, id))

        // Handle close_on_trigger: disable the scheduler after execution
        if (scheduler.close_on_trigger) {
          await this.stopJob(id)
          await database
            .update(schedulersTable)
            .set({
              enabled: false,
              updated_at: new Date().toISOString()
            })
            .where(eq(schedulersTable.id, id))
          logger.info('Scheduler disabled after trigger (close_on_trigger)', { id })
        }

        // Handle delete_on_trigger: delete the scheduler after execution
        if (scheduler.delete_on_trigger) {
          await this.deleteScheduler(id)
          logger.info('Scheduler deleted after trigger (delete_on_trigger)', { id })
        }

        logger.info('Job executed successfully', { id, durationMs: Date.now() - startTime })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      await this.updateLog(logId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        message_sent: false,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime
      })

      // Always advance next_run_at even on failure, so the watchdog doesn't
      // continuously re-trigger the same missed window.
      try {
        const database = await this.getDatabase()
        const nextRunAt = this.calculateNextRun(scheduler.cron_expression, scheduler.timezone)
        await database
          .update(schedulersTable)
          .set({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt?.toISOString() || null,
            updated_at: new Date().toISOString()
          })
          .where(eq(schedulersTable.id, id))
      } catch (dbError) {
        logger.error('Failed to update next_run_at after job failure', {
          id,
          error: dbError instanceof Error ? dbError.message : String(dbError)
        })
      }

      logger.error('Job execution failed', { id, error: errorMessage })
    }
  }

  /**
   * Create execution log
   */
  private async createLog(schedulerId: string, status: string): Promise<number> {
    const database = await this.getDatabase()
    const result = await database
      .insert(schedulerLogsTable)
      .values({
        scheduler_id: schedulerId,
        triggered_at: new Date().toISOString(),
        status,
        created_at: new Date().toISOString()
      } as InsertSchedulerLogRow)
      .returning({ id: schedulerLogsTable.id })

    return result[0].id
  }

  /**
   * Update execution log
   */
  private async updateLog(logId: number, updates: Partial<InsertSchedulerLogRow>): Promise<void> {
    const database = await this.getDatabase()
    await database.update(schedulerLogsTable).set(updates).where(eq(schedulerLogsTable.id, logId))
  }

  /**
   * Validate enabled schedulers on startup and disable invalid ones
   */
  private async validateAndCleanupSchedulers(schedulers: SchedulerRow[]): Promise<SchedulerRow[]> {
    const database = await this.getDatabase()
    const now = new Date()
    const validSchedulers: SchedulerRow[] = []

    for (const scheduler of schedulers) {
      const reason = await this.getInvalidReason(scheduler, now)
      if (reason) {
        const nowIso = new Date().toISOString()
        await database
          .update(schedulersTable)
          .set({ enabled: false, updated_at: nowIso })
          .where(eq(schedulersTable.id, scheduler.id))

        await database.insert(schedulerLogsTable).values({
          scheduler_id: scheduler.id,
          triggered_at: nowIso,
          completed_at: nowIso,
          status: 'failed',
          message_sent: false,
          error_message: `Auto-disabled on startup: ${reason}`,
          duration_ms: 0,
          created_at: nowIso
        } as InsertSchedulerLogRow)

        logger.warn('Scheduler auto-disabled on startup', { id: scheduler.id, name: scheduler.name, reason })
      } else {
        validSchedulers.push(scheduler)
      }
    }

    return validSchedulers
  }

  /**
   * Check if a scheduler is invalid and return the reason, or null if valid
   */
  private async getInvalidReason(scheduler: SchedulerRow, now: Date): Promise<string | null> {
    // Rule 1: One-time task with expired next_run_at
    if (scheduler.close_on_trigger && scheduler.next_run_at) {
      if (new Date(scheduler.next_run_at) < now) {
        return 'One-time task expired: next_run_at is in the past'
      }
    }

    // Rule 2: Cron expression cannot produce future trigger time
    const nextRun = this.calculateNextRun(scheduler.cron_expression, scheduler.timezone || 'Asia/Shanghai')
    if (!nextRun) {
      return 'Invalid cron expression: cannot calculate next run time'
    }

    // Rule 3: Associated session no longer exists
    try {
      const session = await SessionService.getInstance().getSession(scheduler.agent_id, scheduler.session_id)
      if (!session) {
        return `Associated session not found: agent_id=${scheduler.agent_id}, session_id=${scheduler.session_id}`
      }
    } catch {
      return `Failed to validate session: agent_id=${scheduler.agent_id}, session_id=${scheduler.session_id}`
    }

    return null
  }

  /**
   * Clean up logs older than retention period
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS)

      const database = await this.getDatabase()
      const result = await database
        .delete(schedulerLogsTable)
        .where(lte(schedulerLogsTable.created_at, cutoffDate.toISOString()))

      if (result.rowsAffected > 0) {
        logger.info(`Cleaned up ${result.rowsAffected} old log entries`)
      }
    } catch (error) {
      logger.error('Failed to cleanup old logs', { error: error as Error })
    }
  }

  /**
   * Calculate next run time from cron expression
   */
  private calculateNextRun(cronExpression: string, timezone: string): Date | null {
    try {
      const job = new CronJob(cronExpression, () => {}, null, false, timezone)
      return job.nextDate()?.toJSDate() || null
    } catch {
      return null
    }
  }

  /**
   * Deserialize scheduler row to entity
   */
  private deserializeScheduler(data: SchedulerRow): SchedulerEntity {
    return {
      ...data,
      description: data.description || undefined,
      timezone: data.timezone || 'Asia/Shanghai',
      close_on_trigger: data.close_on_trigger ?? false,
      delete_on_trigger: data.delete_on_trigger ?? false,
      last_run_at: data.last_run_at || undefined,
      next_run_at: data.next_run_at || undefined
    } as SchedulerEntity
  }

  /**
   * Start watchdog timer that periodically checks job health and missed executions
   */
  private startWatchdog(): void {
    this.watchdogTimer = setInterval(async () => {
      try {
        await this.checkJobHealth()
        await this.checkMissedExecutions()
      } catch (error) {
        logger.error('Watchdog error', { error: error instanceof Error ? error.message : String(error) })
      }
    }, WATCHDOG_INTERVAL_MS)
    logger.info('Watchdog started', { intervalMs: WATCHDOG_INTERVAL_MS })
  }

  /**
   * Check that all enabled schedulers have active CronJobs; restart any that are missing or inactive
   */
  private async checkJobHealth(): Promise<void> {
    const database = await this.getDatabase()
    const enabledSchedulers = await database.select().from(schedulersTable).where(eq(schedulersTable.enabled, true))

    for (const scheduler of enabledSchedulers) {
      const scheduledJob = this.jobs.get(scheduler.id)
      if (!scheduledJob || !scheduledJob.job.isActive) {
        logger.warn('Watchdog: restarting unhealthy job', {
          id: scheduler.id,
          name: scheduler.name,
          hadJob: !!scheduledJob,
          wasActive: scheduledJob?.job.isActive ?? false
        })
        await this.startJob(scheduler.id, scheduler.cron_expression, scheduler.timezone || 'Asia/Shanghai')
      }
    }
  }

  /**
   * Check for schedulers whose next_run_at has passed beyond the grace period and trigger them
   */
  private async checkMissedExecutions(): Promise<void> {
    const database = await this.getDatabase()
    const cutoff = new Date(Date.now() - MISSED_EXECUTION_GRACE_MS).toISOString()

    // Match schedulers whose next_run_at is overdue OR is NULL (orphaned state)
    const missedSchedulers = await database
      .select()
      .from(schedulersTable)
      .where(
        and(
          eq(schedulersTable.enabled, true),
          or(lte(schedulersTable.next_run_at, cutoff), isNull(schedulersTable.next_run_at))
        )
      )

    for (const scheduler of missedSchedulers) {
      if (this.executingJobs.has(scheduler.id)) {
        continue
      }

      logger.warn('Watchdog: detected missed execution, triggering now', {
        id: scheduler.id,
        name: scheduler.name,
        missedAt: scheduler.next_run_at
      })

      // Fire and forget — executeJob has its own error handling
      this.executeJob(scheduler.id).catch((error) => {
        logger.error('Watchdog: missed execution recovery failed', {
          id: scheduler.id,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }
  }

  /**
   * Handle system resume from sleep — restart inactive jobs and catch up missed executions
   */
  private async handleSystemResume(): Promise<void> {
    logger.info('System resumed from sleep, checking scheduler health')

    try {
      await this.checkJobHealth()
      await this.checkMissedExecutions()
      logger.info('System resume recovery completed')
    } catch (error) {
      logger.error('System resume recovery failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Cleanup all jobs (called on app shutdown)
   */
  async shutdown(): Promise<void> {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
    for (const [id] of this.jobs) {
      await this.stopJob(id)
    }
    if (this.cleanupJob) {
      this.cleanupJob.stop()
      this.cleanupJob = null
    }
    this.isInitialized = false
    logger.info('SchedulerService shutdown complete')
  }
}

export const schedulerService = SchedulerService.getInstance()
