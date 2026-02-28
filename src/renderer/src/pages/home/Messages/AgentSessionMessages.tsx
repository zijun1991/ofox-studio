import { loggerService } from '@logger'
import logoSvg from '@renderer/assets/images/logo.svg'
import ContextMenu from '@renderer/components/ContextMenu'
import { useSession } from '@renderer/hooks/agents/useSession'
import { useTopicMessages } from '@renderer/hooks/useMessageOperations'
import useScrollPosition from '@renderer/hooks/useScrollPosition'
import { useSettings } from '@renderer/hooks/useSettings'
import SpeedyWelcome from '@renderer/pages/landing/components/SpeedyWelcome'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getGroupedMessages } from '@renderer/services/MessagesService'
import { useAppDispatch } from '@renderer/store'
import { loadTopicMessagesThunk } from '@renderer/store/thunk/messageThunk'
import { type Topic, TopicType } from '@renderer/types'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { Spin } from 'antd'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'

import MessageAnchorLine from './MessageAnchorLine'
import MessageGroup from './MessageGroup'
import NarrowLayout from './NarrowLayout'
import { MessagesContainer, ScrollContainer } from './shared'

const logger = loggerService.withContext('AgentSessionMessages')

const TURBO_AGENT_ID = 'agent_turbo_system'

type Props = {
  agentId: string
  sessionId: string
}

const AgentSessionMessages: React.FC<Props> = ({ agentId, sessionId }) => {
  const { session } = useSession(agentId, sessionId)
  const sessionTopicId = useMemo(() => buildAgentSessionTopicId(sessionId), [sessionId])
  // Use the same hook as Messages.tsx for consistent behavior
  const messages = useTopicMessages(sessionTopicId)
  const { messageNavigation } = useSettings()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const dispatch = useAppDispatch()

  const { handleScroll: handleScrollPosition } = useScrollPosition(`agent-session-${sessionId}`)

  const displayMessages = useMemo(() => {
    if (!messages || messages.length === 0) return []
    return [...messages].reverse()
  }, [messages])

  const groupedMessages = useMemo(() => {
    if (!displayMessages || displayMessages.length === 0) return []
    return Object.entries(getGroupedMessages(displayMessages))
  }, [displayMessages])

  const sessionAssistantId = session?.agent_id ?? agentId
  const sessionName = session?.name ?? sessionId
  const sessionCreatedAt = session?.created_at ?? session?.updated_at ?? FALLBACK_TIMESTAMP
  const sessionUpdatedAt = session?.updated_at ?? session?.created_at ?? FALLBACK_TIMESTAMP

  const derivedTopic = useMemo<Topic>(
    () => ({
      id: sessionTopicId,
      type: TopicType.Session,
      assistantId: sessionAssistantId,
      name: sessionName,
      createdAt: sessionCreatedAt,
      updatedAt: sessionUpdatedAt,
      messages: []
    }),
    [sessionTopicId, sessionAssistantId, sessionName, sessionCreatedAt, sessionUpdatedAt]
  )

  logger.silly('Rendering agent session messages', {
    sessionId,
    messageCount: messages.length
  })

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0 })
        }
      })
    }
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages, scrollToBottom])

  // Listen for SEND_MESSAGE event to scroll to bottom (consistent with Messages.tsx)
  useEffect(() => {
    const unsubscribe = EventEmitter.on(EVENT_NAMES.SEND_MESSAGE, scrollToBottom)
    return unsubscribe
  }, [scrollToBottom])

  // Listen for channel message events to refresh messages (e.g., from scheduler)
  useEffect(() => {
    const handleChannelMessage = (
      event: CustomEvent<{
        sessionId: string
        channelId: string
        direction: string
        content: string
        timestamp: string
      }>
    ) => {
      const { sessionId: eventSessionId } = event.detail
      const builtTopicId = buildAgentSessionTopicId(eventSessionId)
      // Check if the message is for the current session
      if (sessionTopicId === builtTopicId) {
        logger.debug('Refreshing messages for channel/scheduler message', {
          sessionId: eventSessionId,
          topicId: sessionTopicId
        })
        // Force reload messages from database
        dispatch(loadTopicMessagesThunk(sessionTopicId, true))
        scrollToBottom()
      }
    }

    window.addEventListener('channel-message-received', handleChannelMessage as EventListener)
    return () => {
      window.removeEventListener('channel-message-received', handleChannelMessage as EventListener)
    }
  }, [dispatch, sessionTopicId, scrollToBottom])

  return (
    <TurboMessagesContainer
      id="messages"
      className="messages-container turbo-mode-messages"
      ref={scrollContainerRef}
      onScroll={handleScrollPosition}>
      <NarrowLayout style={{ display: 'flex', flexDirection: 'column-reverse', flex: 1 }}>
        <ContextMenu>
          <ScrollContainer>
            {groupedMessages.length > 0 ? (
              groupedMessages.map(([key, groupMessages]) => (
                <MessageGroup key={key} messages={groupMessages} topic={derivedTopic} />
              ))
            ) : session ? (
              agentId === TURBO_AGENT_ID ? (
                <SpeedyWelcome />
              ) : (
                <EmptyStateContainer>
                  <LogoWrapper>
                    <img src={logoSvg} alt="Logo" />
                  </LogoWrapper>
                  <GreetingText>你好，今天想聊点什么？</GreetingText>
                </EmptyStateContainer>
              )
            ) : (
              <LoadingState>
                <Spin size="small" />
              </LoadingState>
            )}
          </ScrollContainer>
        </ContextMenu>
      </NarrowLayout>
      {messageNavigation === 'anchor' && <MessageAnchorLine messages={displayMessages} />}
    </TurboMessagesContainer>
  )
}

