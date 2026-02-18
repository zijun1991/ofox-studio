/**
 * OfoxAgent 核心类
 * AI Agent 主实现
 */

import { nanoid } from 'nanoid'

import type { LlmProvider } from '../provider/LlmProvider'
import { ProviderFactory } from '../provider/ProviderFactory'
import { SkillExecutor } from '../skills/SkillExecutor'
import { type SkillDefinition, SkillLoader } from '../skills/SkillLoader'
import { LokiStorage } from '../storage/LokiStorage'
import { MemoryStore } from '../storage/MemoryStore'
import { ToolRegistry } from '../tools/ToolRegistry'
import type { SessionMessage, StreamChunk, UnifiedMessage } from '../types/message'
import type { CompressionConfig } from './SessionCompressor'
import { SessionCompressor } from './SessionCompressor'

/**
 * OfoxAgent 配置
 */
export interface OfoxAgentConfig {
  /** Provider 配置 */
  provider: {
    type: 'openai' | 'anthropic' | 'gemini'
    apiKey: string
    baseURL?: string
    model: string
  }
  /** 系统提示词 */
  systemPrompt?: string
  /** 启用的 Skills */
  skills?: string[]
  /** 启用 MCP Tools */
  mcpTools?: boolean
  /** 记忆配置 */
  memory?: {
    enabled: boolean
    maxMemories?: number
    searchStrategy?: 'keyword' | 'vector'
  }
  /** 压缩配置 */
  compression?: CompressionConfig
}

/**
 * OfoxAgent 主类
 */
export class OfoxAgent {
  private provider: LlmProvider
  private storage: LokiStorage
  private memoryStore: MemoryStore | null = null
  private compressor: SessionCompressor | null = null
  private skillLoader: SkillLoader
  private skillExecutor: SkillExecutor
  private toolRegistry: ToolRegistry
  private enabledSkills: Map<string, SkillDefinition> = new Map()
  private config: OfoxAgentConfig
  private initialized = false

  constructor(dbName: string, config: OfoxAgentConfig) {
    this.config = config
    this.provider = ProviderFactory.create(config.provider)
    this.storage = new LokiStorage(dbName)
    this.skillLoader = new SkillLoader()
    this.skillExecutor = new SkillExecutor()
    this.toolRegistry = new ToolRegistry()

    // 初始化记忆存储
    if (config.memory?.enabled) {
      this.memoryStore = new MemoryStore(this.storage, {
        maxMemories: config.memory.maxMemories,
        searchStrategy: config.memory.searchStrategy || 'keyword'
      })
    }

    // 初始化压缩器
    if (config.compression?.enabled !== false) {
      this.compressor = new SessionCompressor(
        this.provider,
        config.compression || {
          enabled: true,
          maxTokens: 100000,
          preserveRecentMessages: 4
        }
      )
    }
  }

  /**
   * 初始化 Agent
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // 初始化存储
    await this.storage.initialize()

    // 加载 Skills
    if (this.config.skills && this.config.skills.length > 0) {
      const allSkills = await this.skillLoader.loadAllSkills()
      for (const skillName of this.config.skills) {
        const skill = allSkills.get(skillName)
        if (skill) {
          this.enabledSkills.set(skillName, skill)
        } else {
          console.warn(`Skill not found: ${skillName}`)
        }
      }
    }

    this.initialized = true
  }

  /**
   * 聊天 - 完整响应
   */
  async chat(sessionId: string, content: string): Promise<string> {
    await this.ensureInitialized()

    let result = ''
    for await (const chunk of this.chatStream(sessionId, content)) {
      result += chunk.delta
    }
    return result
  }

