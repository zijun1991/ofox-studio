import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import type { EducationLevel, ModelEmployee, ModelEmployeeConfig } from '@renderer/types/modelEmployee'
import { EducationLevel as EL } from '@renderer/types/modelEmployee'
import { uuid } from '@renderer/utils'

export interface ModelEmployeeState {
  config: ModelEmployeeConfig
}

export const initialState: ModelEmployeeState = {
  config: {
    employees: [],
    educationLevelOrder: [EL.HIGH_SCHOOL, EL.UNDERGRADUATE, EL.MASTER, EL.PHD]
  }
}

const modelEmployeeSlice = createSlice({
  name: 'modelEmployee',
  initialState,
  reducers: {
    addEmployee: (state, action: PayloadAction<Omit<ModelEmployee, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const now = Date.now()
      state.config.employees.push({
        ...action.payload,
        id: uuid(),
        createdAt: now,
        updatedAt: now
      })
    },
    updateEmployee: (
      state,
      action: PayloadAction<{ id: string } & Partial<Omit<ModelEmployee, 'id' | 'createdAt'>>>
    ) => {
      const index = state.config.employees.findIndex((e) => e.id === action.payload.id)
      if (index !== -1) {
        state.config.employees[index] = {
          ...state.config.employees[index],
          ...action.payload,
          updatedAt: Date.now()
        }
      }
    },
    removeEmployee: (state, action: PayloadAction<string>) => {
      state.config.employees = state.config.employees.filter((e) => e.id !== action.payload)
    },
    setEmployees: (state, action: PayloadAction<ModelEmployee[]>) => {
      state.config.employees = action.payload
    },
    setEducationLevelOrder: (state, action: PayloadAction<EducationLevel[]>) => {
      state.config.educationLevelOrder = action.payload
    },
    importConfig: (state, action: PayloadAction<ModelEmployeeConfig>) => {
      state.config = action.payload
    },
    resetConfig: (state) => {
      state.config = initialState.config
    }
  }
})

export const {
  addEmployee,
  updateEmployee,
  removeEmployee,
  setEmployees,
  setEducationLevelOrder,
  importConfig,
  resetConfig
} = modelEmployeeSlice.actions

export default modelEmployeeSlice.reducer
