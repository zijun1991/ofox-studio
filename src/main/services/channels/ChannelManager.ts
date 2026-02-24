import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import type {
  ChannelEntity,
  ChannelInboundMessage,
  ChannelMessageEvent,
  ChannelOutboundMessage,
  ChannelStatus,
  ChannelStatusEvent
} from '@types'
import { BrowserWindow } from 'electron'

import { sessionMessageService, sessionService } from '../agents'
import type { BaseChannelConnector } from './connectors/BaseChannelConnector'

const logger = loggerService.withContext('ChannelManager')

export class ChannelManager {
  private static instance: ChannelManager | null = null
  private connectors = new Map<string, BaseChannelConnector>()
  private channels: ChannelEntity[] = []

  static getInstance(): ChannelManager {
    if (!ChannelManager.instance) {
      ChannelManager.instance = new ChannelManager()
    }
    return ChannelManager.instance
  }

  async syncChannels(channels: ChannelEntity[]): Promise<void> {
    logger.info('Syncing channel configs', { count: channels.length })
    const previousIds = new Set(this.channels.map((c) => c.id))
    this.channels = channels

    // Stop removed channels
    for (const id of previousIds) {
      if (!channels.find((c) => c.id === id)) {
        await this.stopChannel(id)
      }
    }

    // Start/restart enabled channels
    for (const channel of channels) {
      const existingConnector = this.connectors.get(channel.id)
      if (channel.enabled) {
        if (existingConnector) {
          existingConnector.updateChannel(channel)
        } else {
          await this.startChannel(channel.id)
        }
      } else if (existingConnector) {
        await this.stopChannel(channel.id)
      }
    }
  }

  async startChannel(channelId: string): Promise<void> {
    const channel = this.channels.find((c) => c.id === channelId)
    if (!channel) {
      logger.warn('Channel not found for start', { channelId })
      return
    }

    // Stop existing connector if any
    if (this.connectors.has(channelId)) {
      await this.stopChannel(channelId)
    }

    try {
      const connector = await this.createConnector(channel)
      this.connectors.set(channelId, connector)

      await connector.start((msg) => this.handleInbound(msg))

      this.emitStatusChange({ channelId, status: 'active' })
      logger.info('Channel started', { channelId, type: channel.type })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      this.emitStatusChange({ channelId, status: 'error', error: errMsg })
      logger.error('Failed to start channel', { channelId, error })
    }
  }

  async stopChannel(channelId: string): Promise<void> {
    const connector = this.connectors.get(channelId)
    if (!connector) return

    try {
      await connector.stop()
      this.connectors.delete(channelId)
      this.emitStatusChange({ channelId, status: 'inactive' })
      logger.info('Channel stopped', { channelId })
    } catch (error) {
      logger.error('Failed to stop channel', { channelId, error })
    }
  }

  async handleInbound(message: ChannelInboundMessage): Promise<void> {
    const channel = this.channels.find((c) => c.id === message.channelId)
    if (!channel) {
      logger.warn('Channel not found for inbound message', { channelId: message.channelId })
      return
    }

    logger.info('Handling inbound message', { channelId: channel.id, type: channel.type })

    // Emit inbound event for UI
    this.emitMessageEvent({
      channelId: channel.id,
      sessionId: channel.sessionId,
      direction: 'inbound',
      content: message.content,
      timestamp: message.receivedAt
    })

    try {
      // Get the session for this channel
      const session = await sessionService.getSession(channel.agentId, channel.sessionId)
      if (!session) {
        logger.error('Agent session not found for channel', {
          channelId: channel.id,
          agentId: channel.agentId,
          sessionId: channel.sessionId
        })
        return
      }

      // Send message through the agent session
      const abortController = new AbortController()
      const { stream, completion } = await sessionMessageService.createSessionMessage(
        session,
        { content: message.content },
        abortController
      )

      // Consume the stream and collect response text
      const reader = stream.getReader()
      let responseText = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Forward stream chunks to renderer for real-time UI
          this.forwardStreamChunk(channel.sessionId, value)

          // Accumulate text response
          if (value.type === 'text-delta' && value.text) {
            responseText += value.text
          }
        }
      } catch (streamError) {
        logger.error('Error reading stream', { channelId: channel.id, error: streamError })
      }

      // Wait for completion
      await completion

      // Send response back through the channel
      if (responseText) {
        const outbound: ChannelOutboundMessage = {
          channelId: channel.id,
          channelType: channel.type,
          content: responseText,
          metadata: message.metadata,
          sentAt: new Date().toISOString()
        }

        await this.handleOutbound(outbound)
      }
    } catch (error) {
      logger.error('Failed to process inbound message', { channelId: channel.id, error })
      this.emitStatusChange({
        channelId: channel.id,
        status: 'error',
        error: error instanceof Error ? error.message : 'Message processing failed'
      })
    }
  }

  async handleOutbound(message: ChannelOutboundMessage): Promise<void> {
    const connector = this.connectors.get(message.channelId)
    if (!connector) {
      logger.warn('No connector found for outbound message', { channelId: message.channelId })
      return
    }

    try {
      await connector.sendResponse(message)

      // Emit outbound event for UI
      this.emitMessageEvent({
        channelId: message.channelId,
        sessionId: this.channels.find((c) => c.id === message.channelId)?.sessionId ?? '',
        direction: 'outbound',
        content: message.content,
        timestamp: message.sentAt
      })

      logger.info('Outbound message sent', { channelId: message.channelId })
    } catch (error) {
      logger.error('Failed to send outbound message', { channelId: message.channelId, error })
    }
  }

  async testConnection(channel: ChannelEntity): Promise<{ success: boolean; message: string }> {
    try {
      const connector = await this.createConnector(channel)
      const result = await connector.testConnection()
      await connector.stop()
      return result
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed'
      }
    }
  }

  getChannelStatuses(): Record<string, ChannelStatus> {
    const statuses: Record<string, ChannelStatus> = {}
    for (const channel of this.channels) {
      const connector = this.connectors.get(channel.id)
      if (connector) {
        const cs = connector.getStatus()
        statuses[channel.id] = cs === 'connected' ? 'active' : cs === 'error' ? 'error' : 'inactive'
      } else {
        statuses[channel.id] = 'inactive'
      }
    }
    return statuses
  }

  getChannel(channelId: string): ChannelEntity | undefined {
    return this.channels.find((c) => c.id === channelId)
  }

  async stopAll(): Promise<void> {
    logger.info('Stopping all channel connectors', { count: this.connectors.size })
    const ids = [...this.connectors.keys()]
    for (const id of ids) {
      await this.stopChannel(id)
    }
  }

  private async createConnector(channel: ChannelEntity): Promise<BaseChannelConnector> {
    switch (channel.type) {
      case 'webhook': {
        const { WebhookConnector } = await import('./connectors/WebhookConnector')
        return new WebhookConnector(channel)
      }
      case 'email': {
        const { EmailConnector } = await import('./connectors/EmailConnector')
        return new EmailConnector(channel)
      }
      case 'telegram': {
        const { TelegramConnector } = await import('./connectors/TelegramConnector')
        return new TelegramConnector(channel)
      }
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`)
    }
  }

  private forwardStreamChunk(sessionId: string, chunk: any): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannel.Channel_MessageEvent, {
        type: 'stream-chunk',
        sessionId,
        chunk
      })
    }
  }

  private emitStatusChange(event: ChannelStatusEvent): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannel.Channel_StatusChanged, event)
    }
  }

  private emitMessageEvent(event: ChannelMessageEvent): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannel.Channel_MessageEvent, event)
    }
  }
}

export const channelManager = ChannelManager.getInstance()
