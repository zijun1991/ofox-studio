import { BUILTIN_TOOLS } from '@renderer/config/builtinTools'
import type { RootState } from '@renderer/store'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { addCustomTool, removeCustomTool, setCustomTools, updateCustomTool } from '@renderer/store/tools'
import type { CustomTool } from '@renderer/types'
import { useCallback, useEffect } from 'react'

// 文件存储路径
const CUSTOM_TOOLS_FILE = 'custom-tools.json'

/**
 * 加载自定义工具列表
 */
const loadCustomTools = async (): Promise<CustomTool[]> => {
  try {
    const content = await window.api.file.read(CUSTOM_TOOLS_FILE)
    if (content) {
      return JSON.parse(content)
    }
  } catch (error) {
    // 文件不存在或解析失败，返回空数组
  }
  return []
}

/**
 * 保存自定义工具列表
 */
const saveCustomTools = async (tools: CustomTool[]): Promise<void> => {
  try {
    await window.api.file.writeWithId(CUSTOM_TOOLS_FILE, JSON.stringify(tools, null, 2))
  } catch (error) {
    console.error('Failed to save custom tools:', error)
    throw error
  }
}

/**
 * 工具管理 Hook
 *
 * 管理内置工具和自定义工具
 * - 内置工具：静态配置，点击跳转到对应路由
 * - 自定义工具：用户添加，点击在 webview 中打开
 */
export const useTools = () => {
  const customTools = useAppSelector((state: RootState) => state.tools.customTools)
  const dispatch = useAppDispatch()

  // 初始化时从文件加载自定义工具
  useEffect(() => {
    const initCustomTools = async () => {
      const loadedTools = await loadCustomTools()
      if (loadedTools.length > 0 && customTools.length === 0) {
        dispatch(setCustomTools(loadedTools))
      }
    }
    initCustomTools()
  }, [dispatch, customTools.length])

  // 添加自定义工具
  const addTool = useCallback(
    async (tool: CustomTool) => {
      // 检查 ID 是否重复
      if (customTools.some((t) => t.id === tool.id)) {
        throw new Error(`Tool with id "${tool.id}" already exists`)
      }

      const newTool: CustomTool = {
        ...tool,
        addTime: new Date().toISOString()
      }

      const updatedTools = [...customTools, newTool]
      await saveCustomTools(updatedTools)
      dispatch(addCustomTool(newTool))
    },
    [customTools, dispatch]
  )

  // 删除自定义工具
  const removeTool = useCallback(
    async (id: string) => {
      const updatedTools = customTools.filter((t) => t.id !== id)
      await saveCustomTools(updatedTools)
      dispatch(removeCustomTool(id))
    },
    [customTools, dispatch]
  )

  // 更新自定义工具
  const updateTool = useCallback(
    async (tool: CustomTool) => {
      const updatedTools = customTools.map((t) => (t.id === tool.id ? tool : t))
      await saveCustomTools(updatedTools)
      dispatch(updateCustomTool(tool))
    },
    [customTools, dispatch]
  )

  // 批量更新自定义工具（用于排序等）
  const updateTools = useCallback(
    async (tools: CustomTool[]) => {
      await saveCustomTools(tools)
      dispatch(setCustomTools(tools))
    },
    [dispatch]
  )

  return {
    builtinTools: BUILTIN_TOOLS,
    customTools,
    addTool,
    removeTool,
    updateTool,
    updateTools
  }
}
