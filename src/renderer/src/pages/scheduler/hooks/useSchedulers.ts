import { IpcChannel } from '@shared/IpcChannel'
import type {
  CreateSchedulerRequest,
  ListSchedulerLogsOptions,
  ListSchedulersOptions,
  SchedulerEntity,
  SchedulerLogEntity,
  UpdateSchedulerRequest
} from '@types'
import { useCallback, useState } from 'react'

export function useSchedulers() {
  const [schedulers, setSchedulers] = useState<SchedulerEntity[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedulers = useCallback(async (options?: ListSchedulersOptions) => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Scheduler_List, options)
      setSchedulers(result.schedulers)
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      return { schedulers: [], total: 0 }
    } finally {
      setLoading(false)
    }
  }, [])

  const createScheduler = useCallback(
    async (data: CreateSchedulerRequest): Promise<SchedulerEntity> => {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Scheduler_Create, data)
      await fetchSchedulers()
      return result
    },
    [fetchSchedulers]
  )

  const getScheduler = useCallback(async (id: string): Promise<SchedulerEntity | null> => {
    return await window.electron.ipcRenderer.invoke(IpcChannel.Scheduler_Get, id)
  }, [])

  const updateScheduler = useCallback(
    async (id: string, updates: Partial<UpdateSchedulerRequest>): Promise<SchedulerEntity | null> => {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Scheduler_Update, id, updates)
      await fetchSchedulers()
      return result
    },
    [fetchSchedulers]
  )

  const deleteScheduler = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Scheduler_Delete, id)
      await fetchSchedulers()
      return result
    },
    [fetchSchedulers]
  )

  const toggleScheduler = useCallback(
    async (id: string, enabled: boolean): Promise<SchedulerEntity | null> => {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Scheduler_Toggle, id, enabled)
      await fetchSchedulers()
      return result
    },
    [fetchSchedulers]
  )

  return {
    schedulers,
    loading,
    error,
    fetchSchedulers,
    createScheduler,
    getScheduler,
    updateScheduler,
    deleteScheduler,
    toggleScheduler
  }
}

export function useSchedulerLogs() {
  const [logs, setLogs] = useState<SchedulerLogEntity[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  const fetchLogs = async (options?: ListSchedulerLogsOptions) => {
    setLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.SchedulerLog_List, options)
      setLogs(result.logs)
      setTotal(result.total)
      return result
    } catch (err) {
      console.error('Failed to fetch scheduler logs:', err)
      return { logs: [], total: 0 }
    } finally {
      setLoading(false)
    }
  }

  const clearLogs = async (schedulerId?: string): Promise<number> => {
    const result = await window.electron.ipcRenderer.invoke(IpcChannel.SchedulerLog_Clear, schedulerId)
    await fetchLogs()
    return result
  }

  return {
    logs,
    loading,
    total,
    fetchLogs,
    clearLogs
  }
}
