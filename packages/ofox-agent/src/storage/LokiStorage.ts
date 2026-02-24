/**
 * LokiJS 存储实现
 * 持久化到 Ofox Claw 数据目录
 */

import { app } from 'electron'
import fs from 'fs'
import Loki from 'lokijs'
import { nanoid } from 'nanoid'
import path from 'path'

import type { SessionMessage } from '../types/message'
import type {
  CompressedSummaryDocument,
  CreateSessionParams,
  SessionDocument,
  UpdateSessionParams
} from '../types/session'
import type { MemoryDocument } from './MemoryStore'

/**
 * 自定义数据路径（用于测试）
 */
let customDataPath: string | null = null

/**
 * 设置自定义数据路径（主要用于测试）
 */
export function setCustomDataPath(path: string | null): void {
  customDataPath = path
}

/**
 * 获取 OfoxAgent 数据存储路径
 * 生产环境: {userData}/Data/OfoxAgent/
 * 开发环境: {userData}Dev/Data/OfoxAgent/
 * 测试环境: 使用自定义路径
 */
export function getOfoxAgentDataPath(): string {
  // 测试环境使用自定义路径
  if (customDataPath) {
    if (!fs.existsSync(customDataPath)) {
      fs.mkdirSync(customDataPath, { recursive: true })
    }
    return customDataPath
  }

  const basePath = path.join(app.getPath('userData'), 'Data', 'OfoxAgent')
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true })
  }
  return basePath
}

/**
 * LokiJS 存储类
 */