  /**
   * 聊天 - 流式响应
   */
  async *chatStream(sessionId: string, content: string): AsyncIterable<StreamChunk> {
    await this.ensureInitialized()

    // 1. 获取或创建会话
    let session = await this.storage.getSession(sessionId)
    if (!session) {
      session = await this.storage.createSession({
        id: sessionId,
        model: this.config.provider.model,
        providerType: this.config.provider.type,
        systemPrompt: this.config.systemPrompt
      })
    }

    // 2. 加载对话历史
    let history = await this.storage.getSessionMessages(sessionId)

    // 3. 检查是否需要压缩
    if (this.compressor && this.compressor.needsCompression(history)) {
      const { summary, retainedMessages } = await this.compressor.compress(sessionId, history)
      if (summary) {
        await this.storage.addCompressedSummary(summary)
        history = retainedMessages
      }
    }

    // 4. 获取相关记忆
    let memoryContext = ''
    if (this.memoryStore) {
      memoryContext = await this.memoryStore.getRelevantMemories(sessionId, content)
    }

    // 5. 构建消息数组
    const messages = this.buildMessages(history, content, memoryContext)

    // 6. 构建系统提示词
    const systemPrompt = this.buildSystemPrompt()

    // 7. 获取可用工具
    const tools = this.toolRegistry.getAllForLLM()

    // 8. 流式生成响应
    let fullContent = ''
    let toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = []

    for await (const chunk of this.provider.stream(messages, {
      systemPrompt,
      tools: tools.length > 0 ? tools : undefined
    })) {
      if (chunk.delta) {
        fullContent += chunk.delta
      }

      // 收集工具调用
      if (chunk.toolCalls) {
        for (const tc of chunk.toolCalls) {
          const existing = toolCalls.find((t) => t.id === tc.id)
          if (existing) {
            // 合并 delta
            try {
              const currentArgs = JSON.stringify(existing.arguments)
              const newArgs = currentArgs.slice(0, -1) + tc.delta
              existing.arguments = JSON.parse(newArgs)
            } catch {
              // 忽略解析错误
            }
          } else {
            toolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: {}
            })
          }
        }
      }

      yield chunk
    }

    // 9. 存储用户消息
    await this.storage.addMessage({
      id: nanoid(),
      sessionId,
      role: 'user',
      content: content,
      createdAt: new Date().toISOString()
    })

    // 10. 存储助手消息
    await this.storage.addMessage({
      id: nanoid(),
      sessionId,
      role: 'assistant',
      content: fullContent,
      createdAt: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? this.formatToolCalls(toolCalls) : undefined,
      metadata: {
        model: this.config.provider.model,
        provider: this.config.provider.type
      }
    })

    // 11. 提取记忆（如果启用）
    if (this.memoryStore) {
      const extractionPrompt = this.memoryStore.getExtractionPrompt([
        { id: 'user', sessionId, role: 'user', content, createdAt: new Date().toISOString() },
        {
          id: 'assistant',
          sessionId,
          role: 'assistant',
          content: fullContent,
          createdAt: new Date().toISOString()
        }
      ])
      // 注意：这里只是生成提示词，实际提取需要额外的 LLM 调用
      // 可以在后台执行，不影响响应速度
      console.log('Memory extraction prompt:', extractionPrompt.slice(0, 100) + '...')
    }
  }

  /**
   * 执行 Skill
   */
  async executeSkill(sessionId: string, skillName: string, args: string): Promise<string> {
    await this.ensureInitialized()

    const skill = this.enabledSkills.get(skillName)
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`)
    }

    const prompt = await this.skillExecutor.execute(skill, {
      sessionId,
      args
    })

    return this.chat(sessionId, prompt)
  }

  /**
   * 注册工具
   */
  registerTool(tool: {
    name: string
    description: string
    parameters: unknown
    execute?: (args: Record<string, unknown>) => Promise<string | unknown>
  }): void {
    this.toolRegistry.register(tool as any)
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(sessionId: string, limit?: number): Promise<SessionMessage[]> {
    await this.ensureInitialized()
    return this.storage.getSessionMessages(sessionId, limit)
  }

  /**
   * 清除会话
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.ensureInitialized()
    await this.storage.clearSessionMessages(sessionId)
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.storage) {
      await this.storage.close()
    }
    this.initialized = false
  }

  // ==================== 私有方法 ====================

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * 构建消息数组
   */
  private buildMessages(history: SessionMessage[], newContent: string, memoryContext: string): UnifiedMessage[] {
    const messages: UnifiedMessage[] = []

    // 添加历史消息
    for (const msg of history) {
      messages.push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id
      })
    }

    // 添加记忆上下文
    if (memoryContext) {
      messages.push({
        id: nanoid(),
        role: 'system',
        content: memoryContext,
        createdAt: new Date().toISOString()
      })
    }

    // 添加新用户消息
    messages.push({
      id: nanoid(),
      role: 'user',
      content: newContent,
      createdAt: new Date().toISOString()
    })

    return messages
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    let prompt = this.config.systemPrompt || ''

    // 添加 Skill 指令
    if (this.enabledSkills.size > 0) {
      const skillAdditions = this.skillExecutor.buildSystemPromptAdditions(Array.from(this.enabledSkills.values()))
      prompt = prompt ? `${prompt}\n\n${skillAdditions}` : skillAdditions
    }

    return prompt
  }

  /**
   * 格式化工具调用为存储格式
   */
  private formatToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  ): Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> {
    return toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments)
      }
    }))
  }
}
