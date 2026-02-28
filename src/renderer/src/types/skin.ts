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
