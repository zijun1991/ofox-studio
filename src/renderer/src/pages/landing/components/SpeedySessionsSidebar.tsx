/**
 * SpeedySessionsSidebar - Sessions list sidebar for Speedy Mode
 *
 * Features:
 * - List of sessions (using Agent system)
 * - New session button
 * - Session selection and management
 * - Permission mode selector
 * - Agent settings button
 */
import LogoSvg from '@renderer/assets/images/cherry-text-logo.svg?url'
import { DeleteIcon } from '@renderer/components/Icons'
import { useCreateDefaultSession } from '@renderer/hooks/agents/useCreateDefaultSession'
import { useSessions } from '@renderer/hooks/agents/useSessions'
import { useUpdateSession } from '@renderer/hooks/agents/useUpdateSession'
import { useInPlaceEdit } from '@renderer/hooks/useInPlaceEdit'
import { SessionSettingsPopup } from '@renderer/pages/settings/AgentSettings'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { newMessagesActions, selectMessagesForTopic } from '@renderer/store/newMessage'
import { setActiveSessionIdAction, setSessionWaitingAction } from '@renderer/store/runtime'
import { loadTopicMessagesThunk } from '@renderer/store/thunk/messageThunk'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { Alert, Spin, Tooltip } from 'antd'
import { motion } from 'framer-motion'
import { Plus, Settings2, X } from 'lucide-react'
import type { FC } from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled, { keyframes } from 'styled-components'

interface SpeedySessionsSidebarProps {
  agentId: string
  activeSessionId: string | null | undefined
  onSessionSelect: (sessionId: string) => void
}

const SessionPreview: FC<{ sessionId: string }> = memo(({ sessionId }) => {
  const dispatch = useAppDispatch()
  const topicId = useMemo(() => buildAgentSessionTopicId(sessionId), [sessionId])
  const fulfilled = useAppSelector((state) => state.messages.fulfilledByTopic[topicId])
  const messages = useAppSelector((state) => selectMessagesForTopic(state, topicId))

  // Load messages from DB if not yet loaded for this session
  useEffect(() => {
    if (!fulfilled) {
      dispatch(loadTopicMessagesThunk(topicId))
    }
  }, [dispatch, topicId, fulfilled])

  const previewText = useMemo(() => {
    if (!messages || messages.length === 0) return ''
    const lastMessage = messages[messages.length - 1]
    return getMainTextContent(lastMessage).replace(/\n+/g, ' ').trim()
  }, [messages])

  if (!previewText) return null

  return <SessionPreviewText>{previewText}</SessionPreviewText>
})

SessionPreview.displayName = 'SessionPreview'

const SpeedySessionsSidebar: FC<SpeedySessionsSidebarProps> = ({ agentId, activeSessionId, onSessionSelect }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  // Get sessions
  const { sessions, isLoading, error, deleteSession } = useSessions(agentId)
  const { createDefaultSession, creatingSession } = useCreateDefaultSession(agentId)

  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [targetSession, setTargetSession] = useState<{ id: string; name?: string } | null>(null)

  // Sort sessions by creation date (newest first)
  const sortedSessions = useMemo(() => {
    if (!sessions) return []
    return [...sessions].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
      return dateB - dateA
    })
  }, [sessions])

  // Auto-select first session if none selected
  useEffect(() => {
    if (!isLoading && sortedSessions.length > 0 && !activeSessionId) {
      onSessionSelect(sortedSessions[0].id)
    }
  }, [isLoading, sortedSessions, activeSessionId, onSessionSelect])

  // Mark topic as not fulfilled when session changes
  useEffect(() => {
    if (activeSessionId) {
      dispatch(
        newMessagesActions.setTopicFulfilled({
          topicId: buildAgentSessionTopicId(activeSessionId),
          fulfilled: false
        })
      )
    }
  }, [activeSessionId, dispatch])

  // Handle session delete click
  const handleDeleteClick = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingSessionId(sessionId)
    setTimeout(() => setDeletingSessionId(null), 2000)
  }, [])

  // Handle confirm delete
  const handleConfirmDelete = useCallback(
    async (session: { id: string; name?: string }, e: React.MouseEvent) => {
      e.stopPropagation()

      if (sortedSessions.length === 1) {
        window.toast.error(t('agent.session.delete.error.last'))
        return
      }

      dispatch(setSessionWaitingAction({ id: session.id, value: true }))
      const success = await deleteSession(session.id)

      if (success) {
        const newSessionId = sortedSessions.find((s) => s.id !== session.id)?.id
        if (newSessionId) {
          dispatch(setActiveSessionIdAction({ agentId, sessionId: newSessionId }))
        }
      }

      dispatch(setSessionWaitingAction({ id: session.id, value: false }))
      setDeletingSessionId(null)
    },
    [sortedSessions, deleteSession, dispatch, agentId, t]
  )

  // Handle new session creation
  const handleCreateSession = useCallback(async () => {
    if (!creatingSession) {
      const newSession = await createDefaultSession()
      if (newSession) {
        onSessionSelect(newSession.id)
      }
    }
  }, [createDefaultSession, creatingSession, onSessionSelect])

  // Get current session data and update methods
  const { updateSession } = useUpdateSession(agentId)

  // In-place edit hook for session rename
  const { startEdit, isEditing, inputProps } = useInPlaceEdit({
    onSave: async (name: string) => {
      if (targetSession && name !== targetSession.name) {
        await updateSession({ id: targetSession.id, name })
        window.toast.success(t('common.saved'))
      }
    },
    onCancel: () => {}
  })

  // Handle open settings popup
  const handleOpenSettings = useCallback(() => {
    if (agentId && activeSessionId) {
      SessionSettingsPopup.show({
        agentId,
        sessionId: activeSessionId
      })
    }
  }, [agentId, activeSessionId])

  if (isLoading) {
    return (
      <Container>
        <LoadingContainer>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full items-center justify-center">
            <Spin />
          </motion.div>
        </LoadingContainer>
      </Container>
    )
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>
          <Alert type="error" message={t('agent.session.get.error.failed')} showIcon />
        </ErrorContainer>
      </Container>
    )
  }

  return (
    <Container>
      <LogoArea>
        <img src={LogoSvg} alt="Logo" draggable={false} />
      </LogoArea>
      <SessionListTitle>
        <span className="text">{t('speedy.topic_list_title', '任务列表')}</span>
        <Tooltip title={t('speedy.add_task')}>
          <AddTopicButton onClick={handleCreateSession} disabled={creatingSession}>
            <Plus size={14} />
          </AddTopicButton>
        </Tooltip>
        <span className="count">{sortedSessions.length}</span>
      </SessionListTitle>
      <SessionList>
        {sortedSessions.length === 0 ? (
          <EmptyState>
            <EmptyText>{t('speedy.no_topics')}</EmptyText>
          </EmptyState>
        ) : (
          sortedSessions.map((session) => {
            const isActive = activeSessionId === session.id
            const isDeleting = deletingSessionId === session.id

            const isEditingThis = isEditing && targetSession?.id === session.id

            return (
              <SessionItem
                key={session.id}
                className={isActive ? 'active' : ''}
                onClick={() => onSessionSelect(session.id)}>
                {isEditingThis ? (
                  <SessionEditInput {...inputProps} onClick={(e) => e.stopPropagation()} autoFocus />
                ) : (
                  <SessionContent>
                    <SessionName
                      title={session.name || t('common.unnamed')}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setTargetSession(session)
                        startEdit(session.name || '')
                      }}>
                      {session.name || t('common.unnamed')}
                    </SessionName>
                    <SessionPreview sessionId={session.id} />
                  </SessionContent>
                )}
                <MenuButton
                  className="menu"
                  onClick={(e) => {
                    if (isDeleting) {
                      handleConfirmDelete(session, e)
                    } else {
                      handleDeleteClick(session.id, e)
                    }
                  }}>
                  {isDeleting ? (
                    <DeleteIcon size={14} style={{ pointerEvents: 'none' }} />
                  ) : (
                    <X size={14} style={{ pointerEvents: 'none' }} />
                  )}
                </MenuButton>
              </SessionItem>
            )
          })
        )}
      </SessionList>
      <HeaderRow>
        <Tooltip title={t('agent.settings.title', 'Agent Settings')}>
          <IconButton onClick={handleOpenSettings} disabled={!activeSessionId}>
            <Settings2 size={16} />
          </IconButton>
        </Tooltip>
      </HeaderRow>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
