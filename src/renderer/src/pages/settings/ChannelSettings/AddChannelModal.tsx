import { useAppDispatch } from '@renderer/store'
import { addChannel } from '@renderer/store/channels'
import type { ChannelType } from '@renderer/types/channel'
import { Form, Input, Modal, Select } from 'antd'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  open: boolean
  onClose: () => void
}

const AddChannelModal: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const now = new Date().toISOString()
      const id = uuidv4()

      const channel = {
        id,
        name: values.name,
        type: values.type as ChannelType,
        status: 'inactive' as const,
        enabled: false,
        agentId: '',
        sessionId: '',
        createdAt: now,
        updatedAt: now
      }

      dispatch(addChannel(channel))

      // Sync to main process
      const allChannels = window.store.getState().channels.channels
      window.api.channels.syncConfig(allChannels)

      form.resetFields()
      onClose()
      navigate(`/channels/${id}`)
    } catch {
      // Form validation error
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title={t('channels.add_title', 'Add Channel')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={t('common.save', 'Save')}
      cancelText={t('common.cancel', 'Cancel')}
      destroyOnClose>
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label={t('channels.name', 'Name')}
          rules={[{ required: true, message: t('channels.name_required', 'Please enter a channel name') }]}>
          <Input placeholder={t('channels.name_placeholder', 'e.g. My Webhook')} />
        </Form.Item>
        <Form.Item
          name="type"
          label={t('channels.type', 'Type')}
          rules={[{ required: true, message: t('channels.type_required', 'Please select a channel type') }]}>
          <Select placeholder={t('channels.type_placeholder', 'Select channel type')}>
            <Select.Option value="webhook">Webhook</Select.Option>
            <Select.Option value="email">Email</Select.Option>
            <Select.Option value="telegram">Telegram</Select.Option>
            <Select.Option value="coworker">Coworker</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default AddChannelModal
