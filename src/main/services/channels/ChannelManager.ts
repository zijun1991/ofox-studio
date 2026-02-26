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

    // Preserve runtime metadata from existing channels
    const metadataMap = new Map<string, { lastMessageMetadata?: Record<string, unknown>; lastMessageAt?: string }>()
    for (const ch of this.channels) {
      if (ch.lastMessageMetadata) {
        metadataMap.set(ch.id, {
          lastMessageMetadata: ch.lastMessageMetadata,
          lastMessageAt: ch.lastMessageAt
        })
      }
    }

    this.channels = channels

    // Restore preserved metadata onto new channel objects
    for (const ch of this.channels) {
      const preserved = metadataMap.get(ch.id)
      if (preserved && !ch.lastMessageMetadata) {
        ch.lastMessageMetadata = preserved.lastMessageMetadata
        ch.lastMessageAt = preserved.lastMessageAt
      }
    }

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

    // Save metadata for later use (e.g., scheduler-triggered messages)
    channel.lastMessageMetadata = message.metadata
    channel.lastMessageAt = message.receivedAt

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
      let currentTurnText = '' // Text for current turn only
      let currentTextBlockId: string | null = null // Track current text block ID to avoid duplicates
      let currentTextContent = '' // Accumulate text for current block
      let processedTextBlockIds = new Set<string>() // Track processed block IDs to avoid duplicates
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
        'text-complete'
      ])

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Forward stream chunks to renderer for real-time UI
          this.forwardStreamChunk(channel.sessionId, value)

          // Track text blocks using text-start / text-end pairing
          if (value.type === 'text-start') {
            currentTextBlockId = (value as any).id
            currentTextContent = ''
          }

          // Accumulate text-delta for current block (only if block not yet processed)
          if (value.type === 'text-delta' && currentTextBlockId && 'text' in value && value.text) {
            currentTextContent += value.text
          }

          // At text-end, finalize the text for this block (only once per block ID)
          if (value.type === 'text-end' && currentTextBlockId) {
            // Skip if this block was already processed (prevents duplicates)
            if (!processedTextBlockIds.has(currentTextBlockId)) {
              // Prefer complete text from providerMetadata (streaming messages)
              // otherwise use accumulated content
              const finalText = (value as any).providerMetadata?.text?.value || currentTextContent
              if (finalText) {
                // Defensive check: skip if currentTurnText already contains
                // this exact text (guards against upstream duplication bugs)
                if (currentTurnText === finalText || currentTurnText.endsWith(finalText)) {
                  logger.warn('Skipping duplicate text content in channel', {
                    channelId: channel.id,
                    textBlockId: currentTextBlockId,
                    textLength: finalText.length
                  })
                } else {
                  currentTurnText += finalText
                }
                logger.debug('Finalized text block', {
                  channelId: channel.id,
                  textBlockId: currentTextBlockId,
                  textLength: finalText.length
                })
              }
              processedTextBlockIds.add(currentTextBlockId)
            }
            currentTextBlockId = null
            currentTextContent = ''
          }

          // At finish-step, save current turn text and reset for next turn
          // This ensures we only keep the LAST turn's text for channel response
          if (value.type === 'finish-step') {
            if (currentTurnText) {
              responseText = currentTurnText // Overwrite with latest turn's text
            }
            // Reset for next turn
            currentTurnText = ''
            processedTextBlockIds.clear()
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

  /**
   * Get channel bound to a specific session
   */
  getChannelForSession(sessionId: string): ChannelEntity | undefined {
    return this.channels.find((c) => c.sessionId === sessionId && c.enabled)
  }

  /**
   * Build fallback routing metadata from channel configuration.
   * Used when lastMessageMetadata is unavailable (e.g., scheduler-triggered messages).
   */
  buildFallbackMetadata(channel: ChannelEntity): Record<string, unknown> | null {
    // 优先使用最近一次入站消息的元数据（包含实际的 chatId）
    if (channel.lastMessageMetadata) {
      return {
        ...channel.lastMessageMetadata,
        messageId: 0
      }
    }
    // 回退到配置中的 allowedChatIds
    if (channel.type === 'telegram' && channel.telegramConfig?.allowedChatIds?.length) {
      return {
        chatId: channel.telegramConfig.allowedChatIds[0],
        messageId: 0
      }
    }
    return null
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
      mainWindow.webContents.send(IpcChannel.Channel_StreamChunk, {
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
