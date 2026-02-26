/**
 * Cron Expression Utilities
 */

export interface CronDescription {
  text: string
  params?: Record<string, string | number>
  translateParams?: string[]
  isValid: boolean
}

// Common cron presets
export const CRON_PRESETS = [
  { label: 'scheduler.presets.everyMinute', value: '0 * * * * *' },
  { label: 'scheduler.presets.every5Minutes', value: '0 */5 * * * *' },
  { label: 'scheduler.presets.every30Minutes', value: '0 */30 * * * *' },
  { label: 'scheduler.presets.everyHour', value: '0 0 * * * *' },
  { label: 'scheduler.presets.every6Hours', value: '0 0 */6 * * *' },
  { label: 'scheduler.presets.everyDay', value: '0 0 9 * * *' },
  { label: 'scheduler.presets.everyWeekday', value: '0 0 9 * * 1-5' },
  { label: 'scheduler.presets.everyWeek', value: '0 0 9 * * 1' }
] as const

/**
 * Parse cron expression and return human-readable description
 */
export function parseCronExpression(expression: string): CronDescription {
  if (!expression || !expression.trim()) {
    return { text: '', isValid: false }
  }

  const parts = expression.trim().split(/\s+/)

  // Support both 5-field (standard) and 6-field (with seconds) cron
  if (parts.length !== 5 && parts.length !== 6) {
    return { text: 'scheduler.invalidExpression', isValid: false }
  }

  const hasSeconds = parts.length === 6
  const offset = hasSeconds ? 1 : 0

  const second = hasSeconds ? parts[0] : '0'
  const minute = parts[0 + offset]
  const hour = parts[1 + offset]
  const dayOfMonth = parts[2 + offset]
  const month = parts[3 + offset]
  const dayOfWeek = parts[4 + offset]

  try {
    const description = buildDescription(second, minute, hour, dayOfMonth, month, dayOfWeek, hasSeconds)
    return {
      text: description.text,
      params: description.params,
      translateParams: description.translateParams,
      isValid: true
    }
  } catch {
    return { text: 'scheduler.invalidExpression', isValid: false }
  }
}

interface DescriptionResult {
  text: string
  params?: Record<string, string | number>
  translateParams?: string[]
}

function buildDescription(
  second: string,
  minute: string,
  hour: string,
  dayOfMonth: string,
  month: string,
  dayOfWeek: string,
  hasSeconds: boolean
): DescriptionResult {
  // Simple pattern matching for common cases
  const patterns: Array<{ test: () => boolean; result: () => DescriptionResult }> = [
    // Every minute
    {
      test: () => isEvery(minute) && isEvery(hour) && isEvery(dayOfMonth) && isEvery(month) && isEvery(dayOfWeek),
      result: () =>
        hasSeconds && second !== '*' && second !== '0'
          ? { text: 'scheduler.everyMinuteAtSecond', params: { second: parseNumber(second) } }
          : { text: 'scheduler.everyMinute' }
    },
    // Every hour
    {
      test: () => isAtZero(minute) && isEvery(hour) && isEvery(dayOfMonth) && isEvery(month) && isEvery(dayOfWeek),
      result: () => ({ text: 'scheduler.everyHour' })
    },
    // Daily at specific time
    {
      test: () => !isEvery(dayOfMonth) === false && isEvery(month) && isEvery(dayOfWeek) && isAtZero(dayOfMonth),
      result: () => ({ text: buildTimeDescription(minute, hour, 'scheduler.daily') })
    },
    // Weekly
    {
      test: () => !isEvery(dayOfWeek) && isEvery(dayOfMonth),
      result: () => buildWeeklyDescription(minute, hour, dayOfWeek)
    },
    // Specific day of month
    {
      test: () => !isEvery(dayOfMonth) && isEvery(dayOfWeek),
      result: () => buildMonthlyDescription(minute, hour, dayOfMonth)
    }
  ]

  for (const pattern of patterns) {
    if (pattern.test()) {
      return pattern.result()
    }
  }

  // Default fallback
  return { text: 'scheduler.custom' }
}

function isEvery(field: string): boolean {
  return field === '*' || field === '?'
}

function isAtZero(field: string): boolean {
  return field === '0' || field === '*'
}

function parseNumber(field: string): string {
  if (field === '*') return 'any'
  return field
}

function buildTimeDescription(_minute: string, _hour: string, prefix: string): string {
  // Return the base prefix key - time info will be displayed from cron expression directly
  // This avoids generating dynamic i18n keys with special characters like ":"
  return prefix
}

function buildWeeklyDescription(_minute: string, _hour: string, dayOfWeek: string): DescriptionResult {
  const dayKeys = [
    'scheduler.sunday',
    'scheduler.monday',
    'scheduler.tuesday',
    'scheduler.wednesday',
    'scheduler.thursday',
    'scheduler.friday',
    'scheduler.saturday'
  ]

  if (dayOfWeek.includes('-')) {
    const [start, end] = dayOfWeek.split('-').map(Number)
    const startKey = dayKeys[start] || 'scheduler.weekday'
    const endKey = dayKeys[end] || 'scheduler.weekday'
    return {
      text: 'scheduler.everyDayRange',
      params: { start: startKey, end: endKey },
      translateParams: ['start', 'end']
    }
  }

  if (dayOfWeek.includes(',')) {
    return { text: 'scheduler.selectedDays' }
  }

  const dayNum = parseInt(dayOfWeek, 10)
  if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
    const dayKey = dayKeys[dayNum] || 'scheduler.weekday'
    return { text: 'scheduler.everyWeekday', params: { day: dayKey }, translateParams: ['day'] }
  }

  return { text: 'scheduler.weekly' }
}

function buildMonthlyDescription(_minute: string, _hour: string, dayOfMonth: string): DescriptionResult {
  if (dayOfMonth !== '*' && dayOfMonth !== '?') {
    return { text: 'scheduler.monthlyOnDay', params: { day: dayOfMonth } }
  }
  return { text: 'scheduler.monthly' }
}

/**
 * Calculate next run time from cron expression
 * Note: This is a simplified calculation, for accurate results use cron-parser on backend
 */
export function getNextRunTime(_expression: string, _timezone: string = 'Asia/Shanghai'): Date | null {
  // This is a placeholder - actual calculation should be done on the backend
  // The backend SchedulerService.calculateNextRun handles this properly
  return null
}

/**
 * Validate cron expression format
 */
export function validateCronExpression(expression: string): boolean {
  if (!expression || !expression.trim()) {
    return false
  }

  const parts = expression.trim().split(/\s+/)
  return parts.length === 5 || parts.length === 6
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}
