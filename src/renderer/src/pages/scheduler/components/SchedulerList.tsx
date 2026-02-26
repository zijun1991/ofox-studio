import { DeleteOutlined, EditOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { SchedulerEntity } from '@types'
import { Badge, Button, Card, message, Popconfirm, Space, Switch, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { Clock, Play, Repeat } from 'lucide-react'
import type { FC } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { parseCronExpression } from '../utils/cronUtils'

interface SchedulerListProps {
  schedulers: SchedulerEntity[]
  onEdit: (id: string) => void
  onToggle: (id: string, enabled: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTrigger: (id: string) => Promise<void>
}

const SchedulerList: FC<SchedulerListProps> = ({ schedulers, onEdit, onToggle, onDelete, onTrigger }) => {
  const { t } = useTranslation()

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await onToggle(id, enabled)
        message.success(enabled ? t('scheduler.enabled') : t('scheduler.disabled'))
      } catch (error) {
        message.error(t('scheduler.toggleFailed'))
        console.error('Failed to toggle scheduler:', error)
      }
    },
    [onToggle, t]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await onDelete(id)
        message.success(t('scheduler.deleteSuccess'))
      } catch (error) {
        message.error(t('scheduler.deleteFailed'))
        console.error('Failed to delete scheduler:', error)
      }
    },
    [onDelete, t]
  )

  const handleTrigger = useCallback(
    async (id: string) => {
      try {
        await onTrigger(id)
        message.success(t('scheduler.triggerSuccess'))
      } catch (error) {
        message.error(t('scheduler.triggerFailed'))
        console.error('Failed to trigger scheduler:', error)
      }
    },
    [onTrigger, t]
  )

  return (
    <ListContainer>
      {schedulers.map((scheduler) => (
        <SchedulerCard key={scheduler.id}>
          <CardHeader>
            <CardTitle>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {scheduler.name}
              </Typography.Title>
              <Badge
                status={scheduler.enabled ? 'success' : 'default'}
                text={scheduler.enabled ? t('scheduler.statusEnabled') : t('scheduler.statusDisabled')}
              />
            </CardTitle>
            <Switch
              checked={scheduler.enabled}
              onChange={(checked) => handleToggle(scheduler.id, checked)}
              size="small"
            />
          </CardHeader>

          {scheduler.description && <CardDescription>{scheduler.description}</CardDescription>}

          <CardMeta>
            <MetaItem>
              <Clock size={14} />
              <span>
                {(() => {
                  const desc = parseCronExpression(scheduler.cron_expression)
                  return t(desc.text, desc.params)
                })()}
              </span>
            </MetaItem>
            <MetaItem>
              <Repeat size={14} />
              <CronCode>{scheduler.cron_expression}</CronCode>
            </MetaItem>
            <MetaItem>
              <Play size={14} />
              <span>
                {scheduler.next_run_at ? dayjs(scheduler.next_run_at).format('MM-DD HH:mm') : t('scheduler.noNextRun')}
              </span>
            </MetaItem>
          </CardMeta>

          <MessagePreview>
            <Typography.Text type="secondary" ellipsis>
              {scheduler.message_content}
            </Typography.Text>
          </MessagePreview>

          <CardActions>
            <Space>
              <Tooltip title={t('scheduler.trigger')}>
                <Button
                  type="text"
                  icon={<PlayCircleOutlined />}
                  size="small"
                  onClick={() => handleTrigger(scheduler.id)}
                />
              </Tooltip>
              <Tooltip title={t('common.edit')}>
                <Button type="text" icon={<EditOutlined />} size="small" onClick={() => onEdit(scheduler.id)} />
              </Tooltip>
              <Popconfirm
                title={t('scheduler.deleteConfirm.title')}
                description={t('scheduler.deleteConfirm.description')}
                onConfirm={() => handleDelete(scheduler.id)}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}>
                <Tooltip title={t('common.delete')}>
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Tooltip>
              </Popconfirm>
            </Space>
            <TimeInfo>
              {scheduler.last_run_at && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t('scheduler.lastRun')}: {dayjs(scheduler.last_run_at).format('MM-DD HH:mm:ss')}
                </Typography.Text>
              )}
            </TimeInfo>
          </CardActions>
        </SchedulerCard>
      ))}
    </ListContainer>
  )
}

const ListContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
`

const SchedulerCard = styled(Card)`
  .ant-card-body {
    padding: 16px;
  }
`

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
`

const CardTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const CardDescription = styled.div`
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-bottom: 12px;
`

const CardMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 0.5px solid var(--color-border);
`

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
`

const CronCode = styled.code`
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  background: var(--color-background-soft);
  padding: 2px 6px;
  border-radius: 4px;
`

const MessagePreview = styled.div`
  background: var(--color-background-soft);
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
`

const CardActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const TimeInfo = styled.div`
  display: flex;
  align-items: center;
`

export default SchedulerList
