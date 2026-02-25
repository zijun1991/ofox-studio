import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import type {
  AgentPersistedMessage,
  ChannelEntity,
  ChannelInboundMessage,
  ChannelMessageEvent,
  ChannelOutboundMessage,
  ChannelStatus,
  ChannelStatusEvent
} from '@types'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType, UserMessageStatus } from '@types'
import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'

import { agentMessageRepository } from '../agents/database/sessionMessageRepository'
import { sessionMessageService, sessionService } from '../agents/services'
import type { BaseChannelConnector } from './connectors/BaseChannelConnector'

const logger = loggerService.withContext('ChannelManager')

/**
 * Create a simple AgentPersistedMessage for channel messages
 */
function createChannelMessage(
  role: 'user' | 'assistant',
  content: string,
  topicId: string = ''
): AgentPersistedMessage {
  const now = new Date().toISOString()
  const messageId = uuidv4()
  const blockId = uuidv4()

  return {
    message: {
      id: messageId,
      role,
      assistantId: '',
      topicId,
      createdAt: now,
      status: role === 'user' ? UserMessageStatus.SUCCESS : AssistantMessageStatus.SUCCESS,
      blocks: [blockId]
    },
    blocks: [
      {
        id: blockId,
        messageId,
        type: MessageBlockType.MAIN_TEXT,
        createdAt: now,
        status: MessageBlockStatus.SUCCESS,
        content
      }
    ]
  }
}

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

      // Persist user message
      await agentMessageRepository.persistExchange({
        sessionId: channel.sessionId,
        agentSessionId: '',
        user: {
          payload: createChannelMessage('user', message.content, channel.sessionId),
          createdAt: new Date().toISOString()
        }
      })

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
      let agentSessionId = ''

      // Chunk types that should be ignored when building the response text
      const IGNORED_CHUNK_TYPES = new Set([
        'reasoning-delta',
        'reasoning-start',
        'reasoning-complete',
        'thinking-delta',
        'thinking-start',
        'thinking-complete',
        'tool-input-delta',
        'tool-input-start',
        'tool-call',
        'tool-result',
        'mcp_tool_created',
        'mcp_tool_pending',
        'mcp_tool_in_progress',
        'mcp_tool_complete',
        'mcp_tool_streaming',
        'image-delta',
        'image-created',
        'image-complete',
        'audio-delta',
        'audio-start',
        'audio-complete',
        'error',
        'block_created',
        'block_in_progress',
        'block_complete',
        'llm_response_created',
        'llm_response_in_progress',
        'llm_response_complete',
        'text-start',
        'text-complete'
      ])

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Forward stream chunks to renderer for real-time UI
          this.forwardStreamChunk(channel.sessionId, value)

          // Only accumulate text-delta chunks for the response
          // Explicitly ignore thinking, tool calls, and other non-text content
          if (value.type === 'text-delta' && 'text' in value && value.text) {
            responseText += value.text
          }
          // 流结束时，如果有完整文本，使用它替换累积内容（处理非流式消息的情况）
          if (value.type === 'text-end' && (value as any).providerMetadata?.text?.value) {
            responseText = (value as any).providerMetadata.text.value
          }

          // Extract agent_session_id from stream chunks for context resume
          const providerMetadata = (value as any).providerMetadata
          if (providerMetadata?.anthropic?.session_id) {
            agentSessionId = providerMetadata.anthropic.session_id
            logger.debug('Extracted agent_session_id from stream', {
              channelId: channel.id,
              agentSessionId,
              chunkType: value.type
            })
          } else if (providerMetadata?.anthropic) {
            // Log when providerMetadata exists but session_id is missing
            logger.debug('No session_id in providerMetadata.anthropic', {
              channelId: channel.id,
              chunkType: value.type,
              anthropicKeys: Object.keys(providerMetadata.anthropic)
            })
          }

          if (!IGNORED_CHUNK_TYPES.has(value.type)) {
            // Log unknown chunk types for debugging
            const chunkValue = value as { type: string; text?: string }
            logger.debug('Received unhandled chunk type in channel', {
              channelId: channel.id,
              chunkType: value.type,
              hasText: 'text' in chunkValue && !!chunkValue.text
            })
          }
        }
      } catch (streamError) {
        logger.error('Error reading stream', { channelId: channel.id, error: streamError })
      }

      // Wait for completion
      await completion

      // Persist assistant message
      if (responseText) {
        logger.info('Persisting assistant message', {
          channelId: channel.id,
          sessionId: channel.sessionId,
          agentSessionId: agentSessionId || '(empty)',
          responseTextLength: responseText.length
        })
        await agentMessageRepository.persistExchange({
          sessionId: channel.sessionId,
          agentSessionId,
          assistant: {
            payload: createChannelMessage('assistant', responseText, channel.sessionId),
            createdAt: new Date().toISOString()
          }
        })

        // Emit outbound event for UI to refresh message list immediately
        this.emitMessageEvent({
          channelId: channel.id,
          sessionId: channel.sessionId,
          direction: 'outbound',
          content: responseText,
          timestamp: new Date().toISOString()
        })

        // Send response back through the channel
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