const LoadingState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px 0;
`

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 350px);
`

const LogoWrapper = styled.div`
  width: 128px;
  height: 128px;
  margin-bottom: 24px;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

const GreetingText = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 40px;
`

const TurboMessagesContainer = styled(MessagesContainer)`
  flex: 1;
  min-height: 0;
  background: color-mix(in srgb, var(--speedy-brand, #B07353) 10%, transparent);
  padding-bottom: 120px; /* Space for the floating input */
  /* Turbo Mode specific overrides for message bubbles */
  &.turbo-mode-messages {
    /* 基础消息布局 */
    .message {
      margin: 8px 20px;
      width: fit-content;
      max-width: 85%;
    }

    /* Target the MessageWrapper inside GridContainer */
    div[class*="MessageGroup__MessageWrapper"] {
      display: flex;
      flex-direction: column;
    }

    .message-content-container {
      padding-left: 0 !important;
      margin-top: 0 !important;
    }
    .MessageFooter {
      margin-left: 0 !important;
    }
    /* 极速模式下操作按钮始终显示 */
    .menubar {
      opacity: 1 !important;
    }

    /* === AI 助手消息：header 在气泡外面 === */
    .message-assistant {
      /* 移除 .message 层的气泡样式，让气泡下移到内容区 */
      background-color: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      border-radius: 0 !important;
      align-self: flex-start;
      margin-right: auto;
      justify-self: start;
    }

    /* AI 消息的 header：显示名称+时间+token，隐藏头像 */
    .message-assistant .message-header {
      margin-bottom: 4px !important;
      padding-left: 4px !important;
      gap: 0 !important;
      /* 隐藏 EmojiAvatar (styled div) */
      > :first-child:not(div[class*="UserWrap"]) {
        display: none !important;
      }
      /* 隐藏 Ant Design Avatar */
      > .ant-avatar {
        display: none !important;
      }
    }

    /* AI 消息的内容区域承载气泡样式 */
    .message-assistant .message-content-container {
      background-color: var(--color-background) !important;
      border-radius: 20px 20px 20px 4px !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
      border: 1px solid var(--color-border) !important;
      padding: 16px 20px !important;
      min-width: 300px;
    }

    /* AI 消息的 footer 也在气泡外 */
    .message-assistant .MessageFooter {
      padding-left: 4px !important;
    }

    /* 隐藏花费金额（只保留 token 数量） */
    .message-tokens .tokens > span:last-child {
      display: none !important;
    }

    /* === 用户消息：header 显示名称+时间，隐藏头像，气泡下移到内容区，footer 在气泡外 === */
    .message-user .message-header {
      margin-bottom: 4px !important;
      padding-right: 4px !important;
      gap: 0 !important;
      justify-content: flex-end !important;
      /* 隐藏 EmojiAvatar (styled div) */
      > :first-child:not(div[class*="UserWrap"]) {
        display: none !important;
      }
      /* 隐藏 Ant Design Avatar */
      > .ant-avatar {
        display: none !important;
      }
    }

    /* 用户消息 header 内名称和时间右对齐 */
    .message-user .message-header > div:last-of-type > div,
    .message-user .message-header .message-header-info-wrap {
      justify-content: flex-end !important;
    }

    .message-user {
      /* 移除 .message 层的气泡样式，让气泡下移到内容区 */
      background-color: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      border-radius: 0 !important;
      align-self: flex-end;
      margin-left: auto;
      justify-self: end;
    }

    /* 用户消息的内容区域承载气泡样式 */
    .message-user .message-content-container {
      background-color: #b07353 !important;
      color: #ffffff !important;
      border-radius: 20px 20px 4px 20px !important;
      padding: 16px 20px !important;
      --color-text: #ffffff;
      --color-text-secondary: rgba(255, 255, 255, 0.8);
    }

    /* 用户消息的 footer 在气泡外，右对齐 */
    .message-user .MessageFooter {
      padding-right: 4px !important;
    }

    .message-user .message-content-container p,
    .message-user .message-content-container div:not([class*="hljs"]):not([class*="code"]) {
      color: #ffffff;
    }

    /* 图片投影，避免与背景色混淆 */
    .message-content-container img {
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
      border-radius: 8px;
    }
  }
`

const FALLBACK_TIMESTAMP = '1970-01-01T00:00:00.000Z'

export default memo(AgentSessionMessages)
