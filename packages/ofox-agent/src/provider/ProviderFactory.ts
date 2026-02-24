/**
 * Provider 工厂
 * 从 Ofox Claw Model/Provider 配置创建 LlmProvider 实例
 */

import type { LlmProviderConfig, Model, Provider, ProviderType } from '../types/provider'
import { AnthropicProvider } from './AnthropicProvider'
import { GeminiProvider } from './GeminiProvider'
import type { LlmProvider } from './LlmProvider'
import { OpenAIProvider } from './OpenAIProvider'

/**
 * Provider 工厂
 */
export class ProviderFactory {
  /**
   * 创建 Provider 实例
   */
  static create(config: LlmProviderConfig): LlmProvider {
    switch (config.type) {
      case 'openai':
        return new OpenAIProvider(config)
      case 'anthropic':
        return new AnthropicProvider(config)
      case 'gemini':
        return new GeminiProvider(config)
      default:
        throw new Error(`Unsupported provider type: ${config.type}`)
    }
  }

  /**
   * 从 Ofox Claw Model 和 Provider 配置创建
   */
  static fromModel(model: Model, provider: Provider): LlmProvider {
    const config: LlmProviderConfig = {
      type: this.detectProviderType(provider),
      apiKey: provider.apiKey,
      baseURL: provider.apiHost,
      model: model.id,
      headers: provider.extra_headers
    }
    return this.create(config)
  }

  /**
   * 检测 Provider 类型
   */
  static detectProviderType(provider: Provider): ProviderType {
    const type = provider.type?.toLowerCase() || ''

    // Anthropic 类型
    if (type === 'anthropic' || type === 'vertex-anthropic') {
      return 'anthropic'
    }

    // Gemini 类型
    if (type === 'gemini' || type === 'vertexai' || type === 'google') {
      return 'gemini'
    }

    // 默认使用 OpenAI 协议（大多数兼容 API）
    return 'openai'
  }

  /**
   * 获取支持的 Provider 类型列表
   */
  static getSupportedTypes(): ProviderType[] {
    return ['openai', 'anthropic', 'gemini']
  }

  /**
   * 检查是否支持指定的 Provider 类型
   */
  static isSupported(type: string): boolean {
    return this.getSupportedTypes().includes(type as ProviderType)
  }
}
