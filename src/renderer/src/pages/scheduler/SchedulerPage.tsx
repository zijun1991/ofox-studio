import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import { Alert, Button, Empty, message, Spin, Tabs, Tooltip } from 'antd'
import { Clock, History, Settings } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import ExecutionLogs from './components/ExecutionLogs'
import SchedulerForm from './components/SchedulerForm'
import SchedulerList from './components/SchedulerList'
import { useSchedulers } from './hooks/useSchedulers'

const SchedulerPage: FC = () => {
  const { t } = useTranslation()
  const { schedulers, loading, error, fetchSchedulers, toggleScheduler, deleteScheduler, triggerScheduler } =
    useSchedulers()
  const [activeTab, setActiveTab] = useState<'list' | 'logs'>('list')
  const [formVisible, setFormVisible] = useState(false)
  const [editingScheduler, setEditingScheduler] = useState<string | null>(null)

  useEffect(() => {
    fetchSchedulers()
  }, [fetchSchedulers])

  const handleCreate = useCallback(() => {
    setEditingScheduler(null)
    setFormVisible(true)
  }, [])

  const handleEdit = useCallback((id: string) => {
    setEditingScheduler(id)
    setFormVisible(true)
  }, [])

  const handleFormClose = useCallback(() => {
    setFormVisible(false)
    setEditingScheduler(null)
  }, [])

  const handleFormSuccess = useCallback(() => {
    setFormVisible(false)
    setEditingScheduler(null)
    fetchSchedulers()
    message.success(t('scheduler.saveSuccess'))
  }, [fetchSchedulers, t])

  const handleRetry = useCallback(() => {
    fetchSchedulers()
  }, [fetchSchedulers])

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      await toggleScheduler(id, enabled)
    },
    [toggleScheduler]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteScheduler(id)
    },
    [deleteScheduler]
  )

  const handleTrigger = useCallback(
    async (id: string) => {
      await triggerScheduler(id)
    },
    [triggerScheduler]
  )

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>
          <TitleContainer>
            <Clock size={18} />
            <Title>{t('scheduler.title')}</Title>
          </TitleContainer>
          <Tooltip title={t('scheduler.create')}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} size="small">
              {t('scheduler.create')}
            </Button>
          </Tooltip>
        </NavbarCenter>
      </Navbar>
      <ContentContainer>
        <TabsContainer>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'list' | 'logs')}
            items={[
              {
                key: 'list',
                label: (
                  <TabLabel>
                    <Settings size={14} />
                    {t('scheduler.tabs.schedulers')}
                  </TabLabel>
                )
              },
              {
                key: 'logs',
                label: (
                  <TabLabel>
                    <History size={14} />
                    {t('scheduler.tabs.logs')}
                  </TabLabel>
                )
              }
            ]}
          />
        </TabsContainer>
        <MainContent>
          {loading ? (
            <LoadingContainer>
              <Spin />
            </LoadingContainer>
          ) : error ? (
            <ErrorContainer>
              <Alert
                type="error"
                message={error}
                action={
                  <Button size="small" icon={<ReloadOutlined />} onClick={handleRetry}>
                    {t('common.retry')}
                  </Button>
                }
              />
            </ErrorContainer>
          ) : activeTab === 'list' ? (
            schedulers.length > 0 ? (
              <SchedulerList
                schedulers={schedulers}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onTrigger={handleTrigger}
              />
            ) : (
              <EmptyContainer>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <EmptyDescription>
                      <p>{t('scheduler.empty.title')}</p>
                      <p>{t('scheduler.empty.description')}</p>
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                        {t('scheduler.create')}
                      </Button>
                    </EmptyDescription>
                  }
                />
              </EmptyContainer>
            )
          ) : (
            <ExecutionLogs />
          )}
        </MainContent>
      </ContentContainer>
      <SchedulerForm
        visible={formVisible}
        schedulerId={editingScheduler}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: calc(100vh - var(--navbar-height));
  overflow: hidden;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
`

const TitleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const Title = styled.span`
  font-size: 14px;
  font-weight: 600;
`

const TabsContainer = styled.div`
  padding: 0 16px;
  border-bottom: 0.5px solid var(--color-border);

  .ant-tabs-nav {
    margin-bottom: 0;
  }
`

const TabLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
`

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
`

const ErrorContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  padding: 0 16px;
`

const EmptyContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
`

const EmptyDescription = styled.div`
  text-align: center;

  p:first-child {
    font-weight: 500;
    margin-bottom: 8px;
  }

  p:last-of-type {
    color: var(--color-text-secondary);
    margin-bottom: 16px;
  }
`

export default SchedulerPage
