import { loggerService } from '@logger'
import type { QuickPanelTriggerInfo } from '@renderer/components/QuickPanel'
import { QuickPanelReservedSymbol, useQuickPanel } from '@renderer/components/QuickPanel'
import { isGenerateImageModel, isVisionModel } from '@renderer/config/models'
import { useSession } from '@renderer/hooks/agents/useSession'
import { useInputText } from '@renderer/hooks/useInputText'
import { selectNewTopicLoading } from '@renderer/hooks/useMessageOperations'
import { getModel } from '@renderer/hooks/useModel'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTextareaResize } from '@renderer/hooks/useTextareaResize'
import { useTimer } from '@renderer/hooks/useTimer'
import { CacheService } from '@renderer/services/CacheService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { pauseTrace } from '@renderer/services/SpanManagerService'
import { estimateUserPromptUsage } from '@renderer/services/TokenService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { getChannelBySession } from '@renderer/store/channels'
import { newMessagesActions, selectMessagesForTopic } from '@renderer/store/newMessage'
import { sendMessage as dispatchSendMessage } from '@renderer/store/thunk/messageThunk'
import type { Assistant, Message } from '@renderer/types'
import type { FileMetadata } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus } from '@renderer/types/newMessage'
import { abortCompletion } from '@renderer/utils/abortController'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { getSendMessageShortcutLabel } from '@renderer/utils/input'
import { createMainTextBlock, createMessage } from '@renderer/utils/messageUtils/create'
import { documentExts, imageExts, textExts } from '@shared/config/constant'
import { Link2 } from 'lucide-react'
import type { FC } from 'react'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { v4 as uuid } from 'uuid'

import { InputbarCore } from './components/InputbarCore'
import {
  InputbarToolsProvider,
  useInputbarToolsDispatch,
  useInputbarToolsInternalDispatch,
  useInputbarToolsState
} from './context/InputbarToolsProvider'
import InputbarTools from './InputbarTools'
import { getInputbarConfig } from './registry'
import { TopicType } from './types'

const logger = loggerService.withContext('AgentSessionInputbar')

const DRAFT_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

const getAgentDraftCacheKey = (agentId: string) => `agent-session-draft-${agentId}`

// Turbo agent ID constant - must match the one in SpeedyPage.tsx
const TURBO_AGENT_ID = 'agent_turbo_system'

type Props = {
  agentId: string
  sessionId: string
}

const AgentSessionInputbar: FC<Props> = ({ agentId, sessionId }) => {
  const { session } = useSession(agentId, sessionId)
  // FIXME: 不应该使用ref将action传到context提供给tool，权宜之计
  const actionsRef = useRef({
    resizeTextArea: () => {},
    // oxlint-disable-next-line no-unused-vars
    onTextChange: (_updater: React.SetStateAction<string> | ((prev: string) => string)) => {},
    toggleExpanded: () => {}
  })

  // Create assistant stub with session data
  const assistantStub = useMemo<Assistant | null>(() => {
    if (!session) return null

    // Extract model info - only split on the first colon since modelId may contain colons
    const colonIndex = session.model?.indexOf(':') ?? -1
    const providerId = colonIndex > -1 ? session.model?.slice(0, colonIndex) : undefined
    const actualModelId = colonIndex > -1 ? session.model?.slice(colonIndex + 1) : session.model
    const actualModel = actualModelId ? getModel(actualModelId, providerId) : undefined

    return {
      id: session.agent_id ?? agentId,
      name: session.name ?? 'Agent Session',
      prompt: session.instructions ?? '',
      topics: [],
      type: 'agent-session',
      model: actualModel,
      defaultModel: actualModel,
      tags: [],
      enableWebSearch: false
    } satisfies Assistant
  }, [session, agentId])

  // Prepare session data for tools
  const sessionData = useMemo(() => {
    if (!session) return undefined
    return {
      agentId,
      sessionId,
      slashCommands: session.slash_commands,
      tools: session.tools,
      accessiblePaths: session.accessible_paths ?? []
    }
  }, [session, agentId, sessionId])

  const initialState = useMemo(
    () => ({
      mentionedModels: [],
      selectedKnowledgeBases: [],
      files: [] as FileMetadata[],
      isExpanded: false
    }),
    []
  )

  if (!assistantStub) {
    return null // Wait for session to load
  }

  return (
    <InputbarToolsProvider
      initialState={initialState}
      actions={{
        resizeTextArea: () => actionsRef.current.resizeTextArea(),
        onTextChange: (updater) => actionsRef.current.onTextChange(updater),
        // Agent Session specific actions
        addNewTopic: () => {},
        clearTopic: () => {},
        onNewContext: () => {},
        toggleExpanded: () => actionsRef.current.toggleExpanded()
      }}>
      <AgentSessionInputbarInner
        assistant={assistantStub}
        agentId={agentId}
        sessionId={sessionId}
        sessionData={sessionData}
        actionsRef={actionsRef}
      />
    </InputbarToolsProvider>
  )
}

