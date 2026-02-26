/**
 * Scheduler table schema
 * Stores scheduled tasks that trigger messages to agent sessions
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const schedulersTable = sqliteTable('schedulers', {
  id: text('id').primaryKey(), // UUID
  name: text('name').notNull(), // Task name
  description: text('description'), // Task description

  // Target configuration
  agent_id: text('agent_id').notNull(), // Target Agent ID
  session_id: text('session_id').notNull(), // Target Session ID

  // Cron expression (6-field format: second minute hour day month weekday)
  cron_expression: text('cron_expression').notNull(), // e.g., "0 30 9 * * 1-5" = every weekday at 9:30:00
  timezone: text('timezone').default('Asia/Shanghai'), // Timezone

  // Message content
  message_content: text('message_content').notNull(), // Message to send

  // Status
  enabled: integer('enabled', { mode: 'boolean' }).default(true), // Is enabled
  last_run_at: text('last_run_at'), // Last execution time
  next_run_at: text('next_run_at'), // Next execution time

  // Trigger behavior
  close_on_trigger: integer('close_on_trigger', { mode: 'boolean' }).default(false), // Disable after execution
  delete_on_trigger: integer('delete_on_trigger', { mode: 'boolean' }).default(false), // Delete after execution

  // Metadata
  created_by: text('created_by').default('ai'), // Creator: 'ai' | 'user'
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

// Indexes
export const schedulersEnabledIdx = index('idx_schedulers_enabled').on(schedulersTable.enabled)
export const schedulersNextRunIdx = index('idx_schedulers_next_run').on(schedulersTable.next_run_at)
export const schedulersAgentIdx = index('idx_schedulers_agent_id').on(schedulersTable.agent_id)

export type SchedulerRow = typeof schedulersTable.$inferSelect
export type InsertSchedulerRow = typeof schedulersTable.$inferInsert
