import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

/**
 * 自定义工具类型
 * 用户添加的自定义工具，点击后在 webview 中打开
 */
export interface CustomTool {
  id: string
  name: string
  url: string
  logo?: string
  addTime?: string
}

export interface ToolsState {
  customTools: CustomTool[]
}

const initialState: ToolsState = {
  customTools: []
}

const toolsSlice = createSlice({
  name: 'tools',
  initialState,
  reducers: {
    setCustomTools: (state, action: PayloadAction<CustomTool[]>) => {
      state.customTools = action.payload
    },
    addCustomTool: (state, action: PayloadAction<CustomTool>) => {
      state.customTools.push(action.payload)
    },
    removeCustomTool: (state, action: PayloadAction<string>) => {
      state.customTools = state.customTools.filter((tool) => tool.id !== action.payload)
    },
    updateCustomTool: (state, action: PayloadAction<CustomTool>) => {
      const index = state.customTools.findIndex((tool) => tool.id === action.payload.id)
      if (index !== -1) {
        state.customTools[index] = action.payload
      }
    }
  }
})

export const { setCustomTools, addCustomTool, removeCustomTool, updateCustomTool } = toolsSlice.actions

export default toolsSlice.reducer
