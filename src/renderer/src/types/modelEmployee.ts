import type { Model } from '.'

// Re-export Model for convenience
export type { Model }

/**
 * 能力等级枚举 - 代表 AI 员工的能力层级
 */
export enum EducationLevel {
  HIGH_SCHOOL = 'high_school', // 初级
  UNDERGRADUATE = 'undergraduate', // 中级
  MASTER = 'master', // 高级
  PHD = 'phd' // 顶级
}

/**
 * 员工配置
 */
export interface ModelEmployee {
  id: string
  name: string // 员工名称 (e.g., "智能小助手")
  description: string // 员工介绍 (e.g., "擅长简单对话和快速响应")
  soul?: string // 员工性格/灵魂提示词
  model: Model // 绑定的模型
  educationLevel: EducationLevel // 所属能力等级
  createdAt: number
  updatedAt: number
}

/**
 * 员工配置状态
 */
export interface ModelEmployeeConfig {
  employees: ModelEmployee[]
  educationLevelOrder: EducationLevel[] // 自定义排序
}

/**
 * 导入/导出数据格式
 */
export interface ModelEmployeeExportData {
  version: string
  exportedAt: string
  employees: Omit<ModelEmployee, 'id' | 'createdAt' | 'updatedAt'>[]
  educationLevelOrder: EducationLevel[]
}
