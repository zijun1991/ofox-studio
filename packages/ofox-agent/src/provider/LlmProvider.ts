/**
 * LLM Provider 抽象基类
 */

import type { StreamChunk, UnifiedMessage } from '../types/message'
import type { GenerateOptions, GenerateResult, ILlmProvider, LlmProviderConfig, ProviderType } from '../types/provider'
import type { ToolDefinition } from '../types/tool'

/**
 * LLM Provider 抽象基类
 */
export abstract class LlmProvider implements ILlmProvider {
  protected config: LlmProviderConfig

  constructor(config: LlmProviderConfig) {
    this.config = config
  }

  /**
   * Provider 类型
   */
  get type(): ProviderType {
    return this.config.type
  }

  /**
   * 模型 ID
   */
  get model(): string {
    return this.config.model
  }

  /**
   * 生成完整响应
   */
  abstract generate(messages: UnifiedMessage[], options?: GenerateOptions): Promise<GenerateResult>

  /**
   * 流式生成响应
   */
  abstract stream(messages: UnifiedMessage[], options?: GenerateOptions): AsyncIterable<StreamChunk>

  /**
   * 将统一消息转换为 Provider 特定格式
   */
  abstract convertMessages(messages: UnifiedMessage[]): unknown

  /**
   * 将工具定义转换为 Provider 特定格式
   */
  abstract convertTools?(tools: ToolDefinition[]): unknown

  /**
   * 获取 API 配置
   */
  protected getApiConfig() {
    return {
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      model: this.config.model,
      headers: this.config.headers,
      timeout: this.config.timeout || 120000
    }
  }

  /**
   * 构建请求选项
   */
  protected buildRequestOptions(options?: GenerateOptions) {
    return {
      maxTokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      topP: options?.topP,
      stopSequences: options?.stopSequences,
      systemPrompt: options?.systemPrompt,
      tools: options?.tools
    }
  }
}
