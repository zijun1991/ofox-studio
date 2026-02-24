import AgentModalPopup from '@renderer/components/Popups/agent/AgentModal'
import { useAgentClient } from '@renderer/hooks/agents/useAgentClient'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { deleteChannel, setChannelEnabled, updateChannel } from '@renderer/store/channels'
import type { ChannelEntity } from '@renderer/types/channel'
import { generateChannelBoundAgentName } from '@renderer/types/channel'
import { Button, Input, InputNumber, message, Popconfirm, Select, Switch } from 'antd'
import type { FC } from 'react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const ChannelDetail: FC = () => {
  const { channelId } = useParams<{ channelId: string }>()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const channel = useAppSelector((state) => state.channels.channels.find((c) => c.id === channelId))
  const status = useAppSelector((state) => (channelId ? state.channels.statuses[channelId] : undefined))
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  const agentClient = useAgentClient()

  // Check if channel is already bound to an agent
  const isBound = !!(channel?.agentId && channel?.sessionId)

  const syncChannelsToMainProcess = useCallback((updated: ChannelEntity) => {
    const allChannels = window.store.getState().channels.channels
    const updatedChannels = allChannels.map((c: ChannelEntity) => (c.id === updated.id ? updated : c))
    window.api.channels.syncConfig(updatedChannels)
  }, [])

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!channel) return
      dispatch(setChannelEnabled({ id: channel.id, enabled }))

      if (enabled) {
        await window.api.channels.start(channel.id)
      } else {
        await window.api.channels.stop(channel.id)
      }
    },
    [channel, dispatch]
  )

  const handleDelete = useCallback(async () => {
    if (!channel) return

    if (channel.enabled) {
      await window.api.channels.stop(channel.id)
    }

    // Delete bound agent if exists
    if (channel.agentId) {
      try {
        await agentClient.deleteAgent(channel.agentId)
      } catch (error) {
        console.warn('Failed to delete bound agent:', error)
        // Continue with channel deletion even if agent deletion fails
      }
    }

    dispatch(deleteChannel(channel.id))
    const remaining = window.store.getState().channels.channels
    window.api.channels.syncConfig(remaining)
    navigate('/settings/channels')
    message.success(t('channels.deleted', 'Channel deleted'))
  }, [channel, dispatch, navigate, t, agentClient])

  const handleTestConnection = useCallback(async () => {
    if (!channel) return
    const result = await window.api.channels.testConnection(channel)
    if (result.success) {
      message.success(result.message)
    } else {
      message.error(result.message)
    }
  }, [channel])

  const handleCreateBoundAgent = useCallback(async () => {
    if (!channel || isBound) {
      message.warning(t('channels.binding_already_bound', 'Channel is already bound to an agent'))
      return
    }

    setIsCreatingAgent(true)
    const agentName = generateChannelBoundAgentName(channel.type, channel.name)

    try {
      const result = await AgentModalPopup.show({
        channelBinding: {
          channelType: channel.type,
          channelName: channel.name,
          channelId: channel.id,
          fixedName: agentName,
          fixedPermissionMode: 'bypassPermissions'
        }
      })

      if (result?.agentId && result?.sessionId) {
        // Update channel with binding info
        const updated: ChannelEntity = {
          ...channel,
          agentId: result.agentId,
          sessionId: result.sessionId,
          updatedAt: new Date().toISOString()
        }
        dispatch(updateChannel(updated))

        // Sync to main process
        syncChannelsToMainProcess(updated)

        message.success(t('channels.binding_success', 'Agent created and bound successfully'))
      }
    } catch (error) {
      console.error('Failed to create bound agent:', error)
      message.error(t('channels.binding_error', 'Failed to create and bind agent'))
    } finally {
      setIsCreatingAgent(false)
    }
  }, [channel, dispatch, t, isBound, syncChannelsToMainProcess])

  const handleEditBoundAgent = useCallback(async () => {
    if (!channel?.agentId) {
      message.warning(t('channels.binding_no_agent', 'No agent bound to this channel'))
      return
    }

    // Open agent edit modal - user can edit all fields except name and permission mode
    try {
      const agent = await agentClient.getAgent(channel.agentId)
      await AgentModalPopup.show({
        agent
      })
    } catch (error) {
      console.error('Failed to open agent for editing:', error)
      message.error(t('channels.binding_edit_error', 'Failed to open agent for editing'))
    }
  }, [channel?.agentId, t, agentClient])

  // Save config handlers
  const handleSaveWebhookConfig = useCallback(
    (secret: string) => {
      if (!channel) return
      const updated: ChannelEntity = {
        ...channel,
        webhookConfig: { secret },
        updatedAt: new Date().toISOString()
      }
      dispatch(updateChannel(updated))
      syncChannelsToMainProcess(updated)
      message.success(t('channels.saved', 'Channel saved'))
    },
    [channel, dispatch, t, syncChannelsToMainProcess]
  )

  const handleSaveEmailConfig = useCallback(
    (config: Partial<NonNullable<ChannelEntity['emailConfig']>>) => {
      if (!channel) return
      const updated: ChannelEntity = {
        ...channel,
        emailConfig: { ...channel.emailConfig, ...config } as ChannelEntity['emailConfig'],
        updatedAt: new Date().toISOString()
      }
      dispatch(updateChannel(updated))
      syncChannelsToMainProcess(updated)
      message.success(t('channels.saved', 'Channel saved'))
    },
    [channel, dispatch, t, syncChannelsToMainProcess]
  )

  const handleSaveTelegramConfig = useCallback(
    (config: Partial<NonNullable<ChannelEntity['telegramConfig']>>) => {
      if (!channel) return
      const updated: ChannelEntity = {
        ...channel,
        telegramConfig: { ...channel.telegramConfig, ...config } as ChannelEntity['telegramConfig'],
        updatedAt: new Date().toISOString()
      }
      dispatch(updateChannel(updated))
      syncChannelsToMainProcess(updated)
      message.success(t('channels.saved', 'Channel saved'))
    },
    [channel, dispatch, t, syncChannelsToMainProcess]
  )

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!channel) return
      const updated = { ...channel, name: e.target.value, updatedAt: new Date().toISOString() }
      dispatch(updateChannel(updated))
      syncChannelsToMainProcess(updated)
    },
    [channel, dispatch, syncChannelsToMainProcess]
  )

  if (!channel) {
    return <EmptyState>{t('channels.not_found', 'Channel not found')}</EmptyState>
  }

  return (
    <SettingContainer>
      <SettingGroup>
        <SettingTitle>
          {channel.name}
          <StatusBadge $status={status || 'inactive'}>{status || 'inactive'}</StatusBadge>
        </SettingTitle>
        <SettingDivider />

        <SettingRow>
          <SettingRowTitle>{t('channels.enabled', 'Enabled')}</SettingRowTitle>
          <Switch checked={channel.enabled} onChange={handleToggleEnabled} />
        </SettingRow>
        <SettingDivider />

        <SettingRow>
          <SettingRowTitle>{t('channels.name', 'Name')}</SettingRowTitle>
          <Input style={{ width: 240 }} value={channel.name} onChange={handleNameChange} />
        </SettingRow>
        <SettingDivider />

        <SettingRow>
          <SettingRowTitle>{t('channels.type', 'Type')}</SettingRowTitle>
          <span style={{ textTransform: 'capitalize' }}>{channel.type}</span>
        </SettingRow>
      </SettingGroup>

      {/* Agent Binding Section */}
      <SettingGroup>
        <SettingTitle>{t('channels.binding', 'Agent Binding')}</SettingTitle>
        <SettingDivider />

        {isBound ? (
          <>
            <SettingRow>
              <SettingRowTitle>{t('channels.bound_agent', 'Bound Agent')}</SettingRowTitle>
              <BoundInfo>
                <AgentIdDisplay>{channel.agentId}</AgentIdDisplay>
                <BoundBadge>{t('channels.bound', 'Bound')}</BoundBadge>
              </BoundInfo>
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.bound_session', 'Bound Session')}</SettingRowTitle>
              <BoundInfo>
                <SessionIdDisplay>{channel.sessionId}</SessionIdDisplay>
                <BoundBadge>{t('channels.bound', 'Bound')}</BoundBadge>
              </BoundInfo>
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle></SettingRowTitle>
              <Button type="default" onClick={handleEditBoundAgent}>
                {t('channels.edit_agent', 'Edit Agent')}
              </Button>
            </SettingRow>
            <HelpText>
              {t(
                'channels.binding_locked_hint',
                'Agent and Session are locked. To change binding, delete and recreate this channel.'
              )}
            </HelpText>
          </>
        ) : (
          <>
            <SettingRow>
              <SettingRowTitle>{t('channels.binding_status', 'Binding Status')}</SettingRowTitle>
              <UnboundBadge>{t('channels.unbound', 'Unbound')}</UnboundBadge>
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle></SettingRowTitle>
              <Button type="primary" onClick={handleCreateBoundAgent} loading={isCreatingAgent}>
                {t('channels.create_agent_and_bind', 'Create Agent & Bind')}
              </Button>
            </SettingRow>
            <HelpText>
              {t(
                'channels.binding_create_hint',
                'This will create a new Agent with auto-approve mode and bind it to this channel.'
              )}
            </HelpText>
          </>
        )}
      </SettingGroup>

      {/* Webhook Configuration */}
      {channel.type === 'webhook' && (
        <SettingGroup>
          <SettingTitle>{t('channels.webhook.config', 'Webhook Configuration')}</SettingTitle>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{t('channels.webhook.endpoint', 'Endpoint')}</SettingRowTitle>
            <EndpointText>{`/v1/channels/${channel.id}/webhook`}</EndpointText>
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{t('channels.webhook.secret', 'HMAC Secret')}</SettingRowTitle>
            <Input.Password
              style={{ width: 300 }}
              placeholder={t('channels.webhook.secret_placeholder', 'Optional')}
              value={channel.webhookConfig?.secret || ''}
              onChange={(e) => handleSaveWebhookConfig(e.target.value)}
            />
          </SettingRow>
        </SettingGroup>
      )}

      {/* Email Configuration */}
      {channel.type === 'email' && (
        <>
          <SettingGroup>
            <SettingTitle>{t('channels.email.imap', 'IMAP (Inbound)')}</SettingTitle>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.host', 'Host')}</SettingRowTitle>
              <Input
                style={{ width: 300 }}
                placeholder="imap.example.com"
                value={channel.emailConfig?.imapHost || ''}
                onChange={(e) => handleSaveEmailConfig({ imapHost: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.port', 'Port')}</SettingRowTitle>
              <InputNumber
                style={{ width: 120 }}
                placeholder="993"
                value={channel.emailConfig?.imapPort ?? 993}
                onChange={(value) => handleSaveEmailConfig({ imapPort: value ?? undefined })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.user', 'Username')}</SettingRowTitle>
              <Input
                style={{ width: 300 }}
                value={channel.emailConfig?.imapUser || ''}
                onChange={(e) => handleSaveEmailConfig({ imapUser: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.password', 'Password')}</SettingRowTitle>
              <Input.Password
                style={{ width: 300 }}
                value={channel.emailConfig?.imapPassword || ''}
                onChange={(e) => handleSaveEmailConfig({ imapPassword: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.tls', 'TLS')}</SettingRowTitle>
              <Switch
                checked={channel.emailConfig?.imapTls ?? true}
                onChange={(checked) => handleSaveEmailConfig({ imapTls: checked })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.folder', 'Folder')}</SettingRowTitle>
              <Input
                style={{ width: 200 }}
                placeholder="INBOX"
                value={channel.emailConfig?.imapFolder || 'INBOX'}
                onChange={(e) => handleSaveEmailConfig({ imapFolder: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.poll_interval', 'Poll Interval (sec)')}</SettingRowTitle>
              <InputNumber
                style={{ width: 120 }}
                min={10}
                placeholder="60"
                value={channel.emailConfig?.pollIntervalSec ?? 60}
                onChange={(value) => handleSaveEmailConfig({ pollIntervalSec: value ?? undefined })}
              />
            </SettingRow>
          </SettingGroup>

          <SettingGroup>
            <SettingTitle>{t('channels.email.smtp', 'SMTP (Outbound)')}</SettingTitle>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.host', 'Host')}</SettingRowTitle>
              <Input
                style={{ width: 300 }}
                placeholder="smtp.example.com"
                value={channel.emailConfig?.smtpHost || ''}
                onChange={(e) => handleSaveEmailConfig({ smtpHost: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.port', 'Port')}</SettingRowTitle>
              <InputNumber
                style={{ width: 120 }}
                placeholder="587"
                value={channel.emailConfig?.smtpPort ?? 587}
                onChange={(value) => handleSaveEmailConfig({ smtpPort: value ?? undefined })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.user', 'Username')}</SettingRowTitle>
              <Input
                style={{ width: 300 }}
                value={channel.emailConfig?.smtpUser || ''}
                onChange={(e) => handleSaveEmailConfig({ smtpUser: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.password', 'Password')}</SettingRowTitle>
              <Input.Password
                style={{ width: 300 }}
                value={channel.emailConfig?.smtpPassword || ''}
                onChange={(e) => handleSaveEmailConfig({ smtpPassword: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.tls', 'TLS')}</SettingRowTitle>
              <Switch
                checked={channel.emailConfig?.smtpTls ?? true}
                onChange={(checked) => handleSaveEmailConfig({ smtpTls: checked })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.from_name', 'From Name')}</SettingRowTitle>
              <Input
                style={{ width: 200 }}
                value={channel.emailConfig?.fromName || ''}
                onChange={(e) => handleSaveEmailConfig({ fromName: e.target.value })}
              />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{t('channels.email.from_address', 'From Address')}</SettingRowTitle>
              <Input
                style={{ width: 300 }}
                placeholder={t('channels.email.from_address_placeholder', 'Defaults to SMTP user')}
                value={channel.emailConfig?.fromAddress || ''}
                onChange={(e) => handleSaveEmailConfig({ fromAddress: e.target.value })}
              />
            </SettingRow>
          </SettingGroup>
        </>
      )}

      {/* Telegram Configuration */}
      {channel.type === 'telegram' && (
        <SettingGroup>
          <SettingTitle>{t('channels.telegram.config', 'Telegram Bot Configuration')}</SettingTitle>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{t('channels.telegram.bot_token', 'Bot Token')}</SettingRowTitle>
            <Input.Password
              style={{ width: 360 }}
              placeholder={t('channels.telegram.bot_token_placeholder', 'Enter your bot token from @BotFather')}
              value={channel.telegramConfig?.botToken || ''}
              onChange={(e) => handleSaveTelegramConfig({ botToken: e.target.value })}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{t('channels.telegram.poll_interval', 'Poll Interval (sec)')}</SettingRowTitle>
            <InputNumber
              style={{ width: 120 }}
              min={1}
              placeholder="2"
              value={channel.telegramConfig?.pollIntervalSec ?? 2}
              onChange={(value) => handleSaveTelegramConfig({ pollIntervalSec: value ?? undefined })}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{t('channels.telegram.allowed_chat_ids', 'Allowed Chat IDs')}</SettingRowTitle>
            <Input
              style={{ width: 360 }}
              placeholder={t('channels.telegram.allowed_chat_ids_placeholder', 'Comma-separated, leave empty for all')}
              value={channel.telegramConfig?.allowedChatIds?.join(', ') || ''}
              onChange={(e) => {
                const chatIds = e.target.value
                  ? e.target.value
                      .split(',')
                      .map((s: string) => Number(s.trim()))
                      .filter((n: number) => !isNaN(n))
                  : undefined
                handleSaveTelegramConfig({ allowedChatIds: chatIds })
              }}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{t('channels.telegram.parse_mode', 'Parse Mode')}</SettingRowTitle>
            <Select
              style={{ width: 180 }}
              placeholder="Markdown"
              value={channel.telegramConfig?.parseMode || 'Markdown'}
              onChange={(value) => handleSaveTelegramConfig({ parseMode: value })}>
              <Select.Option value="Markdown">Markdown</Select.Option>
              <Select.Option value="MarkdownV2">MarkdownV2</Select.Option>
              <Select.Option value="HTML">HTML</Select.Option>
              <Select.Option value="">{t('channels.telegram.parse_mode_none', 'None')}</Select.Option>
            </Select>
          </SettingRow>
        </SettingGroup>
      )}

      {/* Action Buttons */}
      <ButtonRow>
        <Popconfirm
          title={t('channels.delete_confirm', 'Are you sure you want to delete this channel?')}
          onConfirm={handleDelete}
          okText={t('common.yes', 'Yes')}
          cancelText={t('common.no', 'No')}>
          <Button danger>{t('common.delete', 'Delete')}</Button>
        </Popconfirm>
        <Button onClick={handleTestConnection}>{t('channels.test_connection', 'Test Connection')}</Button>
      </ButtonRow>
    </SettingContainer>
  )
}

// Styled Components
const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 400;
  text-transform: capitalize;
  margin-left: 8px;
  background-color: ${(props) => {
    switch (props.$status) {
      case 'active':
        return 'var(--color-success-bg, rgba(82, 196, 26, 0.1))'
      case 'error':
        return 'var(--color-error-bg, rgba(255, 77, 79, 0.1))'
      default:
        return 'var(--color-fill-tertiary, rgba(0, 0, 0, 0.04))'
    }
  }};
  color: ${(props) => {
    switch (props.$status) {
      case 'active':
        return 'var(--color-success, #52c41a)'
      case 'error':
        return 'var(--color-error, #ff4d4f)'
      default:
        return 'var(--color-text-3)'
    }
  }};
`

const EndpointText = styled.code`
  font-size: 13px;
  background: var(--color-background-soft);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 16px 0;
`

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-3);
  font-size: 14px;
`

const BoundInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const AgentIdDisplay = styled.span`
  font-family: monospace;
  font-size: 12px;
  color: var(--color-text-2);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
`

const SessionIdDisplay = styled.span`
  font-family: monospace;
  font-size: 12px;
  color: var(--color-text-2);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
`

const BoundBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  background-color: var(--color-primary-bg, rgba(24, 144, 255, 0.1));
  color: var(--color-primary, #1890ff);
`

const UnboundBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  background-color: var(--color-fill-tertiary, rgba(0, 0, 0, 0.04));
  color: var(--color-text-3);
`

const HelpText = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 8px;
`

export default ChannelDetail
