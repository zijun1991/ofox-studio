/**
 * 用户自定义皮肤 Redux Slice
 */
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import type { SkinPreset } from '@renderer/types/skin'
import { uuid } from '@renderer/utils'

export interface SkinsState {
  customSkins: SkinPreset[] // 用户创建/导入的皮肤
}

export const initialSkinsState: SkinsState = {
  customSkins: []
}

const skinsSlice = createSlice({
  name: 'skins',
  initialState: initialSkinsState,
  reducers: {
    // 添加自定义皮肤
    addCustomSkin: (state, action: PayloadAction<Omit<SkinPreset, 'id'>>) => {
      const newSkin: SkinPreset = {
        ...action.payload,
        id: `custom-${uuid()}`,
        isBuiltIn: false
      }
      state.customSkins.push(newSkin)
    },
    // 更新自定义皮肤
    updateCustomSkin: (state, action: PayloadAction<{ id: string; skin: Partial<SkinPreset> }>) => {
      const index = state.customSkins.findIndex((s) => s.id === action.payload.id)
      if (index !== -1) {
        state.customSkins[index] = {
          ...state.customSkins[index],
          ...action.payload.skin
        }
      }
    },
    // 删除自定义皮肤
    deleteCustomSkin: (state, action: PayloadAction<string>) => {
      state.customSkins = state.customSkins.filter((s) => s.id !== action.payload)
    },
    // 导入皮肤
    importSkin: (state, action: PayloadAction<SkinPreset>) => {
      const skin: SkinPreset = {
        ...action.payload,
        id: `imported-${uuid()}`,
        isBuiltIn: false
      }
      state.customSkins.push(skin)
    },
    // 重置所有自定义皮肤
    resetCustomSkins: (state) => {
      state.customSkins = []
    }
  }
})

export const { addCustomSkin, updateCustomSkin, deleteCustomSkin, importSkin, resetCustomSkins } = skinsSlice.actions

export default skinsSlice.reducer
