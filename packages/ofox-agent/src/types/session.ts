/**
 * 会话类型定义
 */

import type { SessionMessage } from './message'

/**
 * 会话文档 - 存储在 LokiJS 中
 */
export interface SessionDocument {
  /** 会话唯一标识 */
  id: string
  /** 会话名称 */
  name?: string
  /** 系统提示词 */
  systemPrompt?: string
  /** 使用的模型 */
  model: string
  /** Provider 类型 */
  providerType: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
  /** 会话元数据 */
  metadata?: SessionMetadata
}

/**
 * 会话元数据
 */
export interface SessionMetadata {
  /** 总消息数 */
  messageCount?: number
  /** 总 token 数 */
  totalTokens?: {
    input: number
    output: number
  }
  /** 最后活跃时间 */
  lastActiveAt?: string
  /** 是否已归档 */
  archived?: boolean
  /** 标签 */
  tags?: string[]
  /** 自定义配置 */
  [key: string]: unknown
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 系统提示词 */
  systemPrompt?: string
  /** 模型 ID */
  model?: string
  /** 温度 */
  temperature?: number
  /** 最大 token 数 */
  maxTokens?: number
}

/**
 * 创建会话参数
 */
export interface CreateSessionParams {
  /** 会话 ID（可选，自动生成） */
  id?: string
  /** 会话名称 */
  name?: string
  /** 系统提示词 */
  systemPrompt?: string
  /** 模型 */
  model: string
  /** Provider 类型 */
  providerType: string
  /** 元数据 */
  metadata?: SessionMetadata
}

/**
 * 更新会话参数
 */
export interface UpdateSessionParams {
  name?: string
  systemPrompt?: string
  model?: string
  metadata?: Partial<SessionMetadata>
}

/**
 * 完整会话上下文（包含摘要和消息）
 */
export interface SessionContext {
  /** 会话文档 */
  session: SessionDocument
  /** 压缩摘要列表 */
  summaries: CompressedSummaryDocument[]
  /** 最近消息 */
  recentMessages: SessionMessage[]
}

/**
 * 压缩摘要文档
 */
export interface CompressedSummaryDocument {
  /** 摘要唯一标识 */
  id: string
  /** 所属会话 ID */
  sessionId: string
  /** 摘要内容 */
  summary: string
  /** 被压缩的原始消息 ID 列表 */
  originalMessageIds: string[]
  /** 原始 token 数量 */
  originalTokenCount: number
  /** 压缩后 token 数量 */
  compressedTokenCount: number
  /** 创建时间 */
  createdAt: string
  /** 提取的主题 */
  topics?: string[]
  /** 关键决策 */
  keyDecisions?: string[]
  /** 未完成的任务 */
  pendingTasks?: string[]
}
