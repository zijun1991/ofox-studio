import { loggerService } from '@logger'
import type { ChannelInboundMessage, ChannelOutboundMessage } from '@types'
import crypto from 'crypto'
import type { Request, Response } from 'express'

import { BaseChannelConnector, type ConnectorStatus } from './BaseChannelConnector'

const logger = loggerService.withContext('WebhookConnector')

interface PendingRequest {
  res: Response
  resolve: (content: string) => void
  timeout: NodeJS.Timeout
}

export class WebhookConnector extends BaseChannelConnector {
  private onMessage: ((msg: ChannelInboundMessage) => Promise<void>) | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private static REQUEST_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

  async start(onMessage: (msg: ChannelInboundMessage) => Promise<void>): Promise<void> {
    this.onMessage = onMessage
    this._status = 'connected'
    logger.info('Webhook connector started', { channelId: this.channel.id })
  }

  async stop(): Promise<void> {
    this.onMessage = null
    this._status = 'disconnected'

    // Reject all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      if (!pending.res.headersSent) {
        pending.res.status(503).json({ error: 'Channel stopped' })
      }
      this.pendingRequests.delete(requestId)
    }

    logger.info('Webhook connector stopped', { channelId: this.channel.id })
  }

  async sendResponse(msg: ChannelOutboundMessage): Promise<void> {
    const requestId = msg.metadata?.requestId as string | undefined
    if (requestId) {
      const pending = this.pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(requestId)
        pending.resolve(msg.content)
        return
      }
    }
    logger.warn('No pending request for outbound message', {
      channelId: msg.channelId,
      requestId
    })
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Webhook connector is ready to receive requests' }
  }

  /**
   * Handle an incoming webhook HTTP request.
   * Called by the Express route handler.
   */
  async handleWebhookRequest(req: Request, res: Response): Promise<void> {
    // Verify HMAC signature if secret is configured
    if (this.channel.webhookConfig?.secret) {
      const isValid = this.verifySignature(req)
      if (!isValid) {
        res.status(401).json({ error: 'Invalid signature' })
        return
      }
    }

    if (!this.onMessage) {
      res.status(503).json({ error: 'Channel is not active' })
      return
    }

    const content = typeof req.body === 'string' ? req.body : req.body?.content || JSON.stringify(req.body)
    const requestId = crypto.randomUUID()

    const inbound: ChannelInboundMessage = {
      channelId: this.channel.id,
      channelType: 'webhook',
      content,
      metadata: {
        requestId,
        headers: req.headers,
        ip: req.ip
      },
      receivedAt: new Date().toISOString()
    }

    // Set up synchronous response: hold the HTTP connection
    const responsePromise = new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        if (!res.headersSent) {
          res.status(504).json({ error: 'Response timeout' })
        }
      }, WebhookConnector.REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(requestId, { res, resolve, timeout })
    })

    // Process the inbound message (triggers LLM call)
    this.onMessage(inbound).catch((error) => {
      logger.error('Error processing webhook message', { channelId: this.channel.id, error })
      const pending = this.pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(requestId)
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal processing error' })
        }
      }
    })

    // Wait for the response
    try {
      const responseContent = await responsePromise

      // Set custom response headers if configured
      if (this.channel.webhookConfig?.responseHeaders) {
        for (const [key, value] of Object.entries(this.channel.webhookConfig.responseHeaders)) {
          res.setHeader(key, value)
        }
      }

      if (!res.headersSent) {
        res.json({ content: responseContent })
      }
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to get response' })
      }
    }
  }

  private verifySignature(req: Request): boolean {
    const secret = this.channel.webhookConfig?.secret
    if (!secret) return true

    const signature = req.headers['x-webhook-signature'] as string
    if (!signature) return false

    const payload = JSON.stringify(req.body)
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  }

  getStatus(): ConnectorStatus {
    return this._status
  }
}
