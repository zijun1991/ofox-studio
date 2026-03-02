import { loggerService } from '@logger'
import NotificationModal from '@renderer/components/NotificationModal'
import { isMac } from '@renderer/config/constant'
import { isLocalAi } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import db from '@renderer/databases'
import i18n, { setDayjsLocale } from '@renderer/i18n'
import KnowledgeQueue from '@renderer/queue/KnowledgeQueue'
import MemoryService from '@renderer/services/MemoryService'
import OfoxProviderService from '@renderer/services/OfoxProviderService'
import store, { handleSaveData, useAppDispatch, useAppSelector } from '@renderer/store'
import { setChannelStatus, updateChannelMetadata } from '@renderer/store/channels'
import { updateOfoxApiKey } from '@renderer/store/llm'
import { initializeMCPServers } from '@renderer/store/mcp'
import { selectMemoryConfig } from '@renderer/store/memory'
import { importConfig } from '@renderer/store/modelEmployee'
import { setModelsReady } from '@renderer/store/ofoxStore'
import { setAvatar, setFilesPath, setResourcesPath, setUpdateState } from '@renderer/store/runtime'
import { loadTopicMessagesThunk } from '@renderer/store/thunk/messageThunk'
import {
  type ToolPermissionRequestPayload,
  type ToolPermissionResultPayload,
  toolPermissionsActions
} from '@renderer/store/toolPermissions'
import type { ChannelMessageEvent, ChannelStatusEvent } from '@renderer/types/channel'
import type { ModelEmployee, ModelEmployeeExportData } from '@renderer/types/modelEmployee'
import { delay, runAsyncFunction, uuid } from '@renderer/utils'
import { checkDataLimit } from '@renderer/utils'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { defaultLanguage } from '@shared/config/constant'
import { IpcChannel } from '@shared/IpcChannel'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useDefaultModel } from './useAssistant'
import useFullScreenNotice from './useFullScreenNotice'
import { useRuntime } from './useRuntime'
import { useNavbarPosition, useSettings } from './useSettings'
import useUpdateHandler from './useUpdateHandler'

const logger = loggerService.withContext('useAppInit')

