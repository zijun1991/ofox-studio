import ModelAvatar from '@renderer/components/Avatar/ModelAvatar'
import { useProviders } from '@renderer/hooks/useProvider'
import type { EducationLevel, Model, ModelEmployee } from '@renderer/types/modelEmployee'
import { EducationLevel as EL } from '@renderer/types/modelEmployee'
import { getFancyProviderName } from '@renderer/utils/naming'
import { Form, Input, Modal, Select } from 'antd'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface EmployeeEditModalProps {
  open: boolean
  employee: ModelEmployee | null
  defaultEducationLevel: EducationLevel
  isNameExists: (name: string, excludeId?: string) => boolean
  onSave: (
    name: string,
    description: string,
    soul: string | undefined,
    model: Model,
    educationLevel: EducationLevel
  ) => boolean
  onClose: () => void
}

// Education level labels with icons and colors
const EDUCATION_LEVEL_OPTIONS: { value: EducationLevel; icon: string }[] = [
  { value: EL.HIGH_SCHOOL, icon: '🎓' },
  { value: EL.UNDERGRADUATE, icon: '📚' },
  { value: EL.MASTER, icon: '🏆' },
  { value: EL.PHD, icon: '👑' }
]

const EmployeeEditModal: FC<EmployeeEditModalProps> = ({
  open,
  employee,
  defaultEducationLevel,
  isNameExists,
  onSave,
  onClose
}) => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const { providers } = useProviders()
  const [loading, setLoading] = useState(false)

  // Get all models from all providers, only include anthropic protocol models
  const allModels = providers
    .flatMap((p) => p.models.map((m) => ({ ...m, providerName: p.name })))
    .filter((model) => {
      // Only include models using anthropic protocol
      if (model.endpoint_type === 'anthropic') return true
      if (model.supported_endpoint_types?.includes('anthropic')) return true
      return false
    })

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      if (employee) {
        form.setFieldsValue({
          name: employee.name,
          description: employee.description,
          soul: employee.soul,
          model: `${employee.model.provider}|${employee.model.id}`,
          educationLevel: employee.educationLevel
        })
      } else {
        form.setFieldsValue({
          name: '',
          description: '',
          soul: '',
          model: undefined,
          educationLevel: defaultEducationLevel
        })
      }
    }
  }, [open, employee, defaultEducationLevel, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const [provider, modelId] = values.model.split('|')
      const selectedModel = allModels.find((m) => m.provider === provider && m.id === modelId)

      if (!selectedModel) {
        return
      }

      // Check name uniqueness
      if (isNameExists(values.name, employee?.id)) {
        form.setFields([
          {
            name: 'name',
            errors: [t('settings.model_employee.employee.name_duplicate')]
          }
        ])
        return
      }

      setLoading(true)
      const success = onSave(values.name, values.description, values.soul, selectedModel, values.educationLevel)
      setLoading(false)

      if (success) {
        form.resetFields()
      }
    } catch (error) {
      // Form validation failed
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title={t(`settings.model_employee.employee.${employee ? 'edit' : 'add'}`)}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      centered
      destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={t('settings.model_employee.employee.name')}
          rules={[{ required: true, message: t('common.required_field') }]}>
          <Input placeholder={t('settings.model_employee.employee.name_placeholder')} />
        </Form.Item>

        <Form.Item
          name="description"
          label={t('settings.model_employee.employee.description')}
          rules={[{ required: true, message: t('common.required_field') }]}>
          <Input.TextArea rows={3} placeholder={t('settings.model_employee.employee.description_placeholder')} />
        </Form.Item>

        {/* Soul field - hidden for now, will be enabled later */}
        {/* <Form.Item name="soul" label={t('settings.model_employee.employee.soul')}>
          <Input.TextArea rows={3} placeholder={t('settings.model_employee.employee.soul_placeholder')} />
        </Form.Item> */}

        <Form.Item
          name="model"
          label={t('settings.model_employee.employee.model')}
          rules={[{ required: true, message: t('common.required_field') }]}>
          <Select
            showSearch
            placeholder={t('settings.model_employee.employee.model')}
            optionFilterProp="label"
            filterOption={(input, option) =>
              (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
            }>
            {allModels.map((model) => (
              <Select.Option
                key={`${model.provider}|${model.id}`}
                value={`${model.provider}|${model.id}`}
                label={`${model.name} | ${getFancyProviderName({ name: model.provider } as any)}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ModelAvatar model={model} size={18} />
                  <span>{model.name}</span>
                  <span style={{ opacity: 0.5 }}>| {getFancyProviderName({ name: model.provider } as any)}</span>
                </div>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="educationLevel"
          label={t('settings.model_employee.employee.education_level')}
          rules={[{ required: true, message: t('common.required_field') }]}>
          <Select>
            {EDUCATION_LEVEL_OPTIONS.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                <span>
                  {option.icon} {t(`settings.model_employee.education_level.${option.value}`)}
                </span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default EmployeeEditModal
