/**
 * 内置预设皮肤配置
 */
import type { SkinPreset } from '@renderer/types/skin'

export const BUILT_IN_SKINS: SkinPreset[] = [
  // 纯色皮肤
  {
    id: 'default-green',
    name: '经典绿',
    colorPrimary: '#00b96b',
    isBuiltIn: true
  },
  {
    id: 'ocean-blue',
    name: '海洋蓝',
    colorPrimary: '#3B82F6',
    isBuiltIn: true
  },
  {
    id: 'sunset-orange',
    name: '日落橙',
    colorPrimary: '#F59E0B',
    isBuiltIn: true
  },
  {
    id: 'midnight-purple',
    name: '午夜紫',
    colorPrimary: '#8B5CF6',
    isBuiltIn: true
  },
  {
    id: 'rose-pink',
    name: '玫瑰粉',
    colorPrimary: '#EC4899',
    isBuiltIn: true
  },
  {
    id: 'forest-teal',
    name: '森林青',
    colorPrimary: '#14B8A6',
    isBuiltIn: true
  },
  {
    id: 'coral-red',
    name: '珊瑚红',
    colorPrimary: '#FF5470',
    isBuiltIn: true
  },
  {
    id: 'indigo-deep',
    name: '靛蓝深邃',
    colorPrimary: '#6366F1',
    isBuiltIn: true
  },
  // 渐变皮肤
  {
    id: 'gradient-aurora',
    name: '极光渐变',
    colorPrimary: '#667eea',
    background: {
      type: 'gradient',
      gradient: {
        colors: ['#667eea', '#764ba2'],
        direction: 'to-bottom-right'
      }
    },
    isBuiltIn: true
  },
  {
    id: 'gradient-sunset',
    name: '日落渐变',
    colorPrimary: '#f093fb',
    background: {
      type: 'gradient',
      gradient: {
        colors: ['#f093fb', '#f5576c'],
        direction: 'to-right'
      }
    },
    isBuiltIn: true
  },
  {
    id: 'gradient-mint',
    name: '薄荷清新',
    colorPrimary: '#11998e',
    background: {
      type: 'gradient',
      gradient: {
        colors: ['#11998e', '#38ef7d'],
        direction: 'to-bottom'
      }
    },
    isBuiltIn: true
  },
  {
    id: 'gradient-ocean',
    name: '深海渐变',
    colorPrimary: '#2193b0',
    background: {
      type: 'gradient',
      gradient: {
        colors: ['#2193b0', '#6dd5ed'],
        direction: 'to-right'
      }
    },
    isBuiltIn: true
  },
  {
    id: 'gradient-cosmic',
    name: '宇宙星空',
    colorPrimary: '#ff6a00',
    background: {
      type: 'gradient',
      gradient: {
        colors: ['#ff6a00', '#ee0979'],
        direction: 'to-bottom-right'
      }
    },
    isBuiltIn: true
  }
]

// 默认皮肤 ID
export const DEFAULT_SKIN_ID = 'default-green'

// 根据ID获取皮肤
export function getSkinById(id: string): SkinPreset | undefined {
  return BUILT_IN_SKINS.find((skin) => skin.id === id)
}

// 获取所有纯色皮肤
export function getSolidSkins(): SkinPreset[] {
  return BUILT_IN_SKINS.filter((skin) => !skin.background || skin.background.type === 'solid')
}

// 获取所有渐变皮肤
export function getGradientSkins(): SkinPreset[] {
  return BUILT_IN_SKINS.filter((skin) => skin.background?.type === 'gradient')
}
