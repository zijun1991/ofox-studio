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
import { DeleteIcon } from '@renderer/components/Icons'
import { permissionModeCards } from '@renderer/config/agent'
import { useCreateDefaultSession } from '@renderer/hooks/agents/useCreateDefaultSession'
import { useSession } from '@renderer/hooks/agents/useSession'
import { useSessions } from '@renderer/hooks/agents/useSessions'
import { useUpdateSession } from '@renderer/hooks/agents/useUpdateSession'
import { useInPlaceEdit } from '@renderer/hooks/useInPlaceEdit'
import { SessionSettingsPopup } from '@renderer/pages/settings/AgentSettings'
import type { AgentConfigurationState } from '@renderer/pages/settings/AgentSettings/shared'
import { useAppDispatch } from '@renderer/store'
import { newMessagesActions } from '@renderer/store/newMessage'
import { setActiveSessionIdAction, setSessionWaitingAction } from '@renderer/store/runtime'
import type { PermissionMode } from '@renderer/types/agent'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { Alert, Select, Spin, Tooltip } from 'antd'
import { motion } from 'framer-motion'
import { Plus, Settings2, X } from 'lucide-react'
import type { FC } from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface SpeedySessionsSidebarProps {
  agentId: string
  activeSessionId: string | null | undefined
  onSessionSelect: (sessionId: string) => void
}

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
  const { session } = useSession(agentId, activeSessionId || null)
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

  // Current permission mode
  const currentPermissionMode = (session?.configuration?.permission_mode as PermissionMode) || 'bypassPermissions'

  // Handle permission mode change
  const handlePermissionModeChange = useCallback(
    async (value: unknown) => {
      if (!activeSessionId || !session) return

      const nextConfiguration: AgentConfigurationState = {
        max_turns: 100,
        ...session.configuration,
        permission_mode: value as PermissionMode
      }

      await updateSession({
        id: activeSessionId,
        configuration: nextConfiguration
      })
    },
    [activeSessionId, session, updateSession]
  )

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
      <HeaderRow>
        {/* 左侧：权限模式选择器 */}
        <PermissionModeSelect
          value={currentPermissionMode}
          onChange={handlePermissionModeChange}
          style={{ flex: 1 }}
          optionLabelProp="label"
          popupMatchSelectWidth={280}
          disabled={!activeSessionId}
          suffixIcon={
            <ShortcutHint>
              <Kbd>⇧</Kbd>
              <span>+</span>
              <Kbd>Tab</Kbd>
            </ShortcutHint>
          }>
          {permissionModeCards.map((item) => (
            <Select.Option
              key={item.mode}
              value={item.mode}
              label={
                <span>
                  {item.icon} {t(item.titleKey, item.titleFallback)}
                </span>
              }>
              <PermissionOptionWrapper>
                <div className="title">
                  {item.icon} {t(item.titleKey, item.titleFallback)}
                </div>
                <div className={`description ${item.caution ? 'caution' : ''}`}>
                  {t(item.descriptionKey, item.descriptionFallback)}
                </div>
              </PermissionOptionWrapper>
            </Select.Option>
          ))}
        </PermissionModeSelect>

        {/* 右侧：设置按钮 */}
        <Tooltip title={t('agent.settings.title', 'Agent Settings')}>
          <IconButton onClick={handleOpenSettings} disabled={!activeSessionId}>
            <Settings2 size={16} />
          </IconButton>
        </Tooltip>
      </HeaderRow>
      <SessionListTitle>
        <span className="text">{t('speedy.topic_list_title', '话题列表')}</span>
        <span className="count">{sortedSessions.length}</span>
      </SessionListTitle>
      <NewTopicButton onClick={handleCreateSession} disabled={creatingSession}>
        <Plus size={14} />
        {t('chat.add.topic.title')}
      </NewTopicButton>
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
                  <SessionName
                    title={session.name || t('common.unnamed')}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setTargetSession(session)
                      startEdit(session.name || '')
                    }}>
                    {session.name || t('common.unnamed')}
                  </SessionName>
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
                    <X size={14} style={{ pointerEvents: 'none', color: 'var(--color-text-3)' }} />
                  )}
                </MenuButton>
              </SessionItem>
            )
          })
        )}
      </SessionList>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
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
  padding: 8px 10px 0;
  margin-bottom: 8px;
`

const PermissionModeSelect = styled(Select)`
  .ant-select-selector {
    background: var(--color-background-soft) !important;
    border: none !important;
    border-radius: 6px !important;
    height: 32px !important;
    padding: 0 8px !important;
  }

  .ant-select-selection-item {
    font-size: 12px;
    color: var(--color-text);
  }

  .ant-select-arrow {
    color: inherit;
    pointer-events: none;
  }

  &.ant-select-disabled .ant-select-selector {
    opacity: 0.5;
  }
`

const ShortcutHint = styled.div`
  display: flex;
  align-items: center;
  gap: 1px;

  span {
    font-size: 7px;
    color: rgba(0, 0, 0, 0.2);
    line-height: 1;
  }
`

const Kbd = styled.kbd`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 12px;
  height: 12px;
  padding: 0 2px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 7px;
  font-weight: 500;
  line-height: 1;
  color: rgba(0, 0, 0, 0.25);
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-bottom-width: 1.5px;
  border-radius: 2px;
`

const IconButton = styled.button<{ disabled?: boolean }>`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft);
  border: none;
  border-radius: 6px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  color: var(--color-text-2);
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: var(--color-list-item);
    color: var(--color-text);
  }
`

const PermissionOptionWrapper = styled.div`
  padding: 4px 0;

  .title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: 2px;
  }

  .description {
    font-size: 11px;
    color: var(--color-text-secondary);
    line-height: 1.4;

    &.caution {
      color: var(--color-error);
      font-weight: 600;
    }
  }
`

const NewTopicButton = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 4px 10px 4px 20px;
  padding: 6px 0;
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  color: var(--color-text-secondary);
  font-size: 12px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-background-soft);
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
    flex: 1;
  }

  .count {
    font-size: 10px;
    color: var(--color-text-tertiary);
    background: var(--color-background-soft);
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
  background: transparent;
  border: none;
  width: calc(var(--assistants-width) - 20px);
  margin-bottom: 8px;

  .menu {
    opacity: 0;
    color: var(--color-text-3);
  }

  &:hover {
    background-color: var(--color-list-item-hover);
    transition: background-color 0.1s;

    .menu {
      opacity: 1;
    }
  }

  &.active {
    background-color: var(--color-list-item);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    border-left: 3px solid var(--color-primary);
    transform: translateX(2px);

    .menu {
      opacity: 1;

      &:hover {
        color: var(--color-text-2);
      }
    }
  }
`

const SessionName = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  position: relative;
  flex: 1;
  text-align: left;
  color: var(--color-text);
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
