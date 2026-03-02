/**
 * Ofox 登录状态管理
 *
 * 管理 ofox.ai 的用户登录状态和用户信息
 */

import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

// 用户信息接口
export interface OfoxUser {
  id: string
  email: string
  name?: string
  image?: string
  emailVerified?: boolean
}

// Ofox 状态接口
export interface OfoxState {
  isLoggedIn: boolean
  isChecking: boolean
  isModelsReady: boolean
  user: OfoxUser | null
  showLoginModal: boolean
  error: string | null
}

const initialState: OfoxState = {
  isLoggedIn: false,
  isChecking: true, // 初始时正在检查登录状态
  isModelsReady: false,
  user: null,
  showLoginModal: false,
  error: null
}

const ofoxSlice = createSlice({
  name: 'ofox',
  initialState,
  reducers: {
    setLoggedIn: (state, action: PayloadAction<boolean>) => {
      state.isLoggedIn = action.payload
      state.isChecking = false
      if (!action.payload) {
        state.user = null
      }
    },
    setChecking: (state, action: PayloadAction<boolean>) => {
      state.isChecking = action.payload
    },
    setUser: (state, action: PayloadAction<OfoxUser | null>) => {
      state.user = action.payload
      state.isLoggedIn = action.payload !== null
      state.isChecking = false
    },
    setShowLoginModal: (state, action: PayloadAction<boolean>) => {
      state.showLoginModal = action.payload
      // 显示登录弹窗时，确保 isChecking 为 false
      if (action.payload) {
        state.isChecking = false
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isChecking = false
    },
    logout: (state) => {
      state.isLoggedIn = false
      state.user = null
      state.error = null
    },
    setModelsReady: (state, action: PayloadAction<boolean>) => {
      state.isModelsReady = action.payload
    }
  }
})

export const { setLoggedIn, setChecking, setUser, setShowLoginModal, setError, logout, setModelsReady } =
  ofoxSlice.actions

export default ofoxSlice.reducer
