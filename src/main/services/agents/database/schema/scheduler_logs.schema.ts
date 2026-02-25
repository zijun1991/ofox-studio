/**
 * Scheduler logs table schema
 * Stores execution logs for scheduled tasks
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const schedulerLogsTable = sqliteTable('scheduler_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scheduler_id: text('scheduler_id').notNull(),

  // Execution info
  triggered_at: text('triggered_at').notNull(), // Trigger time
  completed_at: text('completed_at'), // Completion time

  // Execution status
  status: text('status').notNull(), // 'pending' | 'running' | 'success' | 'failed' | 'timeout'

  // Result
  message_sent: integer('message_sent', { mode: 'boolean' }).default(false), // Was message sent successfully
  error_message: text('error_message'), // Error message
  response_preview: text('response_preview'), // AI response preview (truncated)

  // Duration (milliseconds)
  duration_ms: integer('duration_ms'),

  created_at: text('created_at').notNull()
})

// Indexes
export const schedulerLogsSchedulerIdx = index('idx_scheduler_logs_scheduler_id').on(schedulerLogsTable.scheduler_id)
export const schedulerLogsStatusIdx = index('idx_scheduler_logs_status').on(schedulerLogsTable.status)
export const schedulerLogsTriggeredAtIdx = index('idx_scheduler_logs_triggered_at').on(schedulerLogsTable.triggered_at)

export type SchedulerLogRow = typeof schedulerLogsTable.$inferSelect
export type InsertSchedulerLogRow = typeof schedulerLogsTable.$inferInsert
