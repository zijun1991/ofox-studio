import EmojiAvatar from '@renderer/components/Avatar/EmojiAvatar'
import { HStack } from '@renderer/components/Layout'
import UserPopup from '@renderer/components/Popups/UserPopup'
import { APP_NAME, AppLogo, isLocalAi } from '@renderer/config/env'
import { getModelLogoById } from '@renderer/config/models'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useAgent } from '@renderer/hooks/agents/useAgent'
import useAvatar from '@renderer/hooks/useAvatar'
import { useChatContext } from '@renderer/hooks/useChatContext'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import { useModelEmployee } from '@renderer/hooks/useModelEmployee'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useMessageStyle, useSettings } from '@renderer/hooks/useSettings'
import { getMessageModelId } from '@renderer/services/MessagesService'
import { getModelName } from '@renderer/services/ModelService'
import type { Assistant, Model, Topic } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'
import { firstLetter, isEmoji, removeLeadingEmoji } from '@renderer/utils'
import { Avatar, Checkbox, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { Sparkle } from 'lucide-react'
import type { FC } from 'react'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import styled from 'styled-components'

import MessageTokens from './MessageTokens'

interface Props {
  message: Message
  assistant: Assistant
  model?: Model
  topic: Topic
  isGroupContextMessage?: boolean
}

const getAvatarSource = (isLocalAi: boolean, modelId: string | undefined) => {
  if (isLocalAi) return AppLogo
  return modelId ? getModelLogoById(modelId) : undefined
}

const MessageHeader: FC<Props> = memo(({ assistant, model, message, topic, isGroupContextMessage }) => {
  const avatar = useAvatar()
  const { theme } = useTheme()
  const { userName, sidebarIcons } = useSettings()
  const { chat } = useRuntime()
  const { activeTopicOrSession, activeAgentId } = chat
  const { agent } = useAgent(activeAgentId)
  const isAgentView = activeTopicOrSession === 'session'
  const { t } = useTranslation()
  const { isBubbleStyle } = useMessageStyle()
  const { openMinappById } = useMinappPopup()
  const location = useLocation()
  const { employees } = useModelEmployee()

  // 判断是否在极速模式（根路径 "/"）
  const isSpeedyMode = location.pathname === '/'

  const { isMultiSelectMode, selectedMessageIds, handleSelectMessage } = useChatContext(topic)

  const isSelected = selectedMessageIds?.includes(message.id)

  const avatarSource = useMemo(() => getAvatarSource(isLocalAi, getMessageModelId(message)), [message])

  const getUserName = useCallback(() => {
    if (isLocalAi && message.role !== 'user') {
      return APP_NAME
    }

    // 极速模式下，优先显示模型员工名称
    if (isSpeedyMode && message.role === 'assistant') {
      const modelId = getMessageModelId(message) // 可能是 "gpt-4" 或 "openai:gpt-4"
      const modelProvider = message.model?.provider

      // 查找匹配的模型员工（支持两种格式匹配）
      const employee = employees.find((emp) => {
        // 方式1: provider 和 id 分开匹配
        if (emp.model.provider === modelProvider && emp.model.id === modelId) {
          return true
        }
        // 方式2: 完整格式匹配 (provider:id)
        const fullModelId = `${emp.model.provider}:${emp.model.id}`
        if (fullModelId === modelId) {
          return true
        }
        return false
      })

      if (employee) {
        return employee.name
      }

      // 如果找不到模型员工，尝试显示模型名称
      if (model?.name) {
        return model.name
      }
    }

    if (isAgentView && message.role === 'assistant') {
      return agent?.name ?? t('common.unknown')
    }

    if (message.role === 'assistant') {
      return getModelName(model) || getMessageModelId(message) || ''
    }

    if (isSpeedyMode && message.role === 'user') {
      return '我'
    }

    return userName || t('common.you')
  }, [agent?.name, isAgentView, message, model, t, userName, isSpeedyMode, employees])

  const isAssistantMessage = message.role === 'assistant'
  const isUserMessage = message.role === 'user'
  const showMinappIcon = sidebarIcons.visible.includes('minapp')

  // 获取 Agent 的 avatar 配置，默认为 ⭐
  const agentAvatar = agent?.configuration?.avatar || '⭐'
  const isEmojiAvatar = isEmoji(agentAvatar)

  const avatarName = useMemo(() => firstLetter(assistant?.name).toUpperCase(), [assistant?.name])
  const username = useMemo(() => removeLeadingEmoji(getUserName()), [getUserName])

  const showMiniApp = useCallback(() => {
    showMinappIcon && model?.provider && openMinappById(model.provider)
    // because don't need openMinappById to be a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.provider, showMinappIcon])

  const userNameJustifyContent = useMemo(() => {
    if (!isBubbleStyle) return 'flex-start'
    if (isUserMessage && !isMultiSelectMode) return 'flex-end'
    return 'flex-start'
  }, [isBubbleStyle, isUserMessage, isMultiSelectMode])

  return (
    <Container className="message-header">
      {isAssistantMessage ? (
        isEmojiAvatar ? (
          <EmojiAvatar size={35} fontSize={20}>
            {agentAvatar}
          </EmojiAvatar>
        ) : (
          <Avatar
            src={avatarSource}
            size={35}
            style={{
              borderRadius: '25%',
              cursor: showMinappIcon ? 'pointer' : 'default',
              border: isLocalAi ? '1px solid var(--color-border-soft)' : 'none',
              filter: theme === 'dark' ? 'invert(0.05)' : undefined
            }}
            onClick={showMiniApp}>
            {avatarName}
          </Avatar>
        )
      ) : (
        <>
          {isEmoji(avatar) ? (
            <EmojiAvatar onClick={() => UserPopup.show()} size={35} fontSize={20}>
              {avatar}
            </EmojiAvatar>
          ) : (
            <Avatar
              src={avatar}
              size={35}
              style={{ borderRadius: '25%', cursor: 'pointer' }}
              onClick={() => UserPopup.show()}
            />
          )}
        </>
      )}
      <UserWrap>
        <HStack alignItems="center" justifyContent={userNameJustifyContent}>
          <UserName isBubbleStyle={isBubbleStyle} theme={theme}>
            {username}
          </UserName>
          {isGroupContextMessage && (
            <Tooltip title={t('chat.message.useful.tip')}>
              <Sparkle fill="var(--color-primary)" strokeWidth={0} size={18} />
            </Tooltip>
          )}
        </HStack>
        <InfoWrap className="message-header-info-wrap text-(--color-text-3) text-[10px]">
          <MessageTime>
            {dayjs(message?.updatedAt ?? message.createdAt).format(
              isSpeedyMode ? 'YYYY/MM/DD HH:mm:ss' : 'MM/DD HH:mm'
            )}
          </MessageTime>
          {isBubbleStyle && message.usage !== undefined && (
            <>
              |
              <MessageTokens message={message} />
            </>
          )}
        </InfoWrap>
      </UserWrap>
      {isMultiSelectMode && (
        <Checkbox
          checked={isSelected}
          onChange={(e) => handleSelectMessage(message.id, e.target.checked)}
          style={{ position: 'absolute', right: 0, top: 0 }}
        />
      )}
    </Container>
  )
})

MessageHeader.displayName = 'MessageHeader'

const Container = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  position: relative;
  margin-bottom: 10px;
`

const UserWrap = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
`

const InfoWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
`

const UserName = styled.span<{ isBubbleStyle?: boolean; theme?: string }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.isBubbleStyle && props.theme === 'dark' ? 'white' : 'var(--color-text)')};
`

const MessageTime = styled.div`
  font-size: 10px;
  color: var(--color-text-3);
`

export default MessageHeader