export function useAppInit() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const {
    proxyUrl,
    proxyBypassRules,
    language,
    windowStyle,
    autoCheckUpdate,
    proxyMode,
    customCss,
    enableDataCollection
  } = useSettings()
  const { isLeftNavbar } = useNavbarPosition()
  const { minappShow } = useRuntime()
  const { setDefaultModel, setQuickModel, setTranslateModel } = useDefaultModel()
  const avatar = useLiveQuery(() => db.settings.get('image://avatar'))
  const { theme } = useTheme()
  const memoryConfig = useAppSelector(selectMemoryConfig)
  const isModelsReady = useAppSelector((state) => state.ofox.isModelsReady)

  // 当核心初始化完成后移除 loading 覆盖层
  useEffect(() => {
    if (isModelsReady) {
      document.getElementById('spinner')?.remove()
    }
  }, [isModelsReady])

  useEffect(() => {
    // eslint-disable-next-line no-restricted-syntax
    console.timeEnd('init')

    // Initialize MemoryService after app is ready
    MemoryService.getInstance()

    // Initialize Ofox providers immediately (synchronous, no network request)
    // This ensures providers exist before any API calls are made
    OfoxProviderService.getInstance().initializeProviders(dispatch)

    // Initialize built-in MCP servers (scheduler, etc.)
    const existingServers = store.getState().mcp.servers
    initializeMCPServers(existingServers, dispatch)

    // 同步 OFOX 模型列表（不再显示弹窗，apiKey 由用户在设置页配置）
    const syncOfoxModels = async () => {
      // 一次性数据迁移：将 localStorage 中的旧 apiKey 迁移到 provider
      const cachedKey = localStorage.getItem('ofox_api_key')
      const firstOfoxProvider = store.getState().llm.providers.find((p) => p.id === 'ofox-openai')
      if (cachedKey && !firstOfoxProvider?.apiKey) {
        dispatch(updateOfoxApiKey(cachedKey))
        localStorage.removeItem('ofox_api_key')
        logger.info('Migrated OFOX API Key from localStorage to provider config')
      }

      // 检查是否有 apiKey，有则同步模型
      const currentKey = store.getState().llm.providers.find((p) => p.id === 'ofox-openai')?.apiKey
      if (currentKey) {
        const SYNC_TIMEOUT = 15_000
        try {
          await Promise.race([
            OfoxProviderService.getInstance().syncProviders(dispatch),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Model sync timed out after 15s')), SYNC_TIMEOUT)
            )
          ])
        } catch (error) {
          logger.error('Failed to sync Ofox providers:', error as Error)
        }
      } else {
        logger.info('No OFOX API Key configured, skipping model sync')
      }
    }

    // Load default model employee config if none exists
    const loadDefaultModelEmployees = async () => {
      const { employees } = store.getState().modelEmployee.config
      if (employees.length > 0) {
        return
      }

      try {
        const { resourcesPath } = await window.api.getAppInfo()
        const raw = await window.api.fs.read(`${resourcesPath}/data/model-employee-default-ofox.json`, 'utf-8')
        const data = JSON.parse(raw) as ModelEmployeeExportData
        const now = Date.now()
        const newEmployees: ModelEmployee[] = data.employees.map((e) => ({
          ...e,
          id: uuid(),
          createdAt: now,
          updatedAt: now
        }))
        dispatch(
          importConfig({
            employees: newEmployees,
            educationLevelOrder: data.educationLevelOrder
          })
        )
        logger.info(`Loaded ${newEmployees.length} default model employees`)
      } catch (error) {
        logger.error('Failed to load default model employees:', error as Error)
      }
    }

    // Check for remote notification on app startup
    const checkNotification = async () => {
      const NOTIFICATION_URL = 'https://claw.ofox.app/notification'
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(NOTIFICATION_URL, {
          method: 'GET',
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (response.status === 200) {
          logger.info('Notification available, showing modal')
          await NotificationModal.show(NOTIFICATION_URL)
        }
      } catch (error) {
        // Silently fail - notification is optional
        logger.debug('Notification check failed:', error as Error)
      }
    }

    // 核心初始化流程：串行阻塞执行，确保模型列表和默认员工配置在后续逻辑前就绪
    const initCore = async () => {
      try {
        // 阶段1：同步 OFOX 模型列表（阻塞）
        await syncOfoxModels()

        // 阶段2：模型就绪后加载默认员工配置（阻塞）
        await loadDefaultModelEmployees()
      } catch (error) {
        logger.error('Core initialization failed:', error as Error)
      } finally {
        // 无论成功或失败都标记就绪，防止应用卡死
        dispatch(setModelsReady(true))
      }
    }

    initCore()

    // 通知检查独立执行，不阻塞核心初始化
    checkNotification()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync channel config to Main Process on startup and listen for status updates
  useEffect(() => {
    const channels = store.getState().channels.channels
    window.api.channels.syncConfig(channels)

    const removeStatusListener = window.api.channels.onStatusChanged(
      (_event: Electron.IpcRendererEvent, event: ChannelStatusEvent) => {
        dispatch(setChannelStatus({ id: event.channelId, status: event.status, error: event.error }))
      }
    )

    // Listen for channel message events to trigger message refresh
    // Note: stream-chunk events are now sent on a separate IPC channel (Channel_StreamChunk),
    // so only real message events (inbound/outbound) arrive here.
    const removeMessageListener = window.api.channels.onMessageEvent(
      (_event: Electron.IpcRendererEvent, event: ChannelMessageEvent) => {
        // Guard: ignore any event without a direction (e.g. legacy stream-chunk leaks)
        if (!event.direction) return

        logger.debug('Received channel message event', {
          channelId: event.channelId,
          sessionId: event.sessionId,
          direction: event.direction
        })

        // Persist inbound metadata to Redux so it survives app restarts
        if (event.direction === 'inbound' && event.metadata) {
          dispatch(
            updateChannelMetadata({
              channelId: event.channelId,
              metadata: event.metadata,
              timestamp: event.timestamp
            })
          )
        }

        // Emit a custom event that the message list can listen to (for scrollToBottom etc.)
        window.dispatchEvent(
          new CustomEvent('channel-message-received', {
            detail: {
              sessionId: event.sessionId,
              channelId: event.channelId,
              direction: event.direction,
              content: event.content,
              timestamp: event.timestamp
            }
          })
        )

        // Directly dispatch message reload into Redux store so the UI refreshes
        // regardless of whether the session's message component is currently mounted
        if (event.sessionId) {
          const topicId = buildAgentSessionTopicId(event.sessionId)
          dispatch(loadTopicMessagesThunk(topicId, true))
        }
      }
    )

    return () => {
      removeStatusListener()
      removeMessageListener()
    }
  }, [dispatch])

  useEffect(() => {
    window.api.getDataPathFromArgs().then((dataPath) => {
      if (dataPath) {
        window.navigate('/settings/data', { replace: true })
      }
    })
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(IpcChannel.App_SaveData, async () => {
      await handleSaveData()
    })
  }, [])

  useUpdateHandler()
  useFullScreenNotice()

  useEffect(() => {
    avatar?.value && dispatch(setAvatar(avatar.value))
  }, [avatar, dispatch])

  useEffect(() => {
    const checkForUpdates = async () => {
      const { isPackaged } = await window.api.getAppInfo()

      if (!isPackaged || !autoCheckUpdate) {
        return
      }

      const { updateInfo } = await window.api.checkForUpdate()
      dispatch(setUpdateState({ info: updateInfo }))
    }

    // Initial check with delay
    runAsyncFunction(async () => {
      const { isPackaged } = await window.api.getAppInfo()
      if (isPackaged && autoCheckUpdate) {
        await delay(2)
        await checkForUpdates()
      }
    })

    // Set up 4-hour interval check
    const FOUR_HOURS = 4 * 60 * 60 * 1000
    const intervalId = setInterval(checkForUpdates, FOUR_HOURS)

    return () => clearInterval(intervalId)
  }, [dispatch, autoCheckUpdate])

  useEffect(() => {
    if (proxyMode === 'system') {
      window.api.setProxy('system', undefined)
    } else if (proxyMode === 'custom') {
      proxyUrl && window.api.setProxy(proxyUrl, proxyBypassRules)
    } else {
      // set proxy to none for direct mode
      window.api.setProxy('', undefined)
    }
  }, [proxyUrl, proxyMode, proxyBypassRules])

  useEffect(() => {
    const currentLanguage = language || navigator.language || defaultLanguage
    i18n.changeLanguage(currentLanguage)
    setDayjsLocale(currentLanguage)
  }, [language])

  useEffect(() => {
    const isMacTransparentWindow = windowStyle === 'transparent' && isMac

    if (minappShow && isLeftNavbar) {
      window.root.style.background = isMacTransparentWindow ? 'var(--color-background)' : 'var(--navbar-background)'
      return
    }

    window.root.style.background = isMacTransparentWindow ? 'var(--navbar-background-mac)' : 'var(--navbar-background)'
  }, [windowStyle, minappShow, theme, isLeftNavbar])

  useEffect(() => {
    if (isLocalAi) {
      const model = JSON.parse(import.meta.env.VITE_RENDERER_INTEGRATED_MODEL)
      setDefaultModel(model)
      setQuickModel(model)
      setTranslateModel(model)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // set files path
    window.api.getAppInfo().then((info) => {
      dispatch(setFilesPath(info.filesPath))
      dispatch(setResourcesPath(info.resourcesPath))
    })
  }, [dispatch])

  useEffect(() => {
    KnowledgeQueue.checkAllBases()
  }, [])

  useEffect(() => {
    let customCssElement = document.getElementById('user-defined-custom-css') as HTMLStyleElement
    if (customCssElement) {
      customCssElement.remove()
    }

    if (customCss) {
      customCssElement = document.createElement('style')
      customCssElement.id = 'user-defined-custom-css'
      customCssElement.textContent = customCss
      document.head.appendChild(customCssElement)
    }
  }, [customCss])

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return

    const requestListener = async (_event: Electron.IpcRendererEvent, payload: ToolPermissionRequestPayload) => {
      logger.debug('Renderer received tool permission request', {
        requestId: payload.requestId,
        toolName: payload.toolName,
        expiresAt: payload.expiresAt,
        suggestionCount: payload.suggestions.length,
        autoApprove: payload.autoApprove
      })

      if (payload.autoApprove) {
        logger.debug('Auto-approving tool permission request', {
          requestId: payload.requestId,
          toolName: payload.toolName
        })

        try {
          const response = await window.api.agentTools.respondToPermission({
            requestId: payload.requestId,
            behavior: 'allow',
            updatedInput: payload.input,
            updatedPermissions: payload.suggestions
          })

          if (!response?.success) {
            throw new Error('Auto-approval response rejected by main process')
          }

          logger.debug('Auto-approval acknowledged by main process', {
            requestId: payload.requestId,
            toolName: payload.toolName
          })
        } catch (error) {
          logger.error('Failed to send auto-approval response', error as Error)
          // Fall through to add to store for manual approval
          dispatch(toolPermissionsActions.requestReceived(payload))
        }
        return
      }

      dispatch(toolPermissionsActions.requestReceived(payload))
    }

    const resultListener = (_event: Electron.IpcRendererEvent, payload: ToolPermissionResultPayload) => {
      logger.debug('Renderer received tool permission result', {
        requestId: payload.requestId,
        behavior: payload.behavior,
        reason: payload.reason
      })
      dispatch(toolPermissionsActions.requestResolved(payload))

      if (payload.behavior === 'deny') {
        const message =
          payload.reason === 'timeout'
            ? (payload.message ?? t('agent.toolPermission.toast.timeout'))
            : (payload.message ?? t('agent.toolPermission.toast.denied'))

        if (payload.reason === 'no-window') {
          logger.debug('Displaying deny toast for tool permission', {
            requestId: payload.requestId,
            behavior: payload.behavior,
            reason: payload.reason
          })
          window.toast?.error?.(message)
        } else if (payload.reason === 'timeout') {
          logger.debug('Displaying timeout toast for tool permission', {
            requestId: payload.requestId
          })
          window.toast?.warning?.(message)
        } else {
          logger.debug('Displaying info toast for tool permission deny', {
            requestId: payload.requestId,
            reason: payload.reason
          })
          window.toast?.info?.(message)
        }
      }
    }

    const removeListeners = [
      window.electron.ipcRenderer.on(IpcChannel.AgentToolPermission_Request, requestListener),
      window.electron.ipcRenderer.on(IpcChannel.AgentToolPermission_Result, resultListener)
    ]

    return () => removeListeners.forEach((removeListener) => removeListener())
  }, [dispatch, t])

  useEffect(() => {
    // TODO: init data collection
  }, [enableDataCollection])

  // Update memory service configuration when it changes
  useEffect(() => {
    const memoryService = MemoryService.getInstance()
    memoryService.updateConfig().catch((error) => logger.error('Failed to update memory config:', error))
  }, [memoryConfig])

  useEffect(() => {
    checkDataLimit()
  }, [])
}
