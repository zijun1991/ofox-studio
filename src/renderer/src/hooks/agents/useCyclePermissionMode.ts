import { permissionModeCards } from '@renderer/config/agent'
import type { AgentConfigurationState } from '@renderer/pages/settings/AgentSettings/shared'
import { useAppSelector } from '@renderer/store'
import type { AgentSessionEntity, PermissionMode, UpdateSessionForm } from '@renderer/types'
import type { UpdateAgentBaseOptions } from '@renderer/types/agent'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useAgent } from './useAgent'
import { useSession } from './useSession'
import { useUpdateSession } from './useUpdateSession'

const TURBO_AGENT_ID = 'agent_turbo_system'
const permissionModes: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'bypassPermissions']

export const useCyclePermissionMode = () => {
  const { t } = useTranslation()

  // 获取极速模式 agent
  const { agent: turboAgent } = useAgent(TURBO_AGENT_ID)
  const turboAgentId = turboAgent?.id || null

  // 从 store 获取当前 active session id
  const activeSessionIdMap = useAppSelector((state) => state.runtime.chat.activeSessionIdMap)
  const turboActiveSessionId = activeSessionIdMap[TURBO_AGENT_ID]

  // 获取极速模式 session
  const { session: turboSession } = useSession(turboAgentId, turboActiveSessionId || null)
  const { updateSession: updateTurboSession } = useUpdateSession(turboAgentId)

  // 获取专家模式当前 active agent 和 session
  const activeAgentId = useAppSelector((state) => state.runtime.chat.activeAgentId)
  const expertActiveSessionId = activeAgentId ? activeSessionIdMap[activeAgentId] : null
  const { session: expertSession } = useSession(activeAgentId, expertActiveSessionId || null)
  const { updateSession: updateExpertSession } = useUpdateSession(activeAgentId)

  const cyclePermissionMode = useCallback(
    async (isSpeedyPage: boolean) => {
      // 确定当前 agent 和 session
      let session: AgentSessionEntity | null = null
      let currentMode: PermissionMode = 'default'
      let updateSessionFn:
        | ((form: UpdateSessionForm, options?: UpdateAgentBaseOptions) => Promise<AgentSessionEntity | undefined>)
        | null = null

      if (isSpeedyPage && turboAgentId && turboSession) {
        // 极速模式
        session = turboSession
        currentMode = (turboSession.configuration?.permission_mode as PermissionMode) || 'bypassPermissions'
        updateSessionFn = updateTurboSession
      } else if (!isSpeedyPage && activeAgentId && expertSession) {
        // 专家模式
        session = expertSession
        currentMode = (expertSession.configuration?.permission_mode as PermissionMode) || 'default'
        updateSessionFn = updateExpertSession
      }

      if (!session || !updateSessionFn) {
        return
      }

      // 计算下一个权限模式
      const currentIndex = permissionModes.indexOf(currentMode)
      const nextIndex = (currentIndex + 1) % permissionModes.length
      const nextMode = permissionModes[nextIndex]

      // 更新权限模式
      const nextConfiguration: AgentConfigurationState = {
        max_turns: 100,
        ...session.configuration,
        permission_mode: nextMode
      }

      const result = await updateSessionFn(
        {
          id: session.id,
          configuration: nextConfiguration
        },
        { showSuccessToast: false }
      )

      // 显示 toast 提示：更新成功：<模式名>
      if (result) {
        const modeCard = permissionModeCards.find((card) => card.mode === nextMode)
        if (modeCard) {
          window.toast.success(
            `${t('common.update_success')}：${modeCard.icon} ${t(modeCard.titleKey, modeCard.titleFallback)}`
          )
        }
      }
    },
    [turboAgentId, turboSession, updateTurboSession, activeAgentId, expertSession, updateExpertSession, t]
  )

  return { cyclePermissionMode }
}
