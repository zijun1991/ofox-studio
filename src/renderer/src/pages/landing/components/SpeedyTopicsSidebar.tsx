/**
 * SpeedyTopicsSidebar - Topics list sidebar for Speedy Mode
 *
 * Features:
 * - List of topics (no assistants tab)
 * - New topic button
 * - Topic selection and management
 */
import { PlusOutlined } from '@ant-design/icons'
import { DeleteIcon, EditIcon } from '@renderer/components/Icons'
import PromptPopup from '@renderer/components/Popups/PromptPopup'
import db from '@renderer/databases'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useInPlaceEdit } from '@renderer/hooks/useInPlaceEdit'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import type { RootState } from '@renderer/store'
import type { Topic } from '@renderer/types'
import { classNames } from '@renderer/utils'
import type { MenuProps } from 'antd'
import { Button, Dropdown, Tooltip } from 'antd'
import { Copy, Plus, Trash2, X } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

interface SpeedyTopicsSidebarProps {
  assistantId: string
  activeTopic: Topic | null
  onTopicSelect: (topic: Topic) => void
  onNewTopic: () => void
}

const SpeedyTopicsSidebar: FC<SpeedyTopicsSidebarProps> = ({ assistantId, activeTopic, onTopicSelect, onNewTopic }) => {
  const { t } = useTranslation()
  const { assistant, removeTopic, updateTopic } = useAssistant(assistantId)
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)
  const [targetTopic, setTargetTopic] = useState<Topic | null>(null)

  // Get topics for the assistant from Redux
  const topics = useSelector((state: RootState) => {
    const assistant = state.assistants.assistants.find((a) => a.id === assistantId)
    return assistant?.topics || []
  })

  // Sort topics by creation date (newest first)
  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
  }, [topics])

  // Handle topic rename
  const handleRenameTopic = useCallback(
    async (topic: Topic) => {
      const name = await PromptPopup.show({
        title: t('chat.topics.edit.title'),
        message: '',
        defaultValue: topic.name || '',
        extraNode: <div style={{ color: 'var(--color-text-3)', marginTop: 8 }}>{t('chat.topics.edit.title_tip')}</div>
      })
      if (name && topic.name !== name) {
        const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
        updateTopic(updatedTopic)
      }
    },
    [t, updateTopic]
  )

  // Handle topic delete click
  const handleDeleteClick = useCallback((topicId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingTopicId(topicId)
    setTimeout(() => setDeletingTopicId(null), 2000)
  }, [])

  // Handle confirm delete
  const handleConfirmDelete = useCallback(
    async (topic: Topic, e: React.MouseEvent) => {
      e.stopPropagation()
      if (assistant.topics.length === 1) {
        const newTopic = getDefaultTopic(assistantId)
        await db.topics.add({ id: newTopic.id, messages: [] })
        onNewTopic()
      } else {
        const index = assistant.topics.findIndex((t) => t.id === topic.id)
        if (topic.id === activeTopic?.id) {
          onTopicSelect(assistant.topics[index + 1 === assistant.topics.length ? index - 1 : index + 1])
        }
      }
      removeTopic(topic)
      setDeletingTopicId(null)
    },
    [assistant.topics, assistantId, activeTopic?.id, onNewTopic, onTopicSelect, removeTopic]
  )

  // In-place edit hook
  const { startEdit, isEditing, inputProps } = useInPlaceEdit({
    onSave: (name: string) => {
      if (targetTopic && name !== targetTopic.name) {
        const updatedTopic = { ...targetTopic, name, isNameManuallyEdited: true }
        updateTopic(updatedTopic)
        window.toast.success(t('common.saved'))
      }
    },
    onCancel: () => {}
  })

  // Get topic menu items
  const getTopicMenuItems = useMemo((): MenuProps['items'] => {
    if (!targetTopic) return []

    return [
      {
        label: t('chat.topics.edit.title'),
        key: 'rename',
        icon: <EditIcon size={14} />,
        onClick: () => handleRenameTopic(targetTopic)
      },
      {
        label: t('chat.topics.copy.title'),
        key: 'copy',
        icon: <Copy size={14} />,
        children: [
          {
            label: t('chat.topics.copy.md'),
            key: 'md',
            onClick: () => {
              // TODO: implement copy topic as markdown
              window.toast.info(t('common.not_implemented'))
            }
          },
          {
            label: t('chat.topics.copy.plain_text'),
            key: 'plain_text',
            onClick: () => {
              // TODO: implement copy topic as plain text
              window.toast.info(t('common.not_implemented'))
            }
          }
        ]
      },
      {
        type: 'divider'
      },
      {
        label: t('common.delete'),
        danger: true,
        key: 'delete',
        icon: <Trash2 size={14} />,
        onClick: () => handleConfirmDelete(targetTopic, {} as React.MouseEvent)
      }
    ]
  }, [targetTopic, t, handleRenameTopic, handleConfirmDelete])

  return (
    <Container>
      <Header>
        <Title>{t('common.topics')}</Title>
        <Tooltip title={t('speedy.new_topic')}>
          <NewTopicBtn onClick={onNewTopic}>
            <Plus size={16} />
          </NewTopicBtn>
        </Tooltip>
      </Header>
      <TopicList>
        {sortedTopics.length === 0 ? (
          <EmptyState>
            <EmptyText>{t('speedy.no_topics')}</EmptyText>
            <Button type="primary" icon={<PlusOutlined />} onClick={onNewTopic}>
              {t('speedy.new_topic')}
            </Button>
          </EmptyState>
        ) : (
          sortedTopics.map((topic) => {
            const isActive = activeTopic?.id === topic.id
            const isDeleting = deletingTopicId === topic.id
            const isEditingThisTopic = isEditing && targetTopic?.id === topic.id

            return (
              <Dropdown
                key={topic.id}
                menu={{ items: getTopicMenuItems }}
                trigger={['contextMenu']}
                onOpenChange={(open) => {
                  if (open) {
                    setTargetTopic(topic)
                  }
                }}>
                <TopicItem className={classNames(isActive && 'active')} onClick={() => onTopicSelect(topic)}>
                  <TopicNameContainer>
                    {isEditingThisTopic ? (
                      <TopicEditInput {...inputProps} onClick={(e) => e.stopPropagation()} autoFocus />
                    ) : (
                      <TopicName
                        title={topic.name || t('common.unnamed')}
                        onDoubleClick={() => {
                          setTargetTopic(topic)
                          startEdit(topic.name || '')
                        }}>
                        {topic.name || t('common.unnamed')}
                      </TopicName>
                    )}
                    <MenuButton
                      className="menu"
                      onClick={(e) => {
                        if (isDeleting) {
                          handleConfirmDelete(topic, e)
                        } else {
                          handleDeleteClick(topic.id, e)
                        }
                      }}>
                      {isDeleting ? (
                        <DeleteIcon size={14} color="var(--color-error)" />
                      ) : (
                        <X size={14} color="var(--color-text-3)" />
                      )}
                    </MenuButton>
                  </TopicNameContainer>
                </TopicItem>
              </Dropdown>
            )
          })
        )}
      </TopicList>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 0.5px solid var(--color-border);
`

const Title = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`

const NewTopicBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s;

  &:hover {
    background: var(--color-background-soft);
    color: var(--color-text);
  }
`

const TopicList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
`

const TopicItem = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  background: transparent;
  border: 0.5px solid transparent;

  &:hover {
    background: var(--color-list-item-hover);

    .menu {
      opacity: 1;
    }
  }

  &.active {
    background: var(--color-list-item);
    border: 0.5px solid var(--color-border);

    .menu {
      opacity: 1;
    }
  }
`

const TopicNameContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`

const TopicName = styled.div`
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`

const TopicEditInput = styled.input`
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
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;

  &:hover {
    background: var(--color-background-mute);
  }

  .menu:hover & {
    opacity: 1;
  }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 16px;
`

const EmptyText = styled.div`
  font-size: 13px;
  color: var(--color-text-secondary);
`

export default SpeedyTopicsSidebar
