import type { SchedulerLogEntity } from '@types'
import { Badge, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import type { FC } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { useSchedulerLogs } from '../hooks/useSchedulers'
import { formatDuration } from '../utils/cronUtils'

interface ExecutionLogsProps {
  schedulerId?: string
}

const ExecutionLogs: FC<ExecutionLogsProps> = ({ schedulerId }) => {
  const { t } = useTranslation()
  const { logs, loading, fetchLogs } = useSchedulerLogs()

  useEffect(() => {
    fetchLogs({ scheduler_id: schedulerId, limit: 100 })
  }, [fetchLogs, schedulerId])

  const getStatusBadge = (status: SchedulerLogEntity['status']) => {
    switch (status) {
      case 'success':
        return <Badge status="success" text={t('scheduler.logs.statusSuccess')} />
      case 'failed':
        return <Badge status="error" text={t('scheduler.logs.statusFailed')} />
      case 'timeout':
        return <Badge status="warning" text={t('scheduler.logs.statusTimeout')} />
      case 'running':
        return <Badge status="processing" text={t('scheduler.logs.statusRunning')} />
      default:
        return <Badge status="default" text={status} />
    }
  }

  return (
    <Container>
      <Header>
        <Typography.Title level={5}>{t('scheduler.logs.title')}</Typography.Title>
      </Header>
      <Table
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
        columns={[
          {
            title: t('scheduler.logs.columns.triggeredAt'),
            dataIndex: 'triggered_at',
            key: 'triggered_at',
            width: 160,
            render: (value: string) => <span style={{ fontSize: 12 }}>{dayjs(value).format('MM-DD HH:mm:ss')}</span>
          },
          {
            title: t('scheduler.logs.columns.status'),
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: SchedulerLogEntity['status']) => getStatusBadge(status)
          },
          {
            title: t('scheduler.logs.columns.duration'),
            dataIndex: 'duration_ms',
            key: 'duration_ms',
            width: 100,
            render: (value: number | null) => <span>{value ? formatDuration(value) : '-'}</span>
          },
          {
            title: t('scheduler.logs.columns.message'),
            dataIndex: 'message_sent',
            key: 'message_sent',
            width: 100,
            render: (value: boolean) => (
              <span style={{ color: value ? 'var(--color-success)' : 'var(--color-error)' }}>
                {value ? t('common.yes') : t('common.no')}
              </span>
            )
          },
          {
            title: t('scheduler.logs.columns.error'),
            dataIndex: 'error_message',
            key: 'error_message',
            width: 200,
            render: (value: string | null) => (
              <Typography.Text type="danger" ellipsis style={{ fontSize: 12 }}>
                {value || '-'}
              </Typography.Text>
            )
          }
        ]}
        locale={{ emptyText: t('common.noData') }}
      />
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

export default ExecutionLogs
