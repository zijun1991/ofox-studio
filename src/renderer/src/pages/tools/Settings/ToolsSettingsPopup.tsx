import { TopView } from '@renderer/components/TopView'
import { Modal } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ToolsSettings from './ToolsSettings'

interface Props {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ resolve }) => {
  const [open, setOpen] = useState(true)
  const { t } = useTranslation()

  const onOk = () => {
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  ToolsSettingsPopup.hide = onCancel

  return (
    <Modal
      open={open}
      onOk={onOk}
      width="80vw"
      title={t('tools.settings.display_title')}
      onCancel={onCancel}
      afterClose={onClose}
      footer={null}
      transitionName="animation-move-down"
      centered>
      <ToolsSettings />
    </Modal>
  )
}

const TopViewKey = 'ToolsSettingsPopup'

export default class ToolsSettingsPopup {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show() {
    return new Promise<any>((resolve) => {
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