export class LokiStorage {
  private db: Loki | null = null
  private sessions: Loki.Collection<SessionDocument> | null = null
  private messages: Loki.Collection<SessionMessage> | null = null
  private memories: Loki.Collection<MemoryDocument> | null = null
  private compressedSummaries: Loki.Collection<CompressedSummaryDocument> | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor(private dbName: string = 'agent.db') {}

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve) => {
      const dbPath = path.join(getOfoxAgentDataPath(), this.dbName)

      this.db = new Loki(dbPath, {
        autoload: true,
        autoloadCallback: (err: Error | undefined) => {
          if (err) {
            console.error('LokiJS autoload error:', err)
            // 如果加载失败，创建新的数据库
            this.initializeCollections()
          } else {
            this.initializeCollections()
          }
          this.initialized = true
          resolve()
        },
        autosave: true,
        autosaveInterval: 4000,
        serializationMethod: 'pretty',
        throttledSaves: true
      })

      // 如果 autoload 超时，手动初始化
      setTimeout(() => {
        if (!this.initialized) {
          this.initializeCollections()
          this.initialized = true
          resolve()
        }
      }, 5000)
    })

    return this.initPromise
  }

  /**
   * 初始化集合
   */
  private initializeCollections(): void {
    if (!this.db) return

    this.sessions =
      this.db.getCollection<SessionDocument>('sessions') ||
      this.db.addCollection<SessionDocument>('sessions', {
        indices: ['id', 'createdAt'],
        unique: ['id']
      })

    this.messages =
      this.db.getCollection<SessionMessage>('messages') ||
      this.db.addCollection<SessionMessage>('messages', {
        indices: ['id', 'sessionId', 'createdAt'],
        unique: ['id']
      })

    this.memories =
      this.db.getCollection<MemoryDocument>('memories') ||
      this.db.addCollection<MemoryDocument>('memories', {
        indices: ['id', 'sessionId', 'type', 'importance'],
        unique: ['id']
      })

    this.compressedSummaries =
      this.db.getCollection<CompressedSummaryDocument>('compressedSummaries') ||
      this.db.addCollection<CompressedSummaryDocument>('compressedSummaries', {
        indices: ['id', 'sessionId'],
        unique: ['id']
      })
  }

  // ==================== Session 操作 ====================

  /**
   * 创建会话
   */
  async createSession(params: CreateSessionParams): Promise<SessionDocument> {
    await this.ensureInitialized()

    const now = new Date().toISOString()
    const session: SessionDocument = {
      id: params.id || nanoid(),
      name: params.name,
      systemPrompt: params.systemPrompt,
      model: params.model,
      providerType: params.providerType,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata
    }

    this.sessions!.insert(session)
    return session
  }

  /**
   * 获取会话
   */
  async getSession(id: string): Promise<SessionDocument | null> {
    await this.ensureInitialized()
    return this.sessions!.findOne({ id }) || null
  }

  /**
   * 更新会话
   */
  async updateSession(id: string, params: UpdateSessionParams): Promise<SessionDocument | null> {
    await this.ensureInitialized()

    const session = this.sessions!.findOne({ id })
    if (!session) return null

    const updated = {
      ...session,
      ...params,
      updatedAt: new Date().toISOString()
    }

    this.sessions!.update(updated)
    return updated
  }

  /**
   * 删除会话（及其消息和记忆）
   */
  async deleteSession(id: string): Promise<void> {
    await this.ensureInitialized()

    // 删除会话
    this.sessions!.findAndRemove({ id })

    // 删除消息
    this.messages!.findAndRemove({ sessionId: id })

    // 删除记忆
    this.memories!.findAndRemove({ sessionId: id })

    // 删除压缩摘要
    this.compressedSummaries!.findAndRemove({ sessionId: id })
  }

  /**
   * 列出所有会话
   */
  async listSessions(limit = 100, offset = 0): Promise<SessionDocument[]> {
    await this.ensureInitialized()
    return this.sessions!.chain().simplesort('updatedAt', true).offset(offset).limit(limit).data()
  }

  // ==================== Message 操作 ====================

  /**
   * 添加消息
   */
  async addMessage(message: SessionMessage): Promise<SessionMessage> {
    await this.ensureInitialized()

    const msg: SessionMessage = {
      ...message,
      id: message.id || nanoid(),
      createdAt: message.createdAt || new Date().toISOString()
    }

    this.messages!.insert(msg)

    // 更新会话的 updatedAt
    await this.updateSession(message.sessionId, {})

    return msg
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string, limit?: number): Promise<SessionMessage[]> {
    await this.ensureInitialized()

    const query = this.messages!.chain().find({ sessionId }).simplesort('createdAt')

    if (limit) {
      return query.limit(limit).data()
    }

    return query.data()
  }

  /**
   * 清除会话消息
   */
  async clearSessionMessages(sessionId: string): Promise<void> {
    await this.ensureInitialized()
    this.messages!.findAndRemove({ sessionId })
  }

  // ==================== Memory 操作 ====================

  /**
   * 添加记忆
   */
  async addMemory(
    memory: Omit<MemoryDocument, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>
  ): Promise<MemoryDocument> {
    await this.ensureInitialized()

    const now = new Date().toISOString()
    const doc: MemoryDocument = {
      id: nanoid(),
      sessionId: memory.sessionId,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      embedding: memory.embedding,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0
    }

    this.memories!.insert(doc)
    return doc
  }

  /**
   * 获取相关记忆（关键词匹配）
   */
  async getRelevantMemories(sessionId: string, query: string, limit = 10): Promise<MemoryDocument[]> {
    await this.ensureInitialized()

    // 简单的关键词匹配
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2)

    if (keywords.length === 0) {
      return this.memories!.chain().find({ sessionId }).simplesort('importance', true).limit(limit).data()
    }

    // 搜索包含关键词的记忆
    const memories = this.memories!.chain()
      .find({ sessionId })
      .where((mem) => {
        const content = mem.content.toLowerCase()
        return keywords.some((k) => content.includes(k))
      })
      .simplesort('importance', true)
      .limit(limit)
      .data()

    // 更新访问计数
    for (const mem of memories) {
      this.memories!.update({
        ...mem,
        lastAccessedAt: new Date().toISOString(),
        accessCount: mem.accessCount + 1
      })
    }

    return memories
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string): Promise<void> {
    await this.ensureInitialized()
    this.memories!.findAndRemove({ id })
  }

  // ==================== Compressed Summary 操作 ====================

  /**
   * 添加压缩摘要
   */
  async addCompressedSummary(summary: CompressedSummaryDocument): Promise<void> {
    await this.ensureInitialized()
    this.compressedSummaries!.insert({
      ...summary,
      id: summary.id || nanoid(),
      createdAt: summary.createdAt || new Date().toISOString()
    })
  }

  /**
   * 获取会话的压缩摘要
   */
  async getSessionSummaries(sessionId: string): Promise<CompressedSummaryDocument[]> {
    await this.ensureInitialized()
    return this.compressedSummaries!.find({ sessionId })
  }

  // ==================== 生命周期 ====================

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * 保存数据库
   */
  async save(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      this.db.save((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      this.db.close((err) => {
        if (err) reject(err)
        else {
          this.db = null
          this.initialized = false
          resolve()
        }
      })
    })
  }
}
