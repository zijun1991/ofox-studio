/**
 * Ofox 供应商配置常量
 *
 * 定义 Ofox 三个协议供应商的配置信息
 */

import type { ProviderType } from '@renderer/types'

// Ofox API Key 全局固定（暂时固定，后续改进）
export const OFOX_API_KEY = 'sk-of-NqmDGtLlvKyYVPyvkNStLLtuyrgoulewOaQOCpvBOtnYdwMZIHEfZcrGWbyOrYOh'

// Ofox 供应商配置
export const OFOX_PROVIDER_CONFIGS = {
  openai: {
    id: 'ofox-openai',
    name: 'Ofox OpenAI',
    type: 'openai' as ProviderType,
    apiHost: 'https://api.ofox.ai/v1'
  },
  anthropic: {
    id: 'ofox-anthropic',
    name: 'Ofox Anthropic',
    type: 'anthropic' as ProviderType,
    // @ai-sdk/anthropic 只会追加 /messages，不会追加 /v1，所以这里需要包含 /v1
    // 最终 URL: https://api.ofox.ai/anthropic/v1 + /messages = /anthropic/v1/messages
    // 注意: @anthropic-ai/sdk 路径会在 getSdkClient 中处理，移除末尾的 /v1
    apiHost: 'https://api.ofox.ai/anthropic/v1'
  },
  gemini: {
    id: 'ofox-gemini',
    name: 'Ofox Gemini',
    type: 'gemini' as ProviderType,
    apiHost: 'https://api.ofox.ai/gemini'
  }
} as const

// 支持的协议列表
export const OFOX_SUPPORTED_PROTOCOLS = Object.keys(OFOX_PROVIDER_CONFIGS) as Array<keyof typeof OFOX_PROVIDER_CONFIGS>

// Ofox 供应商 ID 列表
export const OFOX_PROVIDER_IDS = Object.values(OFOX_PROVIDER_CONFIGS).map((c) => c.id)
