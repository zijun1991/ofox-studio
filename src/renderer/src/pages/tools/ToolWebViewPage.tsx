import { loggerService } from '@logger'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTools } from '@renderer/hooks/useTools'
import type { WebviewTag } from 'electron'
import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BeatLoader from 'react-spinners/BeatLoader'
import styled from 'styled-components'

const logger = loggerService.withContext('ToolWebViewPage')

const ToolWebViewPage: FC = () => {
  const { toolId } = useParams<{ toolId: string }>()
  const navigate = useNavigate()
  const { customTools } = useTools()
  const { enableSpellCheck } = useSettings()

  const webviewRef = useRef<WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 查找对应的自定义工具
  const tool = customTools.find((t) => t.id === toolId)

  useEffect(() => {
    // 如果工具不存在，重定向到工具列表页
    if (!tool) {
      navigate('/tools')
      return
    }
  }, [tool, navigate])

  useEffect(() => {
    if (!webviewRef.current || !tool) return

    const webview = webviewRef.current

    const handleLoadStart = () => {
      setIsLoading(true)
      logger.debug(`WebView started loading: ${tool.id}`)
    }

    const handleLoadEnd = () => {
      setIsLoading(false)
      logger.debug(`WebView finished loading: ${tool.id}`)
    }

    const handleDomReady = () => {
      const webviewId = webview.getWebContentsId?.()
      if (webviewId) {
        window.api?.webview?.setSpellCheckEnabled?.(webviewId, enableSpellCheck)
      }
    }

    webview.addEventListener('did-start-loading', handleLoadStart)
    webview.addEventListener('did-finish-load', handleLoadEnd)
    webview.addEventListener('dom-ready', handleDomReady)

    // 设置 URL
    webview.src = tool.url

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart)
      webview.removeEventListener('did-finish-load', handleLoadEnd)
      webview.removeEventListener('dom-ready', handleDomReady)
    }
  }, [tool, enableSpellCheck])

  // 如果工具不存在，返回 null（会重定向）
  if (!tool) {
    return null
  }

  return (
    <Container>
      <WebviewContainer>
        {isLoading && (
          <LoadingOverlay>
            <BeatLoader color="var(--color-text-2)" size={10} />
          </LoadingOverlay>
        )}
        <webview
          ref={(el) => {
            if (el) webviewRef.current = el as unknown as WebviewTag
          }}
          data-tool-id={tool.id}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--color-background)',
            display: 'inline-flex'
          }}
          allowpopups={'true' as any}
          partition="persist:webview"
        />
      </WebviewContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`

const WebviewContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  z-index: 10;
`

export default ToolWebViewPage
