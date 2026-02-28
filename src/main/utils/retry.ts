import { loggerService } from '@logger'

const logger = loggerService.withContext('retry')

export interface RetryOptions {
  /** Maximum number of attempts (including the first try). Default: 3 */
  maxAttempts: number
  /** Base delay in ms before the first retry. Default: 2000 */
  baseDelayMs: number
  /** Maximum delay cap in ms. Default: 10000 */
  maxDelayMs: number
  /** Multiplier applied to delay after each retry. Default: 2 */
  backoffFactor: number
  /** Optional predicate – return true if the error is retryable. Defaults to isTransientNetworkError. */
  retryableCheck?: (error: unknown) => boolean
  /** Called before each retry with the attempt number (1-based) and the error. */
  onRetry?: (attempt: number, error: unknown) => void
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 10000,
  backoffFactor: 2
}

/**
 * Checks whether an error looks like a transient network issue that is
 * worth retrying (DNS hiccups, proxy flickers, connection resets, rate-limits…).
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true // fetch() itself throws TypeError on network failure

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    const transientPatterns = [
      'fetch failed',
      'socketerror',
      'econnreset',
      'etimedout',
      'econnrefused',
      'socket hang up',
      'network',
      'enotfound',
      'epipe'
    ]
    if (transientPatterns.some((p) => msg.includes(p))) return true

    // HTTP 429 Too Many Requests
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return true
  }

  return false
}

/**
 * Execute `fn` with automatic retries on transient failures.
 *
 * By default only retries on network-like errors (see `isTransientNetworkError`).
 * Pass a custom `retryableCheck` to override.
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options }
  const retryable = opts.retryableCheck ?? isTransientNetworkError

  let lastError: unknown
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= opts.maxAttempts || !retryable(error)) {
        throw error
      }

      const delay = Math.min(opts.baseDelayMs * opts.backoffFactor ** (attempt - 1), opts.maxDelayMs)
      logger.warn('Retrying after transient error', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error)
      })

      opts.onRetry?.(attempt, error)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw lastError
}
