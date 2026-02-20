import { DeleteOutlined } from '@ant-design/icons'
import { useTools } from '@renderer/hooks/useTools'
import { SettingTitle } from '@renderer/pages/settings'
import type { CustomTool } from '@renderer/types'
import { Avatar, Button, List, Popconfirm } from 'antd'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const ToolsSettings: FC = () => {
  const { t } = useTranslation()
  const { customTools, removeTool } = useTools()

  const handleDelete = async (tool: CustomTool) => {
    try {
      await removeTool(tool.id)
    } catch (error) {
      console.error('Failed to delete tool:', error)
    }
  }

  return (
    <Container>
      <SettingTitle>{t('tools.settings.custom_tools_title')}</SettingTitle>
      <SettingDescription>{t('tools.settings.custom_tools_description')}</SettingDescription>

      {customTools.length === 0 ? (
        <EmptyState>{t('tools.settings.no_custom_tools')}</EmptyState>
      ) : (
        <ListWrapper>
          <List
            dataSource={customTools}
            renderItem={(tool: CustomTool) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="delete"
                    title={t('tools.settings.delete_confirm_title')}
                    description={t('tools.settings.delete_confirm_description', { name: tool.name })}
                    onConfirm={() => handleDelete(tool)}
                    okText={t('common.delete')}
                    cancelText={t('common.cancel')}
                    okButtonProps={{ danger: true }}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ]}>
                <List.Item.Meta
                  avatar={
                    <Avatar src={tool.logo} style={{ backgroundColor: tool.logo ? undefined : 'var(--color-primary)' }}>
                      {!tool.logo && tool.name.charAt(0).toUpperCase()}
                    </Avatar>
                  }
                  title={tool.name}
                  description={tool.url}
                />
              </List.Item>
            )}
          />
        </ListWrapper>
      )}
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-top: 10px;
  max-height: 60vh;
  overflow-y: auto;
`

const SettingDescription = styled.div`
  color: var(--color-text-2);
  font-size: 13px;
  margin-bottom: 16px;
`

const ListWrapper = styled.div`
  .ant-list-item {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .ant-list-item-meta-title {
    color: var(--color-text);
  }

  .ant-list-item-meta-description {
    color: var(--color-text-2);
    font-size: 12px;
  }
`

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-2);
`

export default ToolsSettings
