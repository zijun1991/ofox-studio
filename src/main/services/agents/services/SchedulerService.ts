import { loggerService } from '@logger'
import type { GetAgentSessionResponse } from '@types'
import { CronJob } from 'cron'
import { and, count, desc, eq, lte } from 'drizzle-orm'

import { BaseService } from '../BaseService'
import type { InsertSchedulerLogRow, InsertSchedulerRow, SchedulerRow } from '../database/schema'
import { schedulerLogsTable, schedulersTable } from '../database/schema'
import { sessionMessageService } from './SessionMessageService'
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

export class SchedulerService extends BaseService {
  private static instance: SchedulerService | null = null
  private jobs: Map<string, ScheduledJob> = new Map()
  private isInitialized = false
  private cleanupJob: CronJob | null = null

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

      for (const scheduler of enabledSchedulers) {
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
      logger.info(`SchedulerService initialized with ${enabledSchedulers.length} jobs`)
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
      const job = new CronJob(
        cronExpression,
        async () => await this.executeJob(id),
        null,
        true, // start
        timezone
      )

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
   * Execute a scheduled job
   */
  private async executeJob(id: string): Promise<void> {
    const scheduler = await this.getScheduler(id)
    if (!scheduler || !scheduler.enabled) {
      logger.warn('Scheduler not found or disabled, skipping', { id })
      return
    }

    const logId = await this.createLog(id, 'running')
    const startTime = Date.now()

    try {
      logger.info('Executing scheduled job', { id, name: scheduler.name })

      // Get session
      const session = await SessionService.getInstance().getSession(scheduler.agent_id, scheduler.session_id)
      if (!session) {
        throw new Error('Session not found')
      }

      // Send message with timeout
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        abortController.abort('Scheduler execution timeout')
      }, EXECUTION_TIMEOUT_MS)

      try {
        const { stream, completion } = await sessionMessageService.createSessionMessage(
          session as GetAgentSessionResponse,
          { content: scheduler.message_content },
          abortController
        )

        // Read stream and collect response
        const reader = stream.getReader()
        let responseText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && 'text' in value) {
            responseText += (value as any).text || ''
          }
        }

        clearTimeout(timeoutId)
        await completion

        // Update log as success
        await this.updateLog(logId, {
          status: 'success',
          completed_at: new Date().toISOString(),
          message_sent: true,
          response_preview: responseText.substring(0, 500),
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
      last_run_at: data.last_run_at || undefined,
      next_run_at: data.next_run_at || undefined
    } as SchedulerEntity
  }

  /**
   * Cleanup all jobs (called on app shutdown)
   */
  async shutdown(): Promise<void> {
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
