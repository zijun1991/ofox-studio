/**
 * MemoryStore 测试
 */

import fs from 'fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LokiStorage, setCustomDataPath } from '../../src/storage/LokiStorage'
import { MemoryStore } from '../../src/storage/MemoryStore'
import type { SessionMessage } from '../../src/types/message'

describe('MemoryStore', () => {
  let storage: LokiStorage
  let memoryStore: MemoryStore
  let tempPath: string
  const sessionId = 'memory-store-test'

  beforeEach(async () => {
    tempPath = `/tmp/test-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setCustomDataPath(tempPath)
    storage = new LokiStorage('test.db')
    await storage.initialize()
    await storage.createSession({
      id: sessionId,
      model: 'gpt-4',
      providerType: 'openai'
    })
    memoryStore = new MemoryStore(storage)
  })

  afterEach(async () => {
    await storage.close()
    setCustomDataPath(null)
    try {
      await fs.rm(tempPath, { recursive: true, force: true })
    } catch {
      // 忽略清理错误
    }
  })

  describe('提取提示词生成', () => {
    it('应正确生成记忆提取提示词', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId,
          role: 'user',
          content: 'I prefer dark mode',
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          sessionId,
          role: 'assistant',
          content: 'Got it, I will use dark mode.',
          createdAt: '2024-01-01T00:00:01Z'
        }
      ]

      const prompt = memoryStore.getExtractionPrompt(messages)

      expect(prompt).toContain('记忆提取专家')
      expect(prompt).toContain('I prefer dark mode')
      expect(prompt).toContain('[USER]')
      expect(prompt).toContain('[ASSISTANT]')
      expect(prompt).toContain('fact')
      expect(prompt).toContain('preference')
      expect(prompt).toContain('context')
    })

    it('应正确格式化对话内容', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId,
          role: 'user',
          content: 'Hello',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]

      const prompt = memoryStore.getExtractionPrompt(messages)

      expect(prompt).toContain('[USER]: Hello')
    })

    it('应正确处理多部分内容', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId,
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]

      const prompt = memoryStore.getExtractionPrompt(messages)

      expect(prompt).toContain('Hello')
      expect(prompt).toContain('World')
    })
  })

  describe('解析和存储', () => {
    it('应正确解析 JSON 格式的提取结果', async () => {
      const extractionResult = JSON.stringify({
        memories: [
          { type: 'fact', content: 'User name is John', importance: 0.9 },
          { type: 'preference', content: 'User likes TypeScript', importance: 0.7 }
        ]
      })

      const stored = await memoryStore.parseAndStoreExtraction(sessionId, extractionResult)

      expect(stored).toHaveLength(2)
      expect(stored[0].type).toBe('fact')
      expect(stored[0].content).toBe('User name is John')
      expect(stored[1].type).toBe('preference')
    })

    it('应正确解析 markdown 代码块包装的结果', async () => {
      const extractionResult = `
\`\`\`json
{
  "memories": [
    { "type": "context", "content": "Working on project X", "importance": 0.6 }
  ]
}
\`\`\`
      `

      const stored = await memoryStore.parseAndStoreExtraction(sessionId, extractionResult)

      expect(stored).toHaveLength(1)
      expect(stored[0].type).toBe('context')
      expect(stored[0].content).toBe('Working on project X')
    })

    it('应过滤低重要性的记忆', async () => {
      const extractionResult = JSON.stringify({
        memories: [
          { type: 'fact', content: 'Important fact', importance: 0.8 },
          { type: 'fact', content: 'Low importance fact', importance: 0.1 }
        ]
      })

      const stored = await memoryStore.parseAndStoreExtraction(sessionId, extractionResult)

      expect(stored).toHaveLength(1)
      expect(stored[0].content).toBe('Important fact')
    })

    it('应拒绝无效类型的记忆', async () => {
      const extractionResult = JSON.stringify({
        memories: [
          { type: 'invalid_type', content: 'Invalid', importance: 0.9 },
          { type: 'fact', content: 'Valid fact', importance: 0.9 }
        ]
      })

      const stored = await memoryStore.parseAndStoreExtraction(sessionId, extractionResult)

      expect(stored).toHaveLength(1)
      expect(stored[0].type).toBe('fact')
    })

    it('解析无效 JSON 应返回空数组', async () => {
      const stored = await memoryStore.parseAndStoreExtraction(sessionId, 'not valid json')

      expect(stored).toHaveLength(0)
    })

    it('memories 不是数组时应返回空数组', async () => {
      const stored = await memoryStore.parseAndStoreExtraction(sessionId, JSON.stringify({ memories: 'not an array' }))

      expect(stored).toHaveLength(0)
    })
  })

  describe('记忆检索', () => {
    beforeEach(async () => {
      await memoryStore.addMemory(sessionId, 'fact', 'User name is Alice', 0.9)
      await memoryStore.addMemory(sessionId, 'preference', 'User prefers dark mode', 0.8)
      await memoryStore.addMemory(sessionId, 'context', 'Working on TypeScript project', 0.7)
    })

    it('应返回格式化的记忆上下文', async () => {
      const context = await memoryStore.getRelevantMemories(sessionId, 'Alice')

      expect(context).toContain('[记忆上下文]')
      expect(context).toContain('📌')
      expect(context).toContain('[fact]')
      expect(context).toContain('Alice')
    })

    it('应正确使用类型 emoji', async () => {
      const context = await memoryStore.getRelevantMemories(sessionId, 'prefers')

      expect(context).toContain('❤️')
      expect(context).toContain('[preference]')
    })

    it('空记忆时应返回空字符串', async () => {
      // 创建新的会话没有记忆
      await storage.createSession({ id: 'empty-session', model: 'gpt-4', providerType: 'openai' })
      const emptyStore = new MemoryStore(storage)

      const context = await emptyStore.getRelevantMemories('empty-session', 'anything')

      expect(context).toBe('')
    })
  })

  describe('记忆管理', () => {
    it('应正确手动添加记忆', async () => {
      const memory = await memoryStore.addMemory(sessionId, 'fact', 'User birthday is January 1st', 0.8)

      expect(memory.id).toBeDefined()
      expect(memory.type).toBe('fact')
      expect(memory.content).toBe('User birthday is January 1st')
      expect(memory.importance).toBe(0.8)
    })

    it('应正确清除会话记忆', async () => {
      await memoryStore.addMemory(sessionId, 'fact', 'Memory 1', 0.5)
      await memoryStore.addMemory(sessionId, 'fact', 'Memory 2', 0.5)

      await memoryStore.clearSessionMemories(sessionId)

      const context = await memoryStore.getRelevantMemories(sessionId, '')
      expect(context).toBe('')
    })

    it('应正确执行记忆衰减', async () => {
      // 添加一个低重要性记忆（会保留，因为是刚创建的）
      await memoryStore.addMemory(sessionId, 'context', 'Temporary context', 0.4)

      // 添加一个高重要性记忆
      await memoryStore.addMemory(sessionId, 'fact', 'Important fact', 0.9)

      // 衰减（刚创建的记忆不会被删除）
      const deletedCount = await memoryStore.decayMemories(sessionId)

      // 因为都是刚创建的，所以不应该有删除
      expect(deletedCount).toBe(0)
    })
  })

  describe('记忆数量限制', () => {
    it('应正确执行记忆数量限制', async () => {
      // 使用低最大记忆数配置
      const limitedStore = new MemoryStore(storage, { maxMemories: 2 })

      // 添加超过限制的记忆
      await limitedStore.parseAndStoreExtraction(
        sessionId,
        JSON.stringify({
          memories: [
            { type: 'fact', content: 'Memory 1', importance: 0.5 },
            { type: 'fact', content: 'Memory 2', importance: 0.6 },
            { type: 'fact', content: 'Memory 3', importance: 0.7 },
            { type: 'fact', content: 'Memory 4', importance: 0.8 }
          ]
        })
      )

      // 验证记忆被限制
      const memories = await storage.getRelevantMemories(sessionId, '', 100)
      expect(memories.length).toBeLessThanOrEqual(2)
    })
  })

  describe('配置', () => {
    it('应使用默认配置', () => {
      const defaultStore = new MemoryStore(storage)

      // 通过行为验证配置
      expect(defaultStore).toBeDefined()
    })

    it('应正确使用自定义配置', async () => {
      const customStore = new MemoryStore(storage, {
        maxMemories: 5,
        importanceThreshold: 0.8,
        retrievalLimit: 3,
        searchStrategy: 'keyword'
      })

      // 低重要性的记忆会被过滤
      await customStore.parseAndStoreExtraction(
        sessionId,
        JSON.stringify({
          memories: [
            { type: 'fact', content: 'High importance', importance: 0.9 },
            { type: 'fact', content: 'Low importance', importance: 0.5 }
          ]
        })
      )

      const memories = await storage.getRelevantMemories(sessionId, '', 100)
      expect(memories.find((m) => m.content === 'Low importance')).toBeUndefined()
    })
  })
})
