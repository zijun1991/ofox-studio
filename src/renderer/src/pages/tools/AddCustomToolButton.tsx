import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { useTools } from '@renderer/hooks/useTools'
import type { CustomTool } from '@renderer/types'
import { Button, Form, Input, Modal, Radio, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const logger = loggerService.withContext('AddCustomToolButton')

interface Props {
  size?: number
}

const AddCustomToolButton: FC<Props> = ({ size = 60 }) => {
  const { t } = useTranslation()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [logoType, setLogoType] = useState<'url' | 'file'>('url')
  const [form] = Form.useForm()
  const { customTools, addTool } = useTools()

  const handleLogoTypeChange = (e: any) => {
    setLogoType(e.target.value)
    form.setFieldValue('logo', '')
    setFileList([])
  }

  const handleAddCustomTool = async (values: any) => {
    try {
      // 检查 ID 是否重复
      if (customTools.some((tool: CustomTool) => tool.id === values.id)) {
        window.toast.error(t('tools.custom.duplicate_ids', { ids: values.id }))
        return
      }

      const newTool: CustomTool = {
        id: values.id,
        name: values.name,
        url: values.url,
        logo: form.getFieldValue('logo') || '',
        addTime: new Date().toISOString()
      }

      await addTool(newTool)
      window.toast.success(t('tools.custom.save_success'))
      setIsModalVisible(false)
      form.resetFields()
      setFileList([])
    } catch (error) {
      window.toast.error(t('tools.custom.save_error'))
      logger.error('Failed to save custom tool:', error as Error)
    }
  }

  const handleFileChange = async (info: any) => {
    const file = info.fileList[info.fileList.length - 1]?.originFileObj
    setFileList(info.fileList.slice(-1))

    if (file) {
      try {
        const reader = new FileReader()
        reader.onload = (event) => {
          const base64Data = event.target?.result
          if (typeof base64Data === 'string') {
            window.toast.success(t('tools.custom.logo_upload_success'))
            form.setFieldValue('logo', base64Data)
          }
        }
        reader.readAsDataURL(file)
      } catch (error) {
        logger.error('Failed to read file:', error as Error)
        window.toast.error(t('tools.custom.logo_upload_error'))
      }
    }
  }

  return (
    <>
      <Container onClick={() => setIsModalVisible(true)}>
        <AddButton size={size}>
          <PlusOutlined />
        </AddButton>
        <AppTitle>{t('tools.custom.title')}</AppTitle>
      </Container>
      <Modal
        title={t('tools.custom.edit_title')}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          setFileList([])
        }}
        maskClosable={false}
        footer={null}
        transitionName="animation-move-down"
        centered>
        <Form form={form} onFinish={handleAddCustomTool} layout="vertical">
          <Form.Item
            name="id"
            label={t('tools.custom.id')}
            rules={[{ required: true, message: t('tools.custom.id_error') }]}>
            <Input placeholder={t('tools.custom.id_placeholder')} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('tools.custom.name')}
            rules={[{ required: true, message: t('tools.custom.name_error') }]}>
            <Input placeholder={t('tools.custom.name_placeholder')} />
          </Form.Item>
          <Form.Item
            name="url"
            label={t('tools.custom.url')}
            rules={[{ required: true, message: t('tools.custom.url_error') }]}>
            <Input placeholder={t('tools.custom.url_placeholder')} />
          </Form.Item>
          <Form.Item label={t('tools.custom.logo')}>
            <Radio.Group value={logoType} onChange={handleLogoTypeChange}>
              <Radio value="url">{t('tools.custom.logo_url')}</Radio>
              <Radio value="file">{t('tools.custom.logo_file')}</Radio>
            </Radio.Group>
          </Form.Item>
          {logoType === 'url' ? (
            <Form.Item name="logo" label={t('tools.custom.logo_url_label')}>
              <Input placeholder={t('tools.custom.logo_url_placeholder')} />
            </Form.Item>
          ) : (
            <Form.Item label={t('tools.custom.logo_upload_label')}>
              <Upload
                accept="image/*"
                maxCount={1}
                fileList={fileList}
                onChange={handleFileChange}
                beforeUpload={() => false}>
                <Button icon={<UploadOutlined />}>{t('tools.custom.logo_upload_button')}</Button>
              </Upload>
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit">
              {t('tools.custom.save')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`

const AddButton = styled.div<{ size?: number }>`
  width: ${({ size }) => size || 60}px;
  height: ${({ size }) => size || 60}px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft);
  border: 1px dashed var(--color-border);
  color: var(--color-text-soft);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-background);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const AppTitle = styled.div`
  font-size: 12px;
  margin-top: 5px;
  color: var(--color-text-soft);
  text-align: center;
  user-select: none;
  white-space: nowrap;
`

export default AddCustomToolButton