`

const LogoArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 16px 8px;
  -webkit-app-region: drag;

  img {
    height: 56px;
    pointer-events: none;
  }
`

const LoadingContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`

const ErrorContainer = styled.div`
  padding: 16px;
`

const HeaderRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--color-border);
`

const breathe = keyframes`
  0%, 100% { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
  50% { box-shadow: 0 2px 8px 0 rgba(176, 115, 83, 0.3); }
`

const IconButton = styled.button<{ disabled?: boolean }>`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(176, 115, 83, 0.1);
  border: none;
  border-radius: var(--list-item-border-radius);
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  color: rgba(176, 115, 83, 0.6);
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--speedy-brand, #B07353);
    color: #fff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    animation: ${breathe} 3s ease-in-out infinite;
  }
`

const AddTopicButton = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  color: var(--color-text-secondary);
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: var(--color-background-soft);
    color: var(--color-text);
  }
`

const SessionListTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin: 0 10px 4px;
  border-bottom: 1px solid var(--color-border);

  .text {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
    letter-spacing: 0.5px;
  }

  .count {
    margin-left: auto;
    font-size: 10px;
    color: #fff;
    background: var(--speedy-brand, #B07353);
    padding: 1px 6px;
    border-radius: 10px;
  }
`

const SessionList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 10px 10px;
`

const SessionItem = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: var(--list-item-border-radius);
  cursor: pointer;
  background: rgba(176, 115, 83, 0.1);
  color: #000;
  border: none;
  width: calc(var(--assistants-width) - 20px);
  margin-bottom: 8px;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;

  .menu {
    opacity: 0;
    color: var(--color-text-3);
  }

  &:hover {
    background: rgba(176, 115, 83, 0.2);

    .menu {
      opacity: 1;
    }
  }

  &.active {
    background-color: var(--speedy-brand, #B07353);
    color: #fff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    animation: ${breathe} 3s ease-in-out infinite;

    .menu {
      opacity: 1;
      color: rgba(255, 255, 255, 0.7);

      &:hover {
        color: #fff;
      }
    }

    .anticon, svg {
      color: #fff;
    }
  }
`

const SessionContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 2px;
`

const SessionPreviewText = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11px;
  color: rgba(176, 115, 83, 0.6);

  .active & {
    color: rgba(255, 255, 255, 0.7);
  }
`

const SessionName = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  position: relative;
  text-align: left;
  color: inherit;

  .active & {
    font-weight: 600;
  }
`

const SessionEditInput = styled.input`
  background: var(--color-background);
  border: none;
  color: var(--color-text-1);
  font-size: 13px;
  font-family: inherit;
  padding: 2px 6px;
  width: 100%;
  outline: none;
  flex: 1;
`

const MenuButton = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;

  .anticon {
    font-size: 12px;
  }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
`

const EmptyText = styled.div`
  font-size: 13px;
  color: var(--color-text-secondary);
`

export default memo(SpeedySessionsSidebar)
