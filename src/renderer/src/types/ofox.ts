/**
 * Ofox API 模型类型定义
 *
 * 从 ofox.ai/zh/models 页面 SSR 数据提取的模型信息类型
 */

/**
 * Ofox 模型定价信息
 * 价格单位为 per token，使用字符串保持精度
 */
export interface OfoxModelPricing {
  input: string
  output: string
  input_cache_read?: string
  input_cache_write?: string
  web_search?: string
}

/**
 * Ofox 模型能力
 */
export interface OfoxModelCapabilities {
  vision?: boolean
  function_calling?: boolean
  reasoning?: boolean
  prompt_caching?: boolean
  web_search?: boolean
  web_fetch?: boolean
  audio_input?: boolean
  video_input?: boolean
  pdf_input?: boolean
}

/**
 * Ofox 模型信息
 * 从 ofox.ai 页面提取的原始模型数据结构
 */
export interface OfoxModel {
  /** 模型 ID，格式为 "provider/model-name"，例如 "anthropic/claude-opus-4.6" */
  id: string
  /** 规范化的 slug，例如 "claude-opus-4.6-2026-01-15" */
  canonical_slug: string
  /** 显示名称，例如 "Claude Opus 4.6" */
  display_name: string
  /** 模型描述 */
  description?: string
  /** 图标名称，例如 "Claude" */
  icon?: string
  /** 模型拥有者/提供商，例如 "anthropic" */
  owned_by?: string
  /** 模型协议，例如 "openai" 或 "anthropic" */
  model_protocol: string
  /** 模型系列，例如 "claude" */
  series?: string
  /** 模型模式，例如 "chat"、"embedding" 等 */
  mode: string
  /** 上下文窗口大小 (tokens) */
  context_window: number
  /** 最大输出 tokens */
  max_output_tokens?: number
  /** 定价信息 */
  pricing: OfoxModelPricing
  /** 模型能力 */
  capabilities: OfoxModelCapabilities
  /** 支持的提供商类型，例如 ["anthropic"] */
  supported_provider_types: string[]
  /** 支持的协议，例如 ["openai", "anthropic"] */
  supported_protocols: string[]
  /** 发布时间 */
  released_at?: string
}

/**
 * Ofox API 响应类型
 */
export interface OfoxApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ============================================
// 三个 API 端点的原始响应类型
// ============================================

/**
 * OpenAI 格式模型 (/v1/models)
 */
export interface OfoxOpenAIModel {
  id: string
  object: string
  created: number
  owned_by: string
  canonical_slug: string
  name: string
  description?: string
  context_length: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string
    instruct_type?: string | null
  }
  pricing?: {
    prompt: string
    completion: string
    input_cache_read?: string
    input_cache_write_5m?: string
    input_cache_write_1h?: string
    input_cache_write?: string
    web_search?: string
  }
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  supported_parameters?: string[]
}

/**
 * Anthropic 格式模型 (/anthropic/v1/models)
 */
export interface OfoxAnthropicModel {
  type: string
  id: string
  display_name: string
  created_at: string
  owned_by: string
  canonical_slug: string
  description?: string
  context_length: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string
    instruct_type?: string | null
  }
  pricing?: {
    prompt: string
    completion: string
    input_cache_read?: string
    input_cache_write_5m?: string
    input_cache_write_1h?: string
    input_cache_write?: string
    web_search?: string
  }
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  supported_parameters?: string[]
  expiration_date?: string | null
}

/**
 * Gemini 格式模型 (/gemini/v1beta/models)
 */
export interface OfoxGeminiModel {
  name: string
  version: string
  displayName: string
  description?: string
  inputTokenLimit: number
  outputTokenLimit: number
  supportedGenerationMethods?: string[]
  ownedBy: string
  canonicalSlug: string
  contextLength: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string
    instruct_type?: string | null
  }
  pricing?: {
    prompt: string
    completion: string
    audio?: string
    input_cache_read?: string
    input_cache_write?: string
    input_cached_audio?: string
    web_search?: string
  }
  topProvider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  supportedParameters?: string[]
  expirationDate?: string | null
}
