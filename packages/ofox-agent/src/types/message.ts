/**
 * OfoxAgent 统一消息类型
 * 支持 OpenAI/Anthropic/Gemini 三种协议的相互转换
 */

/**
 * 统一内容部分 - 支持所有三种协议的内容类型
 */
export type UnifiedContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType?: string } // base64 or URL
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string; signature?: string } // For extended thinking (Anthropic)
  | { type: 'redacted_thinking'; data: string }
  | { type: 'function_call'; name: string; arguments: string } // Gemini format
  | { type: 'function_response'; name: string; response: unknown } // Gemini format

/**
 * 工具调用（OpenAI 格式）
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 统一消息格式
 */
export interface UnifiedMessage {
  /** 消息唯一标识 */
  id: string
  /** 消息角色 */
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** 消息内容：字符串或内容部分数组 */
  content: string | UnifiedContentPart[]
  /** 消息创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt?: string

  /** 发送者名称（可选） */
  name?: string

  /** OpenAI 格式的工具调用 */
  tool_calls?: ToolCall[]

  /** 工具响应关联的调用 ID */
  tool_call_id?: string
}

/**
 * 会话消息 - 带有会话上下文的完整消息
 */
export interface SessionMessage extends UnifiedMessage {
  /** 所属会话 ID */
  sessionId: string
  /** 消息元数据 */
  metadata?: SessionMessageMetadata
}

/**
 * 会话消息元数据
 */
export interface SessionMessageMetadata {
  /** Token 使用情况 */
  tokens?: {
    input: number
    output: number
  }
  /** 使用的模型 */
  model?: string
  /** 使用的 Provider */
  provider?: string
  /** 响应延迟（毫秒） */
  latency?: number
  /** 是否为压缩后的摘要消息 */
  isCompressed?: boolean
  /** 压缩前的 token 数量 */
  originalTokenCount?: number
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  /** 增量文本 */
  delta: string
  /** 工具调用（流式） */
  toolCalls?: Array<{
    id: string
    name: string
    delta: string
  }>
  /** 是否完成 */
  isComplete: boolean
  /** 使用情况（仅在完成时返回） */
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * 消息角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'
