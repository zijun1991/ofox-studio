import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { UserTheme } from '@renderer/store/settings'
import { setUserTheme } from '@renderer/store/settings'
import type { BackgroundConfig, GradientDirection } from '@renderer/types/skin'
import Color from 'color'

// 渐变方向映射到 CSS
const GRADIENT_DIRECTION_MAP: Record<GradientDirection, string> = {
  'to-right': 'to right',
  'to-bottom': 'to bottom',
  'to-bottom-right': 'to bottom right',
  radial: 'circle at center'
}

/**
 * 应用背景样式到指定元素
 */
function applyBackground(element: HTMLElement | null, config?: BackgroundConfig) {
  if (!element || !config) {
    // 如果没有配置，清除自定义背景
    if (element) {
      element.style.removeProperty('background')
      element.style.removeProperty('background-image')
      element.style.removeProperty('filter')
      element.style.removeProperty('opacity')
    }
    return
  }

  switch (config.type) {
    case 'solid':
      if (config.color) {
        element.style.background = config.color
        element.style.removeProperty('background-image')
      }
      break

    case 'gradient':
      if (config.gradient && config.gradient.colors.length >= 2) {
        const dir = GRADIENT_DIRECTION_MAP[config.gradient.direction || 'to-bottom']
        const gradientStr =
          config.gradient.direction === 'radial'
            ? `radial-gradient(${dir}, ${config.gradient.colors.join(', ')})`
            : `linear-gradient(${dir}, ${config.gradient.colors.join(', ')})`
        element.style.background = gradientStr
        element.style.removeProperty('background-image')
      }
      break

    case 'image':
      if (config.image?.url) {
        const imageUrl =
          config.image.url.startsWith('file://') || config.image.url.startsWith('data:')
            ? config.image.url
            : `file://${config.image.url}`
        element.style.backgroundImage = `url(${imageUrl})`
        element.style.backgroundSize = config.image.size || 'cover'
        element.style.backgroundPosition = 'center'
        element.style.backgroundRepeat = 'no-repeat'
        // 注意：filter 会影响元素的所有内容，包括子元素
        // 如果需要只模糊背景，需要使用伪元素
        if (config.image.blur && config.image.blur > 0) {
          element.style.setProperty('--bg-blur', `${config.image.blur}px`)
        } else {
          element.style.removeProperty('--bg-blur')
        }
        if (config.image.opacity !== undefined) {
          element.style.setProperty('--bg-opacity', String(config.image.opacity))
        } else {
          element.style.removeProperty('--bg-opacity')
        }
      }
      break
  }
}

/**
 * 清除背景样式
 */
function clearBackground(element: HTMLElement | null) {
  if (!element) return
  element.style.removeProperty('background')
  element.style.removeProperty('background-image')
  element.style.removeProperty('background-size')
  element.style.removeProperty('background-position')
  element.style.removeProperty('background-repeat')
  element.style.removeProperty('--bg-blur')
  element.style.removeProperty('--bg-opacity')
}

export default function useUserTheme() {
  const userTheme = useAppSelector((state) => state.settings.userTheme)

  const dispatch = useAppDispatch()

  const initUserTheme = (theme: UserTheme = userTheme) => {
    // 主色调
    const colorPrimary = Color(theme.colorPrimary)
    document.body.style.setProperty('--color-primary', colorPrimary.toString())
    document.body.style.setProperty('--primary', colorPrimary.toString())
    document.body.style.setProperty('--color-primary-soft', colorPrimary.alpha(0.6).toString())
    document.body.style.setProperty('--color-primary-mute', colorPrimary.alpha(0.3).toString())

    // 字体
    document.documentElement.style.setProperty('--user-font-family', `'${theme.userFontFamily}'`)
    document.documentElement.style.setProperty('--user-code-font-family', `'${theme.userCodeFontFamily}'`)

    // 背景样式
    if (theme.background) {
      applyBackground(document.body, theme.background)
    } else {
      clearBackground(document.body)
    }
  }

  return {
    colorPrimary: Color(userTheme.colorPrimary),
    userTheme,

    initUserTheme,

    setUserTheme(newTheme: UserTheme) {
      dispatch(setUserTheme(newTheme))
      initUserTheme(newTheme)
    },

    /**
     * 应用背景配置
     */
    applyBackground,

    /**
     * 清除背景配置
     */
    clearBackground
  }
}
