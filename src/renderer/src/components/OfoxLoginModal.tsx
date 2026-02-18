/**
 * Ofox 登录弹窗组件
 *
 * 显示全屏遮罩和内嵌 webview 加载 ofox 登录页面
 * 监听 webview 导航事件检测登录完成（跳转到 dashboard）
 */

import { loggerService } from '@logger'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setChecking, setShowLoginModal, setUser } from '@renderer/store/ofoxStore'
import { Modal, Spin } from 'antd'
import type { WebviewTag } from 'electron'
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('OfoxLoginModal')

// Styled Components (定义在组件之前以避免 TypeScript 警告)
const StyledModal = styled(Modal)`
  .ant-modal-content {
    height: 100vh !important;
    max-height: 100vh !important;
    border-radius: 0 !important;
  }

  .ant-modal-body {
    height: calc(100vh - 55px) !important;
    overflow: hidden !important;
    padding: 0 !important;
  }

  .ant-modal-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .ant-modal-title {
    font-size: 16px;
    font-weight: 500;
  }
`

const LoadingOverlay = styled.div<{ $isLoading: boolean }>`
  position: absolute;
  top: 55px;
  left: 0;
  right: 0;
  bottom: 0;
  display: ${(props) => (props.$isLoading ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
  z-index: 10;
`

const FullScreenLoading = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
  z-index: 9999;
`

interface OfoxLoginModalProps {
  onLoginSuccess?: () => void
  onLoginCancel?: () => void
}

const OfoxLoginModal: FC<OfoxLoginModalProps> = ({ onLoginSuccess, onLoginCancel }) => {
  const dispatch = useAppDispatch()
  const { showLoginModal, isChecking } = useAppSelector((state) => state.ofox)
  const [isLoading, setIsLoading] = useState(true)
  const [loginUrl, setLoginUrl] = useState<string>('')
  const webviewRef = useRef<WebviewTag | null>(null)

  // 获取登录 URL
  useEffect(() => {
    const initUrls = async () => {
      try {
        const url = await window.api.ofox.getLoginUrl()
        setLoginUrl(url)
        logger.info('Login URL initialized', { loginUrl: url })
      } catch (error) {
        logger.error('Failed to get login URL:', error as Error)
      }
    }
    if (showLoginModal) {
      initUrls()
    }
  }, [showLoginModal])

  // 检查登录状态
  const checkLoginStatus = useCallback(async () => {
    try {
      dispatch(setChecking(true))
      const response = await window.api.ofox.getSession()
      logger.debug('Session check response:', response)

      if (response.success && response.data?.user) {
        dispatch(
          setUser({
            id: response.data.user.id,
            email: response.data.user.email,
            name: response.data.user.name,
            image: response.data.user.image,
            emailVerified: response.data.user.emailVerified
          })
        )
        dispatch(setShowLoginModal(false))
        onLoginSuccess?.()
        return true
      }
      return false
    } catch (error) {
      logger.error('Failed to check login status:', error as Error)
      return false
    } finally {
      dispatch(setChecking(false))
    }
  }, [dispatch, onLoginSuccess])

  // 设置 webview 事件监听
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview || !loginUrl) return

    let loginCheckInProgress = false

    const handleLoad = () => {
      setIsLoading(false)
      logger.info('Login webview loaded')
    }

    const handleNavigate = async (e: any) => {
      const url = e.url || ''
      logger.debug('Webview navigated to:', url)

      // 检测是否导航到 dashboard（登录成功）
      if (url.includes('/dashboard') && !loginCheckInProgress) {
        loginCheckInProgress = true
        logger.info('Detected navigation to dashboard, checking login status')
        // 稍微延迟一下确保 cookie 已设置
        setTimeout(async () => {
          const success = await checkLoginStatus()
          if (success) {
            loginCheckInProgress = false
          }
        }, 500)
      }
    }

    const handleError = (e: any) => {
      logger.error('Webview error:', e)
      setIsLoading(false)
    }

    webview.addEventListener('did-finish-load', handleLoad)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('did-fail-load', handleError)

    // 设置 src
    webview.src = loginUrl

    return () => {
      webview.removeEventListener('did-finish-load', handleLoad)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('did-fail-load', handleError)
    }
  }, [loginUrl, checkLoginStatus])

  // 处理弹窗关闭
  const handleCancel = useCallback(() => {
    dispatch(setShowLoginModal(false))
    onLoginCancel?.()
  }, [dispatch, onLoginCancel])

  // 如果正在检查登录状态，显示全屏 loading
  if (isChecking) {
    return (
      <FullScreenLoading>
        <Spin size="large" tip="正在检查登录状态..." />
      </FullScreenLoading>
    )
  }

  if (!showLoginModal) {
    return null
  }

  return (
    <StyledModal
      open={showLoginModal}
      onCancel={handleCancel}
      footer={null}
      closable={false}
      width="100%"
      style={{ top: 0, maxWidth: '100vw', paddingBottom: 0 }}
      styles={{
        body: { height: 'calc(100vh - 55px)', padding: 0 },
        content: { height: '100vh' }
      }}
      centered={false}
      destroyOnHidden
      maskClosable={false}>
      <LoadingOverlay $isLoading={isLoading}>
        <Spin size="large" tip="Loading login page..." />
      </LoadingOverlay>
      {loginUrl && (
        <webview
          ref={webviewRef}
          style={{ width: '100%', height: '100%', border: 'none', display: 'inline-flex' }}
          allowpopups={true}
          partition="persist:ofox"
        />
      )}
    </StyledModal>
  )
}

export default OfoxLoginModal
