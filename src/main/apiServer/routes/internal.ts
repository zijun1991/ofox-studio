/**
 * Internal API Routes
 *
 * Provides internal HTTP endpoints for local services (e.g., SchedulerService).
 * Only accessible from localhost, no authentication required.
 */

import { loggerService } from '@logger'
import { sessionMessageService, sessionService } from '@main/services/agents'
import { agentMessageRepository } from '@main/services/agents/database/sessionMessageRepository'
import { ChannelManager } from '@main/services/channels/ChannelManager'
import { IpcChannel } from '@shared/IpcChannel'
import type {
  AgentPersistedMessage,
  ChannelMessageEvent,
  ChannelOutboundMessage,
  GetAgentSessionResponse
} from '@types'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType, UserMessageStatus } from '@types'
import { BrowserWindow } from 'electron'
import type { Request, Response } from 'express'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'

const logger = loggerService.withContext('InternalAPI')

/**
 * Create a simple AgentPersistedMessage for internal API messages
 */
function createInternalMessage(
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

/**
 * Emit a message event to the renderer process for real-time UI updates
 */
function emitMessageEvent(event: ChannelMessageEvent): void {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannel.Channel_MessageEvent, event)
  }
}

export const internalRouter: ReturnType<typeof Router> = Router()

// IP restriction middleware - localhost only
internalRouter.use((req: Request, res: Response, next: () => void) => {
  const ip = req.ip || req.socket.remoteAddress || ''
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  if (!isLocalhost) {
    logger.warn('Rejected internal API request from non-localhost', { ip })
    res.status(403).json({ error: 'Internal API only accessible from localhost' })
    return
  }
  next()
})

/**
 * POST /internal/sessions/:agentId/:sessionId/messages
 * Send a message to a specific Agent Session
 *
 * Request body: { content: string }
 * Response: SSE stream with AI response chunks
 */
internalRouter.post('/sessions/:agentId/:sessionId/messages', async (req: Request, res: Response) => {
  const agentId = req.params.agentId as string
  const sessionId = req.params.sessionId as string
  const { content } = req.body

  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Content is required and must be a string' })
    return
  }

  logger.info('Internal API: Sending message to session', { agentId, sessionId, contentLength: content.length })

  try {
    // Get Session
    const session = await sessionService.getSession(agentId, sessionId)
    if (!session) {
      logger.warn('Internal API: Session not found', { agentId, sessionId })
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // Override permission mode to bypassPermissions for automated execution
    const schedulerSession: GetAgentSessionResponse = {
      ...session,
      configuration: {
        ...session.configuration,
        permission_mode: 'bypassPermissions',
        max_turns: session.configuration?.max_turns ?? 100
      }
    }

    // Persist user message first
    await agentMessageRepository.persistExchange({
      sessionId,
      agentSessionId: '',
      user: {
        payload: createInternalMessage('user', content, sessionId),
        createdAt: new Date().toISOString()
      }
    })
    logger.debug('Internal API: User message persisted', { sessionId })

    // Create AbortController
    const abortController = new AbortController()

    // Listen for client disconnect
    req.on('close', () => {
      abortController.abort('Client disconnected')
    })

    // Call SessionMessageService with bypassPermissions mode
    const { stream, completion } = await sessionMessageService.createSessionMessage(
      schedulerSession,
      { content },
      abortController
    )

    // Set SSE response headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Read stream and send SSE events
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
      'text-complete'
    ])

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (value) {
          // Send SSE event
          res.write(`data: ${JSON.stringify(value)}\n\n`)

          // Extract agentSessionId if available
          if ('agentSessionId' in value && (value as any).agentSessionId) {
            agentSessionId = (value as any).agentSessionId
          }

          // Accumulate response text (only text-delta chunks)
          if (!IGNORED_CHUNK_TYPES.has(value.type) && 'text' in value && (value as any).text) {
            responseText += (value as any).text
          }
        }
      }

      // Wait for completion
      await completion

      // Persist assistant message
      if (responseText) {
        await agentMessageRepository.persistExchange({
          sessionId,
          agentSessionId,
          assistant: {
            payload: createInternalMessage('assistant', responseText, sessionId),
            createdAt: new Date().toISOString()
          }
        })
        logger.debug('Internal API: Assistant message persisted', {
          sessionId,
          agentSessionId: agentSessionId || '(empty)',
          responseLength: responseText.length
        })

        // Emit global event for frontend to update message list
        emitMessageEvent({
          channelId: 'scheduler',
          sessionId,
          direction: 'outbound',
          content: responseText,
          timestamp: new Date().toISOString()
        })

        // Check if session is bound to a channel and send response
        const channelManager = ChannelManager.getInstance()
        const boundChannel = channelManager.getChannelForSession(sessionId)

        if (boundChannel) {
          // Scheduler-triggered messages should not reply to any specific message.
          // Use fallback metadata which sets messageId=0 (no reply).
          const routingMetadata = channelManager.buildFallbackMetadata(boundChannel)

          if (routingMetadata) {
            logger.info('Internal API: Sending response to bound channel', {
              sessionId,
              channelId: boundChannel.id,
              channelType: boundChannel.type
            })

            const outbound: ChannelOutboundMessage = {
              channelId: boundChannel.id,
              channelType: boundChannel.type,
              content: responseText,
              metadata: routingMetadata,
              sentAt: new Date().toISOString()
            }

            await channelManager.handleOutbound(outbound)
          } else {
            logger.warn(
              'Internal API: Channel bound but no routing metadata available (no lastMessageMetadata and no allowedChatIds configured)',
              {
                sessionId,
                channelId: boundChannel.id,
                channelType: boundChannel.type
              }
            )
          }
        }
      }

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()

      logger.info('Internal API: Message sent successfully', {
        agentId,
        sessionId,
        responseLength: responseText.length
      })
    } catch (streamError) {
      logger.error('Internal API: Stream error', { error: streamError })
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(streamError) })}\n\n`)
      res.end()
    }
  } catch (error) {
    logger.error('Internal API: Error sending message', { error, agentId, sessionId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /internal/sessions/:agentId/:sessionId
 * Get Session information
 */
internalRouter.get('/sessions/:agentId/:sessionId', async (req: Request, res: Response) => {
  const agentId = req.params.agentId as string
  const sessionId = req.params.sessionId as string

  try {
    const session = await sessionService.getSession(agentId, sessionId)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json({ session })
  } catch (error) {
    logger.error('Internal API: Error getting session', { error, agentId, sessionId })
    res.status(500).json({ error: 'Internal server error' })
  }
})
