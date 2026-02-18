import { isProd } from '@renderer/config/constant'
import type { ComponentType } from 'react'
import type { FallbackProps } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'

const BlockErrorFallback: ComponentType<FallbackProps> = ({ error }) => {
  const { t } = useTranslation()

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    return 'Unknown error'
  }

  const errorMessage = getErrorMessage(error)

  return (
    <div className="rounded-lg border border-(--color-error,#ff4d4f) border-dashed bg-(--color-error-bg,rgba(255,77,79,0.04)) px-3 py-2 text-xs">
      <div className="text-(--color-error,#ff4d4f)">
        {t('error.render.block', { defaultValue: 'This content block failed to render' })}
      </div>
      {!isProd && <div className="mt-1 break-all font-mono text-(--color-text-3)">{errorMessage}</div>}
    </div>
  )
}

export default BlockErrorFallback
