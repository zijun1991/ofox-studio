/**
 * 会话压缩器
 * 当会话 token 超过限制时，调用 LLM 进行智能压缩
 */

import { nanoid } from 'nanoid'

import type { LlmProvider } from '../provider/LlmProvider'
import type { SessionMessage } from '../types/message'
import type { CompressedSummaryDocument } from '../types/session'

/**
 * 压缩配置
 */
export interface CompressionConfig {
  /** 是否启用压缩 */
  enabled: boolean
  /** 触发压缩的 token 上限 */
  maxTokens: number
  /** 保留最近的 N 条消息 */
  preserveRecentMessages: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: CompressionConfig = {
  enabled: true,
  maxTokens: 100000,
  preserveRecentMessages: 4
}

/**
 * 压缩系统提示词
 */
const COMPRESSION_SYSTEM_PROMPT = `你是一个对话摘要专家。你的任务是将长对话压缩为简洁但完整的摘要。

压缩原则：
1. 保留所有事实性信息（日期、数字、名称等）
2. 保留用户的偏好和约束
3. 保留关键的决策和理由
4. 标记未完成的任务或待讨论的话题
5. 保持因果关系和逻辑链
6. 使用简洁的语言，去除冗余

输出必须遵循指定的 JSON 格式。`

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩摘要 */
  summary: CompressedSummaryDocument
  /** 保留的消息 */
  retainedMessages: SessionMessage[]
}

/**
 * 会话压缩器
 */
export class SessionCompressor {
  constructor(
    private provider: LlmProvider,
    private config: CompressionConfig = DEFAULT_CONFIG
  ) {}

  /**
   * 检查是否需要压缩
   */
  needsCompression(messages: SessionMessage[]): boolean {
    if (!this.config.enabled) return false
    const totalTokens = this.estimateTokens(messages)
    return totalTokens > this.config.maxTokens
  }

  /**
   * 估算消息的 token 数量
   * 使用简单的字符数估算：约 4 字符 = 1 token
   */
  estimateTokens(messages: SessionMessage[]): number {
    let totalChars = 0
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      totalChars += content.length

      // 计算工具调用的 token
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += tc.function.arguments.length
        }
      }
    }
    return Math.ceil(totalChars / 4)
  }

  /**
   * 执行压缩
   */
  async compress(sessionId: string, messages: SessionMessage[]): Promise<CompressionResult> {
    // 1. 分离消息
    const { toCompress, toRetain } = this.splitMessages(messages)

    if (toCompress.length === 0) {
      return {
        summary: null as unknown as CompressedSummaryDocument,
        retainedMessages: messages
      }
    }

    // 2. 构建压缩 prompt
    const compressionPrompt = this.buildCompressionPrompt(toCompress)

    // 3. 调用 LLM 生成摘要
    const result = await this.provider.generate(
      [
        {
          id: 'compress-system',
          role: 'system',
          content: COMPRESSION_SYSTEM_PROMPT,
          createdAt: new Date().toISOString()
        },
        {
          id: 'compress-user',
          role: 'user',
          content: compressionPrompt,
          createdAt: new Date().toISOString()
        }
      ],
      {
        maxTokens: 4000,
        temperature: 0.3 // 低温度保证摘要质量
      }
    )

    // 4. 解析压缩结果
    const summary = this.parseCompressionResult(result.content, sessionId, toCompress)

    // 5. 构建返回结果：摘要消息 + 保留的消息
    const summaryMessage: SessionMessage = {
      id: `summary-${summary.id}`,
      sessionId,
      role: 'system',
      content: `[历史对话摘要]\n${summary.summary}`,
      createdAt: new Date().toISOString(),
      metadata: {
        isCompressed: true,
        originalTokenCount: summary.originalTokenCount
      }
    }

    return {
      summary,
      retainedMessages: [summaryMessage, ...toRetain]
    }
  }

  /**
   * 分离消息：待压缩 vs 保留
   */
  private splitMessages(messages: SessionMessage[]): {
    toCompress: SessionMessage[]
    toRetain: SessionMessage[]
  } {
    const preserveCount = this.config.preserveRecentMessages

    // 找到安全的分割点
    const splitIndex = this.findSafeSplitIndex(messages, preserveCount)

    return {
      toCompress: messages.slice(0, splitIndex),
      toRetain: messages.slice(splitIndex)
    }
  }

  /**
   * 找到安全的分割点（不切断工具调用链）
   */
  private findSafeSplitIndex(messages: SessionMessage[], preserveCount: number): number {
    const minSplit = Math.max(0, messages.length - preserveCount)

    // 从 minSplit 向前查找安全位置
    for (let i = minSplit; i >= 0; i--) {
      const msg = messages[i]

      // 如果是工具响应，需要保留前面的工具调用
      if (msg.role === 'tool' || msg.tool_call_id) {
        continue
      }

      // 如果是包含工具调用的 assistant 消息，需要保留后面的工具响应
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        continue
      }

      return i
    }

    return minSplit
  }

  /**
   * 构建压缩 prompt
   */
  private buildCompressionPrompt(messages: SessionMessage[]): string {
    const formattedMessages = messages
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        return `[${m.role.toUpperCase()}]: ${content}`
      })
      .join('\n\n')

    return `请对以下对话历史进行压缩摘要。要求：

1. 保留关键信息和上下文
2. 记录重要的决策和结论
3. 列出未完成的任务（如果有）
4. 保持时间顺序的逻辑关系
5. 摘要应该能让 AI 继续当前对话而不丢失重要上下文

对话历史：
---
${formattedMessages}
---

请按以下 JSON 格式输出：
{
  "summary": "对话的主要内容和进展",
  "topics": ["涉及的主要话题"],
  "keyDecisions": ["做出的关键决策"],
  "pendingTasks": ["未完成的任务"]
}`
  }

  /**
   * 解析压缩结果
   */
  private parseCompressionResult(
    content: string,
    sessionId: string,
    originalMessages: SessionMessage[]
  ): CompressedSummaryDocument {
    let parsed: {
      summary?: string
      topics?: string[]
      keyDecisions?: string[]
      pendingTasks?: string[]
    }

    try {
      // 移除可能的 markdown 代码块
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : content
      parsed = JSON.parse(jsonStr.trim())
    } catch {
      // 如果解析失败，使用整个内容作为摘要
      parsed = { summary: content }
    }

    const now = new Date().toISOString()

    return {
      id: nanoid(),
      sessionId,
      summary: parsed.summary || content,
      originalMessageIds: originalMessages.map((m) => m.id),
      originalTokenCount: this.estimateTokens(originalMessages),
      compressedTokenCount: Math.ceil((parsed.summary || content).length / 4),
      createdAt: now,
      topics: parsed.topics || [],
      keyDecisions: parsed.keyDecisions || [],
      pendingTasks: parsed.pendingTasks || []
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): CompressionConfig {
    return { ...this.config }
  }
}
