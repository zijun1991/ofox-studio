import { loggerService } from '@logger'
import type { ChannelInboundMessage, ChannelOutboundMessage, CoworkerChannelConfig } from '@types'

import { BaseChannelConnector } from './BaseChannelConnector'

const logger = loggerService.withContext('CoworkerConnector')

const PING_INTERVAL_MS = 30_000

interface CoworkerTicket {
  id: number
  title: string
  description?: string
  ticket_type?: string
  priority?: string
  status?: string
  created_by?: { id: number; username: string }
  assigned_to?: { id: number; username: string } | null
  watchers?: { id: number; username: string }[]
}

interface CoworkerTicketEvent {
  type: string
  data: {
    ticket: CoworkerTicket
    changes?: Record<string, { old: unknown; new: unknown }>
    comment?: { content: string; created_by: { id: number; username: string } }
    attachment?: { filename: string; uploaded_by: { id: number; username: string } }
  }
}

interface CoworkerUserStatusEvent {
  type: string
  data: Record<string, unknown>
}

export class CoworkerConnector extends BaseChannelConnector {
  private ticketWs: WebSocket | null = null
  private userStatusWs: WebSocket | null = null

  private ticketReconnectCount = 0
  private ticketReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private userStatusReconnectCount = 0
  private userStatusReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isStopping = false

  private ticketPingTimer: ReturnType<typeof setInterval> | null = null
  private userStatusPingTimer: ReturnType<typeof setInterval> | null = null

  private onMessageCb: ((msg: ChannelInboundMessage) => Promise<void>) | null = null

  private currentUserId = 0
  private currentUsername = ''

  private get coworkerConfig(): CoworkerChannelConfig | undefined {
    return this.channel.coworkerConfig
  }

  private get baseUrl(): string {
    return this.coworkerConfig?.baseUrl || 'http://192.168.0.51:8003'
  }

  private get token(): string {
    return this.coworkerConfig?.token || ''
  }

  async start(onMessage: (msg: ChannelInboundMessage) => Promise<void>): Promise<void> {
    this.onMessageCb = onMessage
    this.isStopping = false
    const config = this.coworkerConfig

    if (!config) {
      throw new Error('Coworker configuration is missing')
    }
    if (!config.token?.trim()) {
      throw new Error('Coworker token is required')
    }

    try {
      // Verify token and get current user info
      const userInfo = await this.apiCall<{ id: number; username: string }>('GET', '/user-statuses/me/')
      this.currentUserId = userInfo.id
      this.currentUsername = userInfo.username
      logger.info('Coworker user authenticated', {
        channelId: this.channel.id,
        userId: this.currentUserId,
        username: this.currentUsername
      })

      // Connect ticket WebSocket
      this.connectTicketWs()

      // Optionally connect user-status WebSocket
      if (config.enableUserStatusEvents) {
        this.connectUserStatusWs()
      }

      this._status = 'connected'
      logger.info('Coworker connector started', { channelId: this.channel.id })
    } catch (error) {
      this._status = 'error'
      this._errorMessage = error instanceof Error ? error.message : 'Connection failed'
      throw error
    }
  }

  async stop(): Promise<void> {
    this.isStopping = true

    // Clear all timers
    if (this.ticketReconnectTimer) {
      clearTimeout(this.ticketReconnectTimer)
      this.ticketReconnectTimer = null
    }
    if (this.userStatusReconnectTimer) {
      clearTimeout(this.userStatusReconnectTimer)
      this.userStatusReconnectTimer = null
    }
    this.stopPing('ticket')
    this.stopPing('userStatus')

    // Close WebSockets
    if (this.ticketWs) {
      this.ticketWs.close()
      this.ticketWs = null
    }
    if (this.userStatusWs) {
      this.userStatusWs.close()
      this.userStatusWs = null
    }

    this.onMessageCb = null
    this._status = 'disconnected'
    logger.info('Coworker connector stopped', { channelId: this.channel.id })
  }

  async sendResponse(msg: ChannelOutboundMessage): Promise<void> {
    const ticketId = msg.metadata?.ticketId as number | undefined
    if (!ticketId) {
      logger.warn('No ticketId in outbound metadata, cannot send response', { channelId: msg.channelId })
      return
    }

    await this.apiCall('POST', `/tickets/tickets/${ticketId}/comments/`, { content: msg.content })
    logger.info('Comment posted to Coworker ticket', {
      channelId: msg.channelId,
      ticketId
    })
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = this.coworkerConfig
    if (!config) {
      return { success: false, message: 'Coworker configuration is missing' }
    }
    if (!config.token?.trim()) {
      return { success: false, message: 'Token is required' }
    }

    try {
      const userInfo = await this.apiCall<{ id: number; username: string }>('GET', '/user-statuses/me/')
      return {
        success: true,
        message: `Connected as ${userInfo.username} (ID: ${userInfo.id})`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      }
    }
  }

