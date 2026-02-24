/**
 * OFOX API Key 输入弹窗
 *
 * 临时方案：用于替代登录检查，直接输入 API Key
 * TODO: 后续会整体移除，替换为正式登录流程
 */

import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { TopView } from '@renderer/components/TopView'
import { Button, Input, Modal } from 'antd'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  resolve: (apiKey: string | null) => void
}

const PopupContainer: React.FC<Props> = ({ resolve }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)

  const onCancel = useCallback(() => {
    setOpen(false)
  }, [])

  const onClose = useCallback(() => {
    resolve(null)
  }, [resolve])

  const onSubmit = useCallback(async () => {
    if (!apiKey.trim()) {
      return
    }
    setLoading(true)
    resolve(apiKey.trim())
    setOpen(false)
  }, [apiKey, resolve])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && apiKey.trim()) {
        onSubmit()
      }
    },
    [apiKey, onSubmit]
  )

  OfoxApiKeyModal.hide = onCancel

  return (
    <ErrorBoundary>
      <Modal
        title={t('ofox.apiKey.title', '请输入 OFOX API Key')}
        open={open}
        onCancel={onCancel}
        afterClose={onClose}
        transitionName="animation-move-down"
        centered
        width={480}
        footer={null}
        closable={false}
        maskClosable={false}>
        <Container>
          <Description>
            {t(
              'ofox.apiKey.description',
              '请输入您的 OFOX API Key 以继续使用服务。此密钥将缓存在本地，下次启动时无需重新输入。'
            )}
          </Description>
          <InputWrapper>
            <Input.Password
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('ofox.apiKey.placeholder', '请输入 API Key')}
              size="large"
              autoFocus
            />
          </InputWrapper>
          <Footer>
            <Button onClick={onCancel} size="large">
              {t('common.cancel', '取消')}
            </Button>
            <Button type="primary" onClick={onSubmit} loading={loading} disabled={!apiKey.trim()} size="large">
              {t('common.confirm', '确认')}
            </Button>
          </Footer>
        </Container>
      </Modal>
    </ErrorBoundary>
  )
}

const TopViewKey = 'OfoxApiKeyModal'

export default class OfoxApiKeyModal {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      TopView.show(
        <PopupContainer
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0;
`

const Description = styled.p`
  margin: 0;
  font-size: 14px;
  color: var(--color-text-2);
  line-height: 1.6;
`

const InputWrapper = styled.div`
  width: 100%;
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
`
