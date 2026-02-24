import { createSelector } from '@reduxjs/toolkit'
import { type RootState, useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addEmployee,
  importConfig,
  removeEmployee,
  resetConfig,
  setEducationLevelOrder,
  updateEmployee
} from '@renderer/store/modelEmployee'
import type { EducationLevel, Model, ModelEmployee, ModelEmployeeExportData } from '@renderer/types/modelEmployee'
import { EducationLevel as EL } from '@renderer/types/modelEmployee'
import { uuid } from '@renderer/utils'
import { useCallback, useMemo } from 'react'

// Selectors
const selectModelEmployeeConfig = (state: RootState) => state.modelEmployee.config

const selectAllEmployees = createSelector(selectModelEmployeeConfig, (config) => config.employees)

/**
 * 排序工具函数：按模型 token 价格升序排序
 * 价格计算：input_per_million_tokens + output_per_million_tokens
 */
const sortEmployeesByPrice = (employees: ModelEmployee[]): ModelEmployee[] => {
  return [...employees].sort((a, b) => {
    const priceA = (a.model.pricing?.input_per_million_tokens || 0) + (a.model.pricing?.output_per_million_tokens || 0)
    const priceB = (b.model.pricing?.input_per_million_tokens || 0) + (b.model.pricing?.output_per_million_tokens || 0)
    return priceA - priceB // 升序，价格低的在前
  })
}

export function useModelEmployee() {
  const dispatch = useAppDispatch()
  const config = useAppSelector(selectModelEmployeeConfig)
  const employees = useAppSelector(selectAllEmployees)

  // Get employees grouped by education level (sorted by price)
  const employeesByLevel = useMemo(() => {
    const grouped: Record<EducationLevel, ModelEmployee[]> = {
      [EL.HIGH_SCHOOL]: [],
      [EL.UNDERGRADUATE]: [],
      [EL.MASTER]: [],
      [EL.PHD]: []
    }
    for (const employee of config.employees) {
      grouped[employee.educationLevel].push(employee)
    }
    // Sort each group by price
    for (const level of Object.keys(grouped) as EducationLevel[]) {
      grouped[level] = sortEmployeesByPrice(grouped[level])
    }
    return grouped
  }, [config.employees])

  // Name uniqueness check
  const isNameExists = useCallback(
    (name: string, excludeId?: string): boolean => {
      return employees.some((e) => e.name === name && e.id !== excludeId)
    },
    [employees]
  )

  // CRUD operations
  const createEmployee = useCallback(
    (
      name: string,
      description: string,
      soul: string | undefined,
      model: Model,
      educationLevel: EducationLevel
    ): boolean => {
      if (isNameExists(name)) {
        return false
      }
      dispatch(addEmployee({ name, description, soul, model, educationLevel }))
      return true
    },
    [dispatch, isNameExists]
  )

  const editEmployee = useCallback(
    (id: string, updates: Partial<Omit<ModelEmployee, 'id' | 'createdAt'>>): boolean => {
      // If name is being updated, check for duplicates
      if (updates.name && isNameExists(updates.name, id)) {
        return false
      }
      dispatch(updateEmployee({ id, ...updates }))
      return true
    },
    [dispatch, isNameExists]
  )

  const deleteEmployee = useCallback(
    (id: string) => {
      dispatch(removeEmployee(id))
    },
    [dispatch]
  )

  // Query operations
  const getEmployeeByName = useCallback(
    (name: string): ModelEmployee | undefined => {
      return employees.find((e) => e.name === name)
    },
    [employees]
  )

  const getEmployeeById = useCallback(
    (id: string): ModelEmployee | undefined => {
      return employees.find((e) => e.id === id)
    },
    [employees]
  )

  const getEmployeeByModel = useCallback(
    (modelString: string | undefined): ModelEmployee | undefined => {
      if (!modelString) return undefined
      // modelString 格式为 "provider:modelId"
      const colonIndex = modelString.indexOf(':')
      const provider = colonIndex > -1 ? modelString.slice(0, colonIndex) : undefined
      const modelId = colonIndex > -1 ? modelString.slice(colonIndex + 1) : modelString

      return employees.find((e) => e.model.provider === provider && e.model.id === modelId)
    },
    [employees]
  )

  const getEmployeesByEducationLevel = useCallback(
    (level: EducationLevel): ModelEmployee[] => {
      return employeesByLevel[level]
    },
    [employeesByLevel]
  )

  const getModelByEmployeeName = useCallback(
    (name: string): Model | undefined => {
      const employee = getEmployeeByName(name)
      return employee?.model
    },
    [getEmployeeByName]
  )

  // Education level order operations
  const updateEducationLevelOrder = useCallback(
    (order: EducationLevel[]) => {
      dispatch(setEducationLevelOrder(order))
    },
    [dispatch]
  )

  // Import/Export
  const exportConfig = useCallback((): ModelEmployeeExportData => {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      employees: config.employees.map(({ name, description, soul, model, educationLevel }) => ({
        name,
        description,
        soul,
        model,
        educationLevel
      })),
      educationLevelOrder: config.educationLevelOrder
    }
  }, [config])

  const importConfigData = useCallback(
    (data: ModelEmployeeExportData) => {
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
    },
    [dispatch]
  )

  const reset = useCallback(() => {
    dispatch(resetConfig())
  }, [dispatch])

  return {
    config,
    employees,
    employeesByLevel,
    educationLevelOrder: config.educationLevelOrder,

    // CRUD
    createEmployee,
    editEmployee,
    deleteEmployee,

    // Name check
    isNameExists,

    // Query
    getEmployeeByName,
    getEmployeeById,
    getEmployeeByModel,
    getEmployeesByEducationLevel,
    getModelByEmployeeName,

    // Education level order
    updateEducationLevelOrder,

    // Import/Export
    exportConfig,
    importConfigData,
    reset
  }
}
