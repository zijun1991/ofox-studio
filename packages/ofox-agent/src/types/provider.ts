/**
 * Provider 类型定义
 */

import type { StreamChunk, UnifiedMessage } from './message'
import type { ToolDefinition } from './tool'

/**
 * Provider 类型
 */
export type ProviderType = 'openai' | 'anthropic' | 'gemini'

/**
 * LLM Provider 配置
 */
export interface LlmProviderConfig {
  /** Provider 类型 */
  type: ProviderType
  /** API Key */
  apiKey: string
  /** API 基础 URL */
  baseURL?: string
  /** 模型 ID */
  model: string
  /** 额外的请求头 */
  headers?: Record<string, string>
  /** 请求超时（毫秒） */
  timeout?: number
}

/**
 * 生成选项
 */
export interface GenerateOptions {
  /** 最大 token 数 */
  maxTokens?: number
  /** 温度 (0-2) */
  temperature?: number
  /** Top-P 采样 */
  topP?: number
  /** 停止序列 */
  stopSequences?: string[]
  /** 系统提示词 */
  systemPrompt?: string
  /** 可用工具 */
  tools?: ToolDefinition[]
}

/**
 * 生成结果
 */
export interface GenerateResult {
  /** 生成的内容 */
  content: string
  /** 工具调用 */
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
  /** Token 使用情况 */
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  /** 完成原因 */
  finishReason: 'stop' | 'tool_use' | 'length' | 'error'
}

/**
 * LLM Provider 抽象接口
 */
export interface ILlmProvider {
  /**
   * 生成完整响应
   */
  generate(messages: UnifiedMessage[], options?: GenerateOptions): Promise<GenerateResult>

  /**
   * 流式生成响应
   */
  stream(messages: UnifiedMessage[], options?: GenerateOptions): AsyncIterable<StreamChunk>

  /**
   * 将统一消息转换为 Provider 特定格式
   */
  convertMessages(messages: UnifiedMessage[]): unknown

  /**
   * 将工具定义转换为 Provider 特定格式
   */
  convertTools?(tools: ToolDefinition[]): unknown
}

/**
 * Cherry Studio 的 Model 配置（简化版）
 */
export interface Model {
  id: string
  provider: string
  name: string
  group?: string
  capabilities?: Array<{
    type: string
    isUserSelected?: boolean
  }>
}

/**
 * Cherry Studio 的 Provider 配置（简化版）
 */
export interface Provider {
  id: string
  type: string
  name: string
  apiKey: string
  apiHost?: string
  models?: Model[]
  enabled?: boolean
  extra_headers?: Record<string, string>
}
