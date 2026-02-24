/**
 * 皮肤系统类型定义
 */

// 背景类型枚举
export type BackgroundType = 'solid' | 'gradient' | 'image'

// 渐变方向
export type GradientDirection = 'to-right' | 'to-bottom' | 'to-bottom-right' | 'radial'

// 背景配置
export interface BackgroundConfig {
  type: BackgroundType
  // 纯色模式
  color?: string
  // 渐变模式
  gradient?: {
    colors: string[] // 渐变色数组，如 ['#667eea', '#764ba2']
    direction: GradientDirection
  }
  // 图片模式
  image?: {
    url: string // 图片路径或 base64
    blur?: number // 模糊度 0-20
    opacity?: number // 透明度 0-1
    size?: 'cover' | 'contain' | 'auto'
  }
}

// 皮肤预设
export interface SkinPreset {
  id: string // 唯一标识
  name: string // 皮肤名称
  author?: string // 作者
  description?: string // 描述
  isBuiltIn?: boolean // 是否内置
  // 主色调
  colorPrimary: string
  // 背景配置 (支持纯色/渐变/图片)
  background?: BackgroundConfig
  sidebarBackground?: BackgroundConfig
  cardBackground?: BackgroundConfig
  // 字体 (可选)
  userFontFamily?: string
  userCodeFontFamily?: string
}

// 皮肤导出格式
export interface SkinExportFormat {
  version: string
  type: 'ofox-skin'
  skin: Omit<SkinPreset, 'id' | 'isBuiltIn'>
}

// 渐变方向选项（用于 UI）
export const GRADIENT_DIRECTION_OPTIONS: { value: GradientDirection; label: string; icon: string }[] = [
  { value: 'to-right', label: '水平', icon: '→' },
  { value: 'to-bottom', label: '垂直', icon: '↓' },
  { value: 'to-bottom-right', label: '对角', icon: '↘' },
  { value: 'radial', label: '径向', icon: '◉' }
]

// 背景类型选项（用于 UI）
export const BACKGROUND_TYPE_OPTIONS: { value: BackgroundType; label: string }[] = [
  { value: 'solid', label: '纯色' },
  { value: 'gradient', label: '渐变' },
  { value: 'image', label: '图片' }
]
