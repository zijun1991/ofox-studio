import { loggerService } from '@logger'
import type { ChannelInboundMessage, ChannelOutboundMessage, TelegramChannelConfig } from '@types'
import type { Dispatcher } from 'undici'

import { BaseChannelConnector, type ConnectorStatus } from './BaseChannelConnector'

const logger = loggerService.withContext('TelegramConnector')

const TELEGRAM_API = 'https://api.telegram.org'

interface TelegramMetadata {
  chatId: number
  messageId: number
  fromId?: number
  fromUsername?: string
  fromFirstName?: string
}

export class TelegramConnector extends BaseChannelConnector {
  private onMessage: ((msg: ChannelInboundMessage) => Promise<void>) | null = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private lastUpdateId = 0
  private abortController: AbortController | null = null
  private customDispatcher: Dispatcher | null = null

  private get telegramConfig(): TelegramChannelConfig | undefined {
    return this.channel.telegramConfig
  }

  private get apiBase(): string {
    return `${TELEGRAM_API}/bot${this.telegramConfig?.botToken}`
  }

  async start(onMessage: (msg: ChannelInboundMessage) => Promise<void>): Promise<void> {
    this.onMessage = onMessage
    const config = this.telegramConfig
    if (!config) {
      throw new Error('Telegram configuration is missing')
    }

    if (!config.botToken) {
      throw new Error('Telegram bot token is required')
    }

    try {
      // Initialize custom proxy dispatcher if configured
      if (this.channel.proxyConfig?.mode === 'custom' && this.channel.proxyConfig.url) {
        const { proxyManager } = await import('../../ProxyManager')
        this.customDispatcher = proxyManager.createDispatcherForProxy(this.channel.proxyConfig.url)
        logger.info('Using custom proxy for Telegram', {
          channelId: this.channel.id,
          proxyUrl: this.channel.proxyConfig.url
        })
      }

      // Verify bot token by calling getMe
      const me = await this.apiCall<{ id: number; first_name: string; username?: string }>('getMe')
      logger.info('Telegram bot authenticated', {
        channelId: this.channel.id,
        botId: me.id,
        botUsername: me.username
      })

      // Start polling
      this._status = 'connected'
      this.schedulePoll()
      logger.info('Telegram connector started', { channelId: this.channel.id })
    } catch (error) {
      this._status = 'error'
      this._errorMessage = error instanceof Error ? error.message : 'Connection failed'
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    if (this.customDispatcher) {
      try {
        await this.customDispatcher.close()
      } catch (error) {
        logger.warn('Failed to close custom dispatcher', { error })
      }
      this.customDispatcher = null
    }

    this.onMessage = null
    this._status = 'disconnected'
    logger.info('Telegram connector stopped', { channelId: this.channel.id })
  }

  async sendResponse(msg: ChannelOutboundMessage): Promise<void> {
    const config = this.telegramConfig
    if (!config) {
      throw new Error('Telegram configuration is missing')
    }

    const meta = msg.metadata as unknown as TelegramMetadata | undefined
    if (!meta?.chatId) {
      logger.warn('No chatId in outbound metadata, cannot send response', { channelId: msg.channelId })
      return
    }

    const params: Record<string, unknown> = {
      chat_id: meta.chatId,
      text: msg.content,
      reply_to_message_id: meta.messageId
    }

    if (config.parseMode) {
      params.parse_mode = config.parseMode
    }

    try {
      await this.apiCall('sendMessage', params)
      logger.info('Telegram response sent', { channelId: msg.channelId, chatId: meta.chatId })
    } catch (error) {
      // If parse_mode fails (e.g. bad markdown), retry without it
      if (config.parseMode && error instanceof Error && error.message.includes("can't parse")) {
        logger.warn('Retrying sendMessage without parse_mode', { channelId: msg.channelId })
        delete params.parse_mode
        await this.apiCall('sendMessage', params)
      } else {
        throw error
      }
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = this.telegramConfig
    if (!config) {
      return { success: false, message: 'Telegram configuration is missing' }
    }

    if (!config.botToken) {
      return { success: false, message: 'Bot token is required' }
    }

    // Track if we created dispatcher just for this test
    let createdDispatcherForTest = false

    try {
      // Initialize custom proxy dispatcher for test if configured
      if (!this.customDispatcher && this.channel.proxyConfig?.mode === 'custom' && this.channel.proxyConfig.url) {
        const { proxyManager } = await import('../../ProxyManager')
        this.customDispatcher = proxyManager.createDispatcherForProxy(this.channel.proxyConfig.url)
        createdDispatcherForTest = true
      }

      const me = await this.apiCall<{ id: number; first_name: string; username?: string }>('getMe')
      return {
        success: true,
        message: `Connected to bot @${me.username || me.first_name} (ID: ${me.id})`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      }
    } finally {
      // Clean up dispatcher if it was created just for this test
      if (createdDispatcherForTest && this.customDispatcher) {
        try {
          await this.customDispatcher.close()
        } catch {
          // Ignore cleanup errors
        }
        this.customDispatcher = null
      }
    }
  }

  getStatus(): ConnectorStatus {
    return this._status
  }

  private schedulePoll(): void {
    if (this._status !== 'connected' || !this.onMessage) return

    const intervalMs = (this.telegramConfig?.pollIntervalSec || 2) * 1000
    logger.debug('Scheduling next poll', { channelId: this.channel.id, intervalMs })

    this.pollTimer = setTimeout(async () => {
      await this.pollForUpdates()
      this.schedulePoll()
    }, intervalMs)
  }

  private async pollForUpdates(): Promise<void> {
    if (!this.onMessage) return

    const pollStartTime = Date.now()
    logger.debug('Starting poll for updates', {
      channelId: this.channel.id,
      lastUpdateId: this.lastUpdateId
    })

    try {
      this.abortController = new AbortController()

      const updates = await this.apiCall<TelegramUpdate[]>(
        'getUpdates',
        {
          offset: this.lastUpdateId + 1,
          timeout: 30,
          allowed_updates: ['message']
        },
        this.abortController.signal
      )

      const pollDuration = Date.now() - pollStartTime
      logger.debug('Poll completed', {
        channelId: this.channel.id,
        updateCount: updates.length,
        pollDurationMs: pollDuration,
        lastUpdateId: this.lastUpdateId
      })

      for (const update of updates) {
        this.lastUpdateId = update.update_id

        if (!update.message?.text) {
          logger.debug('Skipping non-text update', {
            channelId: this.channel.id,
            updateId: update.update_id,
            hasMessage: !!update.message,
            hasText: !!update.message?.text
          })
          continue
        }

        const chatId = update.message.chat.id
        const config = this.telegramConfig

        // Filter by allowed chat IDs if configured
        if (config?.allowedChatIds?.length && !config.allowedChatIds.includes(chatId)) {
          logger.debug('Ignoring message from non-allowed chat', { channelId: this.channel.id, chatId })
          continue
        }

        logger.info('Received Telegram message', {
          channelId: this.channel.id,
          chatId,
          from: update.message.from?.username || update.message.from?.first_name,
          textLength: update.message.text.length
        })

        const metadata: TelegramMetadata = {
          chatId,
          messageId: update.message.message_id,
          fromId: update.message.from?.id,
          fromUsername: update.message.from?.username,
          fromFirstName: update.message.from?.first_name
        }

        const inbound: ChannelInboundMessage = {
          channelId: this.channel.id,
          channelType: 'telegram',
          content: update.message.text,
          metadata: metadata as unknown as Record<string, unknown>,
          receivedAt: new Date(update.message.date * 1000).toISOString()
        }

        await this.onMessage(inbound)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return // Expected on stop
      }

      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error && error.message.includes('fetch failed')) ||
        (error instanceof Error && error.message.includes('SocketError'))

      if (isNetworkError) {
        // Don't set error status for transient network issues, just log and retry
        logger.warn('Temporary network error polling Telegram, will retry', {
          channelId: this.channel.id,
          error: error instanceof Error ? error.message : 'Unknown network error'
        })
        // Reset status to connected so polling continues
        this._status = 'connected'
      } else {
        logger.error('Error polling Telegram updates', { channelId: this.channel.id, error })
        this._status = 'error'
        this._errorMessage = error instanceof Error ? error.message : 'Poll failed'
      }
    } finally {
      this.abortController = null
    }
  }

  private async apiCall<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const url = `${this.apiBase}/${method}`
    const callStartTime = Date.now()

    logger.debug('Making Telegram API call', {
      channelId: this.channel.id,
      method,
      params: params ? { ...params, timeout: params.timeout } : undefined
    })

    try {
      const fetchOptions: RequestInit & { dispatcher?: Dispatcher } = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: params ? JSON.stringify(params) : undefined,
        signal
      }

      if (this.customDispatcher) {
        fetchOptions.dispatcher = this.customDispatcher
      }

      const response = await fetch(url, fetchOptions)

      const callDuration = Date.now() - callStartTime
      logger.debug('Telegram API call completed', {
        channelId: this.channel.id,
        method,
        callDurationMs: callDuration,
        status: response.status
      })

      const data = (await response.json()) as { ok: boolean; result: T; description?: string }

      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`)
      }

      return data.result
    } catch (error) {
      const callDuration = Date.now() - callStartTime
      logger.error('Telegram API call failed', {
        channelId: this.channel.id,
        method,
        callDurationMs: callDuration,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }
}

// Telegram Bot API types (minimal subset)
interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    date: number
    text?: string
    chat: {
      id: number
      type: string
      title?: string
      username?: string
      first_name?: string
    }
    from?: {
      id: number
      is_bot: boolean
      first_name: string
      username?: string
    }
  }
}
