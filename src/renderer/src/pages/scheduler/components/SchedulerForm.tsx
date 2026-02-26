import { loggerService } from '@logger'
import type { CreateSchedulerRequest } from '@types'
import { Alert, Button, Divider, Form, Input, message, Modal, Select, Space } from 'antd'
import { Clock, MessageSquare, Settings, Zap } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { useSchedulers } from '../hooks/useSchedulers'
import { CRON_PRESETS, parseCronExpression, validateCronExpression } from '../utils/cronUtils'

const logger = loggerService.withContext('SchedulerForm')

interface SchedulerFormProps {
  visible: boolean
  schedulerId: string | null
  onClose: () => void
  onSuccess: () => void
}

interface AgentInfo {
  id: string
  name: string
}

interface SessionInfo {
  id: string
  name: string
  agentId: string
}

const SchedulerForm: FC<SchedulerFormProps> = ({ visible, schedulerId, onClose, onSuccess }) => {
  const { t } = useTranslation()
  const { createScheduler, updateScheduler, getScheduler } = useSchedulers()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [cronMode, setCronMode] = useState<'preset' | 'custom'>('preset')
  const [cronExpression, setCronExpression] = useState('0 0 9 * * *')

  // Load existing scheduler data when editing
  useEffect(() => {
    const loadScheduler = async () => {
      if (schedulerId) {
        try {
          const scheduler = await getScheduler(schedulerId)
          if (scheduler) {
            form.setFieldsValue({
              name: scheduler.name,
              description: scheduler.description,
              agent_id: scheduler.agent_id,
              session_id: scheduler.session_id,
              message_content: scheduler.message_content,
              timezone: scheduler.timezone
            })
            setSelectedAgentId(scheduler.agent_id)
            setCronExpression(scheduler.cron_expression)
          }
        } catch (error) {
          logger.error('Failed to load scheduler:', error as Error)
        }
      } else {
        form.resetFields()
        setSelectedAgentId(null)
        setCronExpression('0 0 9 * * *')
        setCronMode('preset')
      }
    }
    if (visible) {
      loadScheduler()
    }
  }, [visible, schedulerId, form, getScheduler])

  // Load agents when form opens
  useEffect(() => {
    const loadAgents = async () => {
      try {
        // TODO: Replace with actual agent list API
        const result = await window.electron.ipcRenderer.invoke('agent:list', { limit: 100 })
        setAgents(result.agents || [])
      } catch (error) {
        logger.error('Failed to load agents:', error as Error)
      }
    }
    if (visible) {
      loadAgents()
    }
  }, [visible])

  // Load sessions when agent is selected
  useEffect(() => {
    const loadSessions = async () => {
      if (!selectedAgentId) return
      try {
        // TODO: Replace with actual session list API
        const result = await window.electron.ipcRenderer.invoke('agent-session:list', {
          agent_id: selectedAgentId,
          limit: 100
        })
        setSessions(result.sessions || [])
      } catch (error) {
        logger.error('Failed to load sessions:', error as Error)
      }
    }
    loadSessions()
  }, [selectedAgentId])

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const data: CreateSchedulerRequest = {
        name: values.name,
        description: values.description,
        agent_id: values.agent_id,
        session_id: values.session_id,
        cron_expression: cronExpression,
        timezone: values.timezone || 'Asia/Shanghai',
        message_content: values.message_content,
        enabled: true
      }

      if (schedulerId) {
        await updateScheduler(schedulerId, data)
      } else {
        await createScheduler(data)
      }

      onSuccess()
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message)
      }
      logger.error('Failed to save scheduler:', error as Error)
    } finally {
      setLoading(false)
    }
  }, [form, cronExpression, schedulerId, updateScheduler, createScheduler, onSuccess])

  const handleAgentChange = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId)
      form.setFieldValue('session_id', undefined)
    },
    [form]
  )

  const handleCronPresetChange = useCallback((value: string) => {
    setCronExpression(value)
  }, [])

  const cronDescription = parseCronExpression(cronExpression)
  const isCronValid = validateCronExpression(cronExpression)

  return (
    <Modal
      title={schedulerId ? t('scheduler.editTitle') : t('scheduler.createTitle')}
      open={visible}
      onCancel={onClose}
      width={600}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={loading} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      }>
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormSection>
          <SectionTitle>
            <Settings size={16} />
            {t('scheduler.form.basicInfo')}
          </SectionTitle>

          <Form.Item
            name="name"
            label={t('scheduler.form.name')}
            rules={[{ required: true, message: t('scheduler.form.nameRequired') }]}>
            <Input placeholder={t('scheduler.form.namePlaceholder')} />
          </Form.Item>

          <Form.Item name="description" label={t('scheduler.form.description')}>
            <Input.TextArea placeholder={t('scheduler.form.descriptionPlaceholder')} rows={2} />
          </Form.Item>
        </FormSection>

        <Divider />

        <FormSection>
          <SectionTitle>
            <Clock size={16} />
            {t('scheduler.form.schedule')}
          </SectionTitle>

          <Form.Item label={t('scheduler.form.cronMode')}>
            <Select
              value={cronMode}
              onChange={setCronMode}
              options={[
                { value: 'preset', label: t('scheduler.form.cronPreset') },
                { value: 'custom', label: t('scheduler.form.cronCustom') }
              ]}
            />
          </Form.Item>

          {cronMode === 'preset' ? (
            <Form.Item label={t('scheduler.form.cronPreset')}>
              <Select
                value={cronExpression}
                onChange={handleCronPresetChange}
                options={CRON_PRESETS.map((preset) => ({
                  value: preset.value,
                  label: `${t(preset.label)} (${preset.value})`
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item
              label={t('scheduler.form.cronExpression')}
              validateStatus={isCronValid ? undefined : 'error'}
              help={!isCronValid ? t('scheduler.form.invalidCron') : undefined}>
              <Input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 0 9 * * *"
              />
            </Form.Item>
          )}

          {cronDescription.text && (
            <Alert
              type="info"
              message={t(
                cronDescription.text,
                cronDescription.translateParams
                  ? Object.fromEntries(
                      Object.entries(cronDescription.params || {}).map(([k, v]) => [
                        k,
                        cronDescription.translateParams!.includes(k) ? t(String(v)) : v
                      ])
                    )
                  : cronDescription.params
              )}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item name="timezone" label={t('scheduler.form.timezone')} initialValue="Asia/Shanghai">
            <Select
              options={[
                { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
                { value: 'UTC', label: 'UTC' },
                { value: 'America/New_York', label: 'America/New_York (UTC-5/-4)' },
                { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
                { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' }
              ]}
            />
          </Form.Item>
        </FormSection>

        <Divider />

        <FormSection>
          <SectionTitle>
            <Zap size={16} />
            {t('scheduler.form.target')}
          </SectionTitle>

          <Form.Item
            name="agent_id"
            label={t('scheduler.form.agent')}
            rules={[{ required: true, message: t('scheduler.form.agentRequired') }]}>
            <Select
              placeholder={t('scheduler.form.agentPlaceholder')}
              onChange={handleAgentChange}
              showSearch
              optionFilterProp="label"
              options={agents.map((agent) => ({
                value: agent.id,
                label: agent.name
              }))}
            />
          </Form.Item>

          <Form.Item
            name="session_id"
            label={t('scheduler.form.session')}
            rules={[{ required: true, message: t('scheduler.form.sessionRequired') }]}>
            <Select
              placeholder={t('scheduler.form.sessionPlaceholder')}
              disabled={!selectedAgentId}
              showSearch
              optionFilterProp="label"
              options={sessions.map((session) => ({
                value: session.id,
                label: session.name || session.id
              }))}
            />
          </Form.Item>
        </FormSection>

        <Divider />

        <FormSection>
          <SectionTitle>
            <MessageSquare size={16} />
            {t('scheduler.form.message')}
          </SectionTitle>

          <Form.Item
            name="message_content"
            label={t('scheduler.form.messageContent')}
            rules={[{ required: true, message: t('scheduler.form.messageRequired') }]}>
            <Input.TextArea placeholder={t('scheduler.form.messagePlaceholder')} rows={4} showCount maxLength={2000} />
          </Form.Item>
        </FormSection>
      </Form>
    </Modal>
  )
}

const FormSection = styled.div`
  margin-bottom: 8px;
`

const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--color-text);
`

export default SchedulerForm
