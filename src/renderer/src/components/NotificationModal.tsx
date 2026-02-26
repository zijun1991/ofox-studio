/**
 * 通知推送模态框
 *
 * 用于在应用启动时显示来自远程服务器的通知内容
 */

import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { TopView } from '@renderer/components/TopView'
import { Modal } from 'antd'
import { useCallback, useState } from 'react'
import styled from 'styled-components'

interface Props {
  url: string
  resolve: () => void
}

const PopupContainer: React.FC<Props> = ({ url, resolve }) => {
  const [open, setOpen] = useState(true)

  const onCancel = useCallback(() => {
    setOpen(false)
  }, [])

  const onClose = useCallback(() => {
    resolve()
  }, [resolve])

  NotificationModal.hide = onCancel

  return (
    <ErrorBoundary>
      <Modal
        open={open}
        onCancel={onCancel}
        afterClose={onClose}
        transitionName="animation-move-down"
        centered
        width={500}
        footer={null}
        closable={true}
        maskClosable={true}
        styles={{
          body: { padding: 0, height: 400, overflow: 'hidden' }
        }}>
        <IframeContainer>
          <iframe
            src={url}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            loading="lazy"
            title="Notification"
          />
        </IframeContainer>
      </Modal>
    </ErrorBoundary>
  )
}

const TopViewKey = 'NotificationModal'

export default class NotificationModal {
  static hide() {
    TopView.hide(TopViewKey)
  }

  static show(url: string): Promise<void> {
    return new Promise<void>((resolve) => {
      TopView.show(
        <PopupContainer
          url={url}
          resolve={() => {
            resolve()
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}

const IframeContainer = styled.div`
  width: 100%;
  height: 400px;
  overflow: hidden;

  iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
`
