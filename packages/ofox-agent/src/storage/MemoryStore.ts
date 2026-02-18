/**
 * Memory 记忆机制实现
 * 渐进式策略：初始版本使用关键词匹配，后续可升级为向量语义搜索
 */

import type { SessionMessage } from '../types/message'
import type { LokiStorage } from './LokiStorage'

/**
 * 记忆文档
 */
export interface MemoryDocument {
  id: string
  sessionId: string
  type: 'fact' | 'preference' | 'context'
  content: string
  importance: number // 0-1
  embedding?: number[]
  createdAt: string
  lastAccessedAt: string
  accessCount: number
}

/**
 * 记忆配置
 */
export interface MemoryConfig {
  maxMemories: number
  importanceThreshold: number
  retrievalLimit: number
  searchStrategy: 'keyword' | 'vector'
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MemoryConfig = {
  maxMemories: 1000,
  importanceThreshold: 0.3,
  retrievalLimit: 10,
  searchStrategy: 'keyword'
}

/**
 * 记忆提取提示词
 */
const MEMORY_EXTRACTION_PROMPT = `你是一个记忆提取专家。从以下对话中提取重要的记忆信息。

请提取以下类型的记忆：
1. **fact**: 事实性信息（日期、数字、名称、地点等具体信息）
2. **preference**: 用户偏好（用户喜欢/不喜欢什么，习惯等）
3. **context**: 上下文信息（正在讨论的话题，当前任务等）

对于每条记忆，评估其重要性（0-1）：
- 1.0: 关键信息，必须记住
- 0.7: 重要信息，应该记住
- 0.4: 有用信息，可以记住
- 0.2: 次要信息，可选记忆

请按以下 JSON 格式输出：
{
  "memories": [
    {
      "type": "fact|preference|context",
      "content": "记忆内容（简洁的一句话）",
      "importance": 0.0-1.0
    }
  ]
}

对话内容：
---
{{DIALOG}}
---

请提取记忆：`

/**
 * Memory Store 类
 */
export class MemoryStore {
  private config: MemoryConfig

  constructor(
    private storage: LokiStorage,
    config?: Partial<MemoryConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 从对话中提取记忆
   * 注意：实际提取需要调用 LLM，这里只返回提示词
   */
  getExtractionPrompt(messages: SessionMessage[]): string {
    const dialogText = messages
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        return `[${m.role.toUpperCase()}]: ${content}`
      })
      .join('\n\n')

    return MEMORY_EXTRACTION_PROMPT.replace('{{DIALOG}}', dialogText)
  }

  /**
   * 解析提取结果并存储
   */
  async parseAndStoreExtraction(sessionId: string, extractionResult: string): Promise<MemoryDocument[]> {
    // 尝试解析 JSON
    let parsed: { memories: Array<{ type: string; content: string; importance: number }> }

    try {
      // 移除可能的 markdown 代码块
      const jsonMatch = extractionResult.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : extractionResult
      parsed = JSON.parse(jsonStr.trim())
    } catch {
      console.warn('Failed to parse memory extraction result')
      return []
    }

    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      return []
    }

    // 过滤低重要性的记忆
    const filteredMemories = parsed.memories.filter((m) => m.importance >= this.config.importanceThreshold)

    // 存储记忆
    const stored: MemoryDocument[] = []
    for (const mem of filteredMemories) {
      if (mem.type && mem.content && ['fact', 'preference', 'context'].includes(mem.type)) {
        const doc = await this.storage.addMemory({
          sessionId,
          type: mem.type as 'fact' | 'preference' | 'context',
          content: mem.content,
          importance: mem.importance
        })
        stored.push(doc)
      }
    }

    // 检查记忆数量限制
    await this.enforceMemoryLimit(sessionId)

    return stored
  }

  /**
   * 获取相关记忆
   */
  async getRelevantMemories(sessionId: string, currentMessage: string): Promise<string> {
    const memories = await this.storage.getRelevantMemories(sessionId, currentMessage, this.config.retrievalLimit)

    if (memories.length === 0) {
      return ''
    }

    // 格式化记忆
    const formattedMemories = memories.map((m) => {
      const typeEmoji =
        {
          fact: '📌',
          preference: '❤️',
          context: '💭'
        }[m.type] || '📝'

      return `${typeEmoji} [${m.type}] ${m.content}`
    })

    return `[记忆上下文]\n${formattedMemories.join('\n')}`
  }

  /**
   * 手动添加记忆
   */
  async addMemory(
    sessionId: string,
    type: 'fact' | 'preference' | 'context',
    content: string,
    importance: number = 0.5
  ): Promise<MemoryDocument> {
    return this.storage.addMemory({
      sessionId,
      type,
      content,
      importance
    })
  }

  /**
   * 清除会话记忆
   */
  async clearSessionMemories(sessionId: string): Promise<void> {
    // 通过 LokiStorage 删除
    const memories = await this.storage.getRelevantMemories(sessionId, '', 10000)
    for (const mem of memories) {
      await this.storage.deleteMemory(mem.id)
    }
  }

  /**
   * 记忆衰减 - 删除低重要性且长时间未访问的记忆
   */
  async decayMemories(sessionId: string): Promise<number> {
    const memories = await this.storage.getRelevantMemories(sessionId, '', 10000)
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000
    let deletedCount = 0

    for (const mem of memories) {
      const lastAccessed = new Date(mem.lastAccessedAt).getTime()
      const daysSinceAccess = (now - lastAccessed) / dayInMs

      // 衰减规则：
      // - 7 天未访问且重要性 < 0.5：删除
      // - 30 天未访问且重要性 < 0.7：删除
      // - 90 天未访问：删除
      if (
        (daysSinceAccess > 7 && mem.importance < 0.5) ||
        (daysSinceAccess > 30 && mem.importance < 0.7) ||
        daysSinceAccess > 90
      ) {
        await this.storage.deleteMemory(mem.id)
        deletedCount++
      }
    }

    return deletedCount
  }

  /**
   * 执行记忆数量限制
   */
  private async enforceMemoryLimit(sessionId: string): Promise<void> {
    const memories = await this.storage.getRelevantMemories(sessionId, '', 10000)

    if (memories.length <= this.config.maxMemories) {
      return
    }

    // 按重要性排序，删除最低重要性的
    const sortedMemories = [...memories].sort((a, b) => a.importance - b.importance)
    const toDelete = sortedMemories.slice(0, memories.length - this.config.maxMemories)

    for (const mem of toDelete) {
      await this.storage.deleteMemory(mem.id)
    }
  }
}