  // --- WebSocket management ---

  private connectTicketWs(): void {
    if (!this.coworkerConfig || this.isStopping) return

    const wsUrl = this.buildWsUrl('/ws/tickets/events/')
    logger.debug('Connecting ticket WebSocket', { channelId: this.channel.id, url: wsUrl })

    const ws = new WebSocket(wsUrl)
    this.ticketWs = ws

    ws.addEventListener('open', () => {
      this.ticketReconnectCount = 0
      this._status = 'connected'
      this.startPing(ws, 'ticket')
      logger.info('Ticket WebSocket connected', { channelId: this.channel.id })
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data))
        if (parsed.type === 'pong') return
        this.handleTicketEvent(parsed as CoworkerTicketEvent)
      } catch (error) {
        logger.warn('Failed to parse ticket WS message', { channelId: this.channel.id, error })
      }
    })

    ws.addEventListener('close', () => {
      this.stopPing('ticket')
      if (!this.isStopping) {
        this.scheduleReconnect('ticket')
      }
    })

    ws.addEventListener('error', () => {
      logger.error('Ticket WebSocket error', { channelId: this.channel.id })
    })
  }

  private connectUserStatusWs(): void {
    if (!this.coworkerConfig || this.isStopping) return

    const wsUrl = this.buildWsUrl('/ws/user-statuses/events/')
    logger.debug('Connecting user-status WebSocket', { channelId: this.channel.id, url: wsUrl })

    const ws = new WebSocket(wsUrl)
    this.userStatusWs = ws

    ws.addEventListener('open', () => {
      this.userStatusReconnectCount = 0
      this.startPing(ws, 'userStatus')
      logger.info('User-status WebSocket connected', { channelId: this.channel.id })
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data))
        if (parsed.type === 'pong') return
        this.handleUserStatusEvent(parsed as CoworkerUserStatusEvent)
      } catch (error) {
        logger.warn('Failed to parse user-status WS message', { channelId: this.channel.id, error })
      }
    })

    ws.addEventListener('close', () => {
      this.stopPing('userStatus')
      if (!this.isStopping) {
        this.scheduleReconnect('userStatus')
      }
    })

    ws.addEventListener('error', () => {
      logger.error('User-status WebSocket error', { channelId: this.channel.id })
    })
  }

  private scheduleReconnect(wsType: 'ticket' | 'userStatus'): void {
    if (this.isStopping) return

    const config = this.coworkerConfig
    if (!config) return

    const count = wsType === 'ticket' ? ++this.ticketReconnectCount : ++this.userStatusReconnectCount
    const maxAttempts = config.maxReconnectAttempts

    if (maxAttempts > 0 && count > maxAttempts) {
      this._status = 'error'
      this._errorMessage = `${wsType} WebSocket max reconnect attempts exceeded`
      logger.error(this._errorMessage, { channelId: this.channel.id, count })
      return
    }

    const baseDelay = (config.reconnectIntervalSec || 5) * 1000
    const delay = Math.min(baseDelay * Math.pow(2, count - 1), 60_000) + Math.random() * 1000

    logger.info(`Scheduling ${wsType} WebSocket reconnect`, {
      channelId: this.channel.id,
      attempt: count,
      delayMs: Math.round(delay)
    })

    const timer = setTimeout(() => {
      if (this.isStopping) return
      if (wsType === 'ticket') {
        this.connectTicketWs()
      } else {
        this.connectUserStatusWs()
      }
    }, delay)

    if (wsType === 'ticket') {
      this.ticketReconnectTimer = timer
    } else {
      this.userStatusReconnectTimer = timer
    }
  }

  private startPing(ws: WebSocket, wsType: 'ticket' | 'userStatus'): void {
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, PING_INTERVAL_MS)

    if (wsType === 'ticket') {
      this.ticketPingTimer = timer
    } else {
      this.userStatusPingTimer = timer
    }
  }

  private stopPing(wsType: 'ticket' | 'userStatus'): void {
    if (wsType === 'ticket' && this.ticketPingTimer) {
      clearInterval(this.ticketPingTimer)
      this.ticketPingTimer = null
    } else if (wsType === 'userStatus' && this.userStatusPingTimer) {
      clearInterval(this.userStatusPingTimer)
      this.userStatusPingTimer = null
    }
  }

  // --- Event handling ---

  private async handleTicketEvent(event: CoworkerTicketEvent): Promise<void> {
    if (!this.onMessageCb) return

    const ticket = event.data?.ticket
    if (!ticket) return

    // Filter: only process events related to current user
    const isCreator = ticket.created_by?.id === this.currentUserId
    const isAssignee = ticket.assigned_to?.id === this.currentUserId
    const isWatcher = ticket.watchers?.some((w) => w.id === this.currentUserId) ?? false

    if (!isCreator && !isAssignee && !isWatcher) {
      logger.debug('Skipping unrelated ticket event', {
        channelId: this.channel.id,
        ticketId: ticket.id,
        eventType: event.type
      })
      return
    }

    const content = this.formatTicketEvent(event)
    if (!content) return

    const inbound: ChannelInboundMessage = {
      channelId: this.channel.id,
      channelType: 'coworker',
      content,
      metadata: {
        eventType: event.type,
        ticketId: ticket.id,
        ticketTitle: ticket.title
      },
      receivedAt: new Date().toISOString()
    }

    try {
      await this.onMessageCb(inbound)
    } catch (error) {
      logger.error('Failed to process ticket event', { channelId: this.channel.id, error })
    }
  }

  private async handleUserStatusEvent(event: CoworkerUserStatusEvent): Promise<void> {
    if (!this.onMessageCb) return

    const content = `[Coworker] User status event: ${JSON.stringify(event.data)}`
    const inbound: ChannelInboundMessage = {
      channelId: this.channel.id,
      channelType: 'coworker',
      content,
      metadata: { eventType: event.type },
      receivedAt: new Date().toISOString()
    }

    try {
      await this.onMessageCb(inbound)
    } catch (error) {
      logger.error('Failed to process user-status event', { channelId: this.channel.id, error })
    }
  }

  private formatTicketEvent(event: CoworkerTicketEvent): string | null {
    const ticket = event.data.ticket
    const prefix = '[Coworker]'

    switch (event.type) {
      case 'ticket.created': {
        const creator = ticket.created_by?.username || 'unknown'
        let msg = `${prefix} New ticket #${ticket.id} created by ${creator}: ${ticket.title}`
        if (ticket.description) msg += `\nDescription: ${ticket.description}`
        if (ticket.ticket_type) msg += `\nType: ${ticket.ticket_type}`
        if (ticket.priority) msg += `, Priority: ${ticket.priority}`
        if (ticket.assigned_to) msg += `\nAssigned to: ${ticket.assigned_to.username}`
        return msg
      }

      case 'ticket.updated': {
        const changes = event.data.changes
        if (!changes || Object.keys(changes).length === 0) return null
        const changeStr = Object.entries(changes)
          .map(([field, { old: oldVal, new: newVal }]) => `${field}: ${oldVal} -> ${newVal}`)
          .join(', ')
        return `${prefix} Ticket #${ticket.id} '${ticket.title}' updated. Changes: {${changeStr}}`
      }

      case 'ticket.comment_added': {
        const comment = event.data.comment
        if (!comment) return null
        const commenter = comment.created_by?.username || 'unknown'
        return `${prefix} ${commenter} commented on ticket #${ticket.id} '${ticket.title}':\n${comment.content}`
      }

      case 'ticket.deleted':
        return `${prefix} Ticket #${ticket.id} '${ticket.title}' has been deleted`

      case 'ticket.attachment_uploaded': {
        const attachment = event.data.attachment
        if (!attachment) return null
        const uploader = attachment.uploaded_by?.username || 'unknown'
        return `${prefix} ${uploader} uploaded attachment to ticket #${ticket.id} '${ticket.title}': ${attachment.filename}`
      }

      default:
        logger.debug('Unknown ticket event type', { type: event.type })
        return `${prefix} Ticket #${ticket.id} '${ticket.title}': event ${event.type}`
    }
  }

  // --- REST helpers ---

  private async apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api${path}`
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`
      },
      body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Coworker API ${method} ${path}: ${response.status} - ${text}`)
    }

    if (response.status === 204) return {} as T
    return response.json() as Promise<T>
  }

  private buildWsUrl(path: string): string {
    // Convert http(s) to ws(s)
    const wsBase = this.baseUrl.replace(/^http/, 'ws')
    return `${wsBase}${path}?token=${this.token}`
  }
}
