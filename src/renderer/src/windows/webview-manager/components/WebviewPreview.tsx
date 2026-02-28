import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import type { WebviewItem } from '../WebviewManagerApp'

interface Props {
  webview: WebviewItem | null
  screenshotBase64?: string
}

const WebviewPreview: FC<Props> = ({ webview, screenshotBase64 }) => {
  const { t } = useTranslation()

  if (!webview) {
    return <EmptyPreview>{t('webview.manager.select_to_preview')}</EmptyPreview>
  }

  return (
    <PreviewContainer>
      {/* Info bar */}
      <InfoBar>
        <InfoTitle>{webview.title || webview.name}</InfoTitle>
        <InfoUrl>{webview.url}</InfoUrl>
        <InfoMode>{webview.locked ? t('webview.manager.agent_controlled') : t('webview.manager.manual_mode')}</InfoMode>
      </InfoBar>

      {/* Unlock message */}
      {!webview.locked && webview.unlockMessage && <UnlockBanner>{webview.unlockMessage}</UnlockBanner>}

      {/* Preview area */}
      <PreviewArea>
        {webview.locked ? (
          <ScreenshotContainer>
            {screenshotBase64 ? (
              <ScreenshotImage src={`data:image/png;base64,${screenshotBase64}`} alt="WebView Screenshot" />
            ) : (
              <WaitingMessage>{t('webview.manager.waiting_screenshot')}</WaitingMessage>
            )}
            <AgentOverlay>{t('webview.manager.agent_operating')}</AgentOverlay>
          </ScreenshotContainer>
        ) : (
          <webview
            partition={webview.partition}
            src={webview.url || 'about:blank'}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </PreviewArea>
    </PreviewContainer>
  )
}

const EmptyPreview = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
`

const PreviewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const InfoBar = styled.div`
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-background-soft);
`

const InfoTitle = styled.span`
  font-weight: 500;
  color: var(--color-text);
`

const InfoUrl = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const InfoMode = styled.span`
  flex-shrink: 0;
`

const UnlockBanner = styled.div`
  padding: 8px 16px;
  background: rgba(34, 197, 94, 0.1);
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
  color: #22c55e;
  font-size: 13px;
`

const PreviewArea = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`

const ScreenshotContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`

const ScreenshotImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`

const WaitingMessage = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
`

const AgentOverlay = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #f59e0b;
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(4px);
`

export default WebviewPreview
