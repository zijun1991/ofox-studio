/**
 * Scheduler Types for Renderer Process
 */

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

export interface SchedulerListResponse {
  schedulers: SchedulerEntity[]
  total: number
}

export interface SchedulerLogListResponse {
  logs: SchedulerLogEntity[]
  total: number
}

// Cron preset templates
export interface CronPreset {
  label: string
  description: string
  expression: string
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', description: 'Runs every minute', expression: '0 * * * * *' },
  { label: 'Every hour', description: 'Runs at the start of every hour', expression: '0 0 * * * *' },
  { label: 'Every day at 9:00', description: 'Runs daily at 9:00 AM', expression: '0 0 9 * * *' },
  { label: 'Every weekday at 9:00', description: 'Runs Mon-Fri at 9:00 AM', expression: '0 0 9 * * 1-5' },
  { label: 'Every Monday at 9:00', description: 'Runs every Monday at 9:00 AM', expression: '0 0 9 * * 1' },
  { label: 'Every month on 1st', description: 'Runs on the 1st of every month at 0:00', expression: '0 0 0 1 * *' }
]

// Timezone options
export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5/-4)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8/-7)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1/+2)' },
  { value: 'UTC', label: 'UTC' }
]
