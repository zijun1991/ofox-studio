import { loggerService } from '@logger'
import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import WebviewList from './components/WebviewList'
import WebviewPreview from './components/WebviewPreview'
import WebviewToolbar from './components/WebviewToolbar'

const logger = loggerService.withContext('webview-manager')

export interface WebviewItem {
  id: string
  name: string
  partition: string
  url: string
  title: string
  createdAt: number
  lastActiveAt: number
  locked: boolean
  unlockMessage?: string
  hasWindow: boolean
  viewportSize: { width: number; height: number }
}

const WebviewManagerApp = () => {
  const [webviews, setWebviews] = useState<WebviewItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [screenshotData, setScreenshotData] = useState<Record<string, string>>({})
  const cleanupRef = useRef<(() => void) | null>(null)
  const screenshotCleanupRef = useRef<(() => void) | null>(null)

  const fetchList = useCallback(async () => {
    try {
      const list = await window.api.webviewManager.list()
      setWebviews(list)
    } catch (error) {
      logger.error('Failed to fetch webview list', error as Error)
    }
  }, [])

  useEffect(() => {
    fetchList()

    cleanupRef.current = window.api.webviewManager.onChange(() => {
      fetchList()
    })

    screenshotCleanupRef.current = window.api.webviewManager.onScreenshot(
      (data: { webviewId: string; base64: string }) => {
        setScreenshotData((prev) => ({ ...prev, [data.webviewId]: data.base64 }))
      }
    )

    return () => {
      cleanupRef.current?.()
      screenshotCleanupRef.current?.()
    }
  }, [fetchList])

  const selectedWebview = webviews.find((w) => w.id === selectedId) ?? null

  const handleCreate = async () => {
    try {
      await window.api.webviewManager.create({ name: 'New WebView', url: 'https://ofox.ai' })
      await fetchList()
    } catch (error) {
      logger.error('Failed to create webview', error as Error)
    }
  }

  const handleClose = async (id: string) => {
    try {
      await window.api.webviewManager.close(id)
      if (selectedId === id) {
        setSelectedId(null)
      }
      setScreenshotData((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      await fetchList()
    } catch (error) {
      logger.error('Failed to close webview', error as Error)
    }
  }

  const handleShowWindow = async (id: string) => {
    try {
      await window.api.webviewManager.show(id)
    } catch (error) {
      logger.error('Failed to show webview window', error as Error)
    }
  }

  return (
    <Container>
      <WebviewToolbar onCreateClick={handleCreate} webviewCount={webviews.length} />
      <ContentRow>
        <WebviewList
          webviews={webviews}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={handleClose}
          onShowWindow={handleShowWindow}
        />
        <WebviewPreview
          webview={selectedWebview}
          screenshotBase64={selectedId ? screenshotData[selectedId] : undefined}
        />
      </ContentRow>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-background);
`

const ContentRow = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`

export default WebviewManagerApp
