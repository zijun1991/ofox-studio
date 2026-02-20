import type { Model } from '@renderer/types'
import type { FC } from 'react'

interface Props {
  model: Model
  showLabel?: boolean
}

/**
 * FreeTrialModelTag - Component for displaying free trial model information.
 * Currently not in use as the associated provider has been removed.
 */
export const FreeTrialModelTag: FC<Props> = () => {
  return null
}
