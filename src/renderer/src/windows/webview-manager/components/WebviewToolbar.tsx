import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  onCreateClick: () => void
  webviewCount: number
}

const WebviewToolbar: FC<Props> = ({ onCreateClick, webviewCount }) => {
  const { t } = useTranslation()

  return (
    <ToolbarContainer>
      <TitleGroup>
        {t('webview.manager.title')}
        <ActiveCount>{t('webview.manager.active_count', { count: webviewCount })}</ActiveCount>
      </TitleGroup>
      <CreateButton type="button" onClick={onCreateClick}>
        + {t('webview.manager.create')}
      </CreateButton>
    </ToolbarContainer>
  )
}

const ToolbarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
  min-height: 40px;
`

const TitleGroup = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const ActiveCount = styled.span`
  font-size: 12px;
  font-weight: 400;
  margin-left: 8px;
  opacity: 0.6;
`

const CreateButton = styled.button`
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
`

export default WebviewToolbar