interface InnerProps {
  assistant: Assistant
  agentId: string
  sessionId: string
  sessionData?: {
    agentId?: string
    sessionId?: string
    slashCommands?: Array<{ command: string; description?: string }>
    tools?: Array<{ id: string; name: string; type: string; description?: string }>
  }
  actionsRef: React.MutableRefObject<{
    resizeTextArea: () => void
    onTextChange: (updater: React.SetStateAction<string> | ((prev: string) => string)) => void
    toggleExpanded: (nextState?: boolean) => void
  }>
}

const AgentSessionInputbarInner: FC<InnerProps> = ({ assistant, agentId, sessionId, sessionData, actionsRef }) => {
  const scope = TopicType.Session
  const config = getInputbarConfig(scope)

  // Use shared hooks for text and textarea management with draft persistence
  const draftCacheKey = getAgentDraftCacheKey(agentId)
  const {
    text,
    setText,
    isEmpty: inputEmpty
  } = useInputText({
    initialValue: CacheService.get<string>(draftCacheKey) ?? '',
    onChange: (value) => CacheService.set(draftCacheKey, value, DRAFT_CACHE_TTL)
  })
  const {
    textareaRef,
    resize: resizeTextArea,
    focus: focusTextarea,
    setExpanded,
    isExpanded: textareaIsExpanded,
    customHeight,
    setCustomHeight
  } = useTextareaResize({ maxHeight: 500, minHeight: 30 })
  const { sendMessageShortcut, apiServer } = useSettings()

  const { t } = useTranslation()
  const quickPanel = useQuickPanel()

  const { files } = useInputbarToolsState()
  const { toolsRegistry, triggers, setIsExpanded } = useInputbarToolsDispatch()
  const { setCouldAddImageFile } = useInputbarToolsInternalDispatch()

  const { setTimeoutTimer } = useTimer()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const sessionTopicId = buildAgentSessionTopicId(sessionId)
  const topicMessages = useAppSelector((state) => selectMessagesForTopic(state, sessionTopicId))
  const loading = useAppSelector((state) => selectNewTopicLoading(state, sessionTopicId))

  // Check if this session is bound to a channel
  const boundChannel = useAppSelector((state) => getChannelBySession(state, sessionId))

  // Calculate vision and image generation support
  const isVisionAssistant = useMemo(() => (assistant.model ? isVisionModel(assistant.model) : false), [assistant.model])
  const isGenerateImageAssistant = useMemo(
    () => (assistant.model ? isGenerateImageModel(assistant.model) : false),
    [assistant.model]
  )

  // Agent sessions don't support model mentions yet, so we only check the assistant's model
  const canAddImageFile = useMemo(() => {
    return isVisionAssistant || isGenerateImageAssistant
  }, [isVisionAssistant, isGenerateImageAssistant])

  const canAddTextFile = useMemo(() => {
    return isVisionAssistant || (!isVisionAssistant && !isGenerateImageAssistant)
  }, [isVisionAssistant, isGenerateImageAssistant])

  // Update the couldAddImageFile state when the model changes
  useEffect(() => {
    setCouldAddImageFile(canAddImageFile)
  }, [canAddImageFile, setCouldAddImageFile])

  const syncExpandedState = useCallback(
    (expanded: boolean) => {
      setExpanded(expanded)
      setIsExpanded(expanded)
    },
    [setExpanded, setIsExpanded]
  )
  const handleToggleExpanded = useCallback(
    (nextState?: boolean) => {
      const target = typeof nextState === 'boolean' ? nextState : !textareaIsExpanded
      syncExpandedState(target)
      focusTextarea()
    },
    [focusTextarea, syncExpandedState, textareaIsExpanded]
  )

  // Update actionsRef for InputbarTools
  useEffect(() => {
    actionsRef.current = {
      resizeTextArea,
      onTextChange: setText,
      toggleExpanded: handleToggleExpanded
    }
  }, [resizeTextArea, setText, actionsRef, handleToggleExpanded])

  // Listen for workspace node double click events to insert path into input
  useEffect(() => {
    const handleNodeDoubleClick = async ({ path }: { path: string }) => {
      // Use insertPath method to insert path as a blot
      await textareaRef.current?.insertPath(path)
      // Focus the textarea after inserting path
      focusTextarea()
    }

    EventEmitter.on(EVENT_NAMES.WORKSPACE_NODE_DOUBLE_CLICK, handleNodeDoubleClick)
    return () => {
      EventEmitter.off(EVENT_NAMES.WORKSPACE_NODE_DOUBLE_CLICK, handleNodeDoubleClick)
    }
  }, [textareaRef, focusTextarea])

  const rootTriggerHandlerRef = useRef<((payload?: unknown) => void) | undefined>(undefined)

  // Update handler logic when dependencies change
  // For Agent Session, we directly trigger SlashCommands panel instead of Root menu
  useEffect(() => {
    rootTriggerHandlerRef.current = (payload) => {
      const slashCommands = sessionData?.slashCommands || []
      const triggerInfo = (payload ?? {}) as QuickPanelTriggerInfo

      if (slashCommands.length === 0) {
        quickPanel.open({
          title: t('chat.input.slash_commands.title'),
          symbol: QuickPanelReservedSymbol.SlashCommands,
          triggerInfo,
          list: [
            {
              label: t('chat.input.slash_commands.empty', 'No slash commands available'),
              description: '',
              icon: null,
              disabled: true,
              action: () => {}
            }
          ]
        })
        return
      }

      quickPanel.open({
        title: t('chat.input.slash_commands.title'),
        symbol: QuickPanelReservedSymbol.SlashCommands,
        triggerInfo,
        list: slashCommands.map((cmd) => ({
          label: cmd.command,
          description: cmd.description || '',
          icon: null,
          filterText: `${cmd.command} ${cmd.description || ''}`,
          action: () => {
            // Insert command into textarea
            setText((prev: string) => {
              const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement | null
              if (!textArea) {
                return prev + ' ' + cmd.command
              }

              const cursorPosition = textArea.selectionStart || 0
              const textBeforeCursor = prev.slice(0, cursorPosition)
              const lastSlashIndex = textBeforeCursor.lastIndexOf('/')

              if (lastSlashIndex !== -1 && cursorPosition > lastSlashIndex) {
                // Replace from '/' to cursor with command
                const newText = prev.slice(0, lastSlashIndex) + cmd.command + ' ' + prev.slice(cursorPosition)
                const newCursorPos = lastSlashIndex + cmd.command.length + 1

                setTimeout(() => {
                  if (textArea) {
                    textArea.focus()
                    textArea.setSelectionRange(newCursorPos, newCursorPos)
                  }
                }, 0)

                return newText
              }

              // No '/' found, just insert at cursor
              const newText = prev.slice(0, cursorPosition) + cmd.command + ' ' + prev.slice(cursorPosition)
              const newCursorPos = cursorPosition + cmd.command.length + 1

              setTimeout(() => {
                if (textArea) {
                  textArea.focus()
                  textArea.setSelectionRange(newCursorPos, newCursorPos)
                }
              }, 0)

              return newText
            })
          }
        }))
      })
    }
  }, [sessionData, quickPanel, t, setText])

  // Register the trigger handler (only once)
  useEffect(() => {
    if (!config.enableQuickPanel) {
      return
    }

    // Disable slash command trigger in turbo mode (speedy page)
    const isTurboMode = agentId === TURBO_AGENT_ID
    if (isTurboMode) {
      return
    }

    const disposeRootTrigger = toolsRegistry.registerTrigger(
      'agent-session-root',
      QuickPanelReservedSymbol.Root,
      (payload) => rootTriggerHandlerRef.current?.(payload)
    )

    return () => {
      disposeRootTrigger()
    }
  }, [config.enableQuickPanel, toolsRegistry, agentId])

  const sendDisabled = (inputEmpty && files.length === 0) || !apiServer.enabled

  const streamingAskIds = useMemo(() => {
    if (!topicMessages) {
      return []
    }

    const askIdSet = new Set<string>()
    for (const message of topicMessages) {
      if (!message) continue
      if (message.status === 'processing' || message.status === 'pending') {
        if (message.askId) {
          askIdSet.add(message.askId)
        } else if (message.id) {
          askIdSet.add(message.id)
        }
      }
    }

    return Array.from(askIdSet)
  }, [topicMessages])

  const canAbort = loading && streamingAskIds.length > 0

  const abortAgentSession = useCallback(async () => {
    if (!streamingAskIds.length) {
      logger.debug('No active agent session streams to abort', { sessionTopicId })
      return
    }

    logger.info('Aborting agent session message generation', {
      sessionTopicId,
      askIds: streamingAskIds
    })

    for (const askId of streamingAskIds) {
      abortCompletion(askId)
    }

    pauseTrace(sessionTopicId)
    dispatch(newMessagesActions.setTopicLoading({ topicId: sessionTopicId, loading: false }))
  }, [dispatch, sessionTopicId, streamingAskIds])

  const sendMessage = useCallback(async () => {
    if (sendDisabled) {
      return
    }

    logger.info('Starting to send message')

    try {
      const userMessageId = uuid()

      // For agent sessions, append file paths to the text content instead of uploading files
      let messageText = text
      if (files.length > 0) {
        const filePaths = files.map((file) => file.path).join('\n')
        messageText = text ? `${text}\n\nAttached files:\n${filePaths}` : `Attached files:\n${filePaths}`
      }

      const mainBlock = createMainTextBlock(userMessageId, messageText, {
        status: MessageBlockStatus.SUCCESS
      })
      const userMessageBlocks: MessageBlock[] = [mainBlock]

      // Calculate token usage for the user message
      const usage = await estimateUserPromptUsage({ content: text })

      const userMessage: Message = createMessage('user', sessionTopicId, agentId, {
        id: userMessageId,
        blocks: userMessageBlocks.map((block) => block?.id),
        model: assistant.model,
        modelId: assistant.model?.id,
        usage
      })

      dispatch(
        dispatchSendMessage(userMessage, userMessageBlocks, assistant, sessionTopicId, {
          agentId,
          sessionId
        })
      )

      // Emit event to trigger scroll to bottom in AgentSessionMessages
      EventEmitter.emit(EVENT_NAMES.SEND_MESSAGE, { topicId: sessionTopicId })

      // Clear text after successful send (draft is cleared automatically via onChange)
      setText('')
      setTimeoutTimer('agentSession_sendMessage', () => setText(''), 500)
      // Restore focus to textarea after sending to maintain IME state (fcitx5 issue)
      focusTextarea()
    } catch (error) {
      logger.warn('Failed to send message:', error as Error)
    }
  }, [
    sendDisabled,
    agentId,
    dispatch,
    assistant,
    sessionId,
    sessionTopicId,
    setText,
    setTimeoutTimer,
    text,
    files,
    focusTextarea
  ])

  useEffect(() => {
    if (!document.querySelector('.topview-fullscreen-container')) {
      focusTextarea()
    }
  }, [focusTextarea])

  const supportedExts = useMemo(() => {
    if (canAddImageFile && canAddTextFile) {
      return [...imageExts, ...documentExts, ...textExts]
    }

    if (canAddImageFile) {
      return [...imageExts]
    }

    if (canAddTextFile) {
      return [...documentExts, ...textExts]
    }

    return []
  }, [canAddImageFile, canAddTextFile])

  const leftToolbar = useMemo(
    () => (
      <ToolbarGroup>
        {config.showTools && <InputbarTools scope={scope} assistantId={assistant.id} session={sessionData} />}
      </ToolbarGroup>
    ),
    [config.showTools, scope, assistant.id, sessionData]
  )
  const placeholderText = useMemo(
    () =>
      t('agent.input.placeholder', {
        key: getSendMessageShortcutLabel(sendMessageShortcut)
      }),
    [sendMessageShortcut, t]
  )

  // Check if in turbo mode (speedy page)
  const isTurboMode = agentId === TURBO_AGENT_ID
  console.log('[AgentSessionInputbar] turbo mode check:', { agentId, TURBO_AGENT_ID, isTurboMode })

  // Handle navigation to channel settings
  const handleGoToChannel = useCallback(() => {
    if (boundChannel) {
      navigate(`/settings/channels/${boundChannel.id}`)
    }
  }, [boundChannel, navigate])

  // If session is bound to a channel, show prompt area instead of input
  if (boundChannel) {
    return (
      <ChannelBoundPromptArea>
        <PromptIcon>
          <Link2 size={20} />
        </PromptIcon>
        <PromptContent>
          <PromptTitle>{t('agent.session.channel_bound.title', 'Channel-Bound Session')}</PromptTitle>
          <PromptDescription>
            {t(
              'agent.session.channel_bound.description',
              'This session is bound to channel "{{name}}" ({{type}}). Messages are automatically received and sent through the channel.',
              { name: boundChannel.name, type: boundChannel.type }
            )}
          </PromptDescription>
          <PromptHint>
            {t('agent.session.channel_bound.hint', 'Configure this channel in Settings > Channels')}
          </PromptHint>
          <GoToChannelButton onClick={handleGoToChannel}>
            {t('agent.session.channel_bound.go_to_channel', 'Go to Channel')}
          </GoToChannelButton>
        </PromptContent>
      </ChannelBoundPromptArea>
    )
  }

  return (
    <InputbarCore
      scope={TopicType.Session}
      text={text}
      onTextChange={setText}
      textareaRef={textareaRef}
      height={customHeight}
      onHeightChange={setCustomHeight}
      resizeTextArea={resizeTextArea}
      focusTextarea={focusTextarea}
      placeholder={placeholderText}
      supportedExts={supportedExts}
      onPause={abortAgentSession}
      isLoading={canAbort}
      handleSendMessage={sendMessage}
      leftToolbar={leftToolbar}
      forceEnableQuickPanelTriggers
      disableQuickPanelTriggers={isTurboMode}
      triggers={triggers}
    />
  )
}

const ToolbarGroup = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
`

// Channel-bound session prompt area styles
const ChannelBoundPromptArea = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  margin: 8px 0;
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
`

const PromptIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--color-primary);
  border-radius: 50%;
  color: white;
  flex-shrink: 0;
`

const PromptContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
`

const PromptTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const PromptDescription = styled.div`
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.5;
`

const PromptHint = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
`

const GoToChannelButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  margin-top: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary);
  background-color: transparent;
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  width: fit-content;

  &:hover {
    background-color: var(--color-primary);
    color: white;
  }
`

export default AgentSessionInputbar
