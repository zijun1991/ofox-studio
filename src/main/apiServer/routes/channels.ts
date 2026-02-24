import { loggerService } from '@logger'
import type { Request, Response } from 'express'
import { Router } from 'express'

const logger = loggerService.withContext('ChannelRoutes')

export const channelRoutes: ReturnType<typeof Router> = Router()

/**
 * POST /v1/channels/:channelId/webhook
 * Receives incoming webhook messages for a channel.
 * Authentication is per-channel (HMAC signature) rather than global Bearer token.
 */
channelRoutes.post('/:channelId/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const channelId = req.params.channelId as string

    const { channelManager } = await import('../../services/channels')

    const channel = channelManager.getChannel(channelId)
    if (!channel) {
      logger.warn('Webhook received for unknown channel', { channelId })
      res.status(404).json({ error: 'Channel not found' })
      return
    }

    if (!channel.enabled) {
      res.status(503).json({ error: 'Channel is not enabled' })
      return
    }

    if (channel.type !== 'webhook') {
      res.status(400).json({ error: 'Channel is not a webhook type' })
      return
    }

    // Get the connector and delegate request handling
    const { WebhookConnector } = await import('../../services/channels/connectors/WebhookConnector')
    const connectors = (channelManager as any).connectors as Map<string, any>
    const connector = connectors.get(channelId as string)

    if (!connector || !(connector instanceof WebhookConnector)) {
      res.status(503).json({ error: 'Webhook connector is not running' })
      return
    }

    await connector.handleWebhookRequest(req, res)
  } catch (error) {
    logger.error('Error handling webhook request', { error, channelId: req.params.channelId as string })
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})
