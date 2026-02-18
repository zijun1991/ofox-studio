/**
 * LokiStorage 测试
 */

import fs from 'fs/promises'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LokiStorage, setCustomDataPath } from '../../src/storage/LokiStorage'
import type { SessionMessage } from '../../src/types/message'

describe('LokiStorage', () => {
  let storage: LokiStorage
  let tempPath: string

  beforeEach(async () => {
    // 使用唯一临时目录
    tempPath = `/tmp/test-loki-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setCustomDataPath(tempPath)
    storage = new LokiStorage('test.db')
    await storage.initialize()
  })

  afterEach(async () => {
    await storage.close()
    setCustomDataPath(null)
    // 清理临时目录
    try {
      await fs.rm(tempPath, { recursive: true, force: true })
    } catch {
      // 忽略清理错误
    }
  })

  describe('Session 管理', () => {
    it('应正确创建 Session', async () => {
      const session = await storage.createSession({
        model: 'gpt-4',
        providerType: 'openai'
      })

      expect(session.id).toBeDefined()
      expect(session.model).toBe('gpt-4')
      expect(session.providerType).toBe('openai')
      expect(session.createdAt).toBeDefined()
      expect(session.updatedAt).toBeDefined()
    })

    it('应正确创建带自定义 ID 的 Session', async () => {
      const session = await storage.createSession({
        id: 'custom-id-123',
        model: 'claude-3',
        providerType: 'anthropic'
      })

      expect(session.id).toBe('custom-id-123')
    })

    it('应正确获取 Session', async () => {
      const created = await storage.createSession({
        id: 'test-session',
        model: 'gpt-4',
        providerType: 'openai'
      })

      const session = await storage.getSession('test-session')

      expect(session).not.toBeNull()
      expect(session?.id).toBe('test-session')
      expect(session?.model).toBe('gpt-4')
    })

    it('不存在的 Session 应返回 null', async () => {
      const session = await storage.getSession('non-existent')
      expect(session).toBeNull()
    })

    it('应正确更新 Session', async () => {
      await storage.createSession({
        id: 'update-test',
        model: 'gpt-3.5',
        providerType: 'openai'
      })

      const updated = await storage.updateSession('update-test', {
        model: 'gpt-4',
        name: 'Updated Session'
      })

      expect(updated).not.toBeNull()
      expect(updated?.model).toBe('gpt-4')
      expect(updated?.name).toBe('Updated Session')
    })

    it('更新不存在的 Session 应返回 null', async () => {
      const result = await storage.updateSession('non-existent', { model: 'gpt-4' })
      expect(result).toBeNull()
    })

    it('应正确删除 Session', async () => {
      await storage.createSession({
        id: 'delete-test',
        model: 'gpt-4',
        providerType: 'openai'
      })

      await storage.deleteSession('delete-test')
      const session = await storage.getSession('delete-test')

      expect(session).toBeNull()
    })

    it('删除 Session 时应同时删除相关消息', async () => {
      await storage.createSession({
        id: 'delete-cascade',
        model: 'gpt-4',
        providerType: 'openai'
      })

      await storage.addMessage({
        id: 'msg-1',
        sessionId: 'delete-cascade',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString()
      })

      await storage.deleteSession('delete-cascade')
      const messages = await storage.getSessionMessages('delete-cascade')

      expect(messages).toHaveLength(0)
    })

    it('应正确列出所有 Sessions', async () => {
      await storage.createSession({ id: 'list-1', model: 'gpt-4', providerType: 'openai' })
      await storage.createSession({ id: 'list-2', model: 'claude-3', providerType: 'anthropic' })

      const sessions = await storage.listSessions()

      expect(sessions.length).toBeGreaterThanOrEqual(2)
      expect(sessions.map((s) => s.id)).toContain('list-1')
      expect(sessions.map((s) => s.id)).toContain('list-2')
    })

    it('应正确限制 Sessions 列表数量', async () => {
      await storage.createSession({ id: 'limit-1', model: 'gpt-4', providerType: 'openai' })
      await storage.createSession({ id: 'limit-2', model: 'gpt-4', providerType: 'openai' })
      await storage.createSession({ id: 'limit-3', model: 'gpt-4', providerType: 'openai' })

      const sessions = await storage.listSessions(2)

      expect(sessions).toHaveLength(2)
    })
  })

  describe('消息存储', () => {
    const sessionId = 'msg-test-session'

    beforeEach(async () => {
      await storage.createSession({
        id: sessionId,
        model: 'gpt-4',
        providerType: 'openai'
      })
    })

    it('应正确添加消息', async () => {
      const message = await storage.addMessage({
        sessionId,
        role: 'user',
        content: 'Hello, world!',
        createdAt: new Date().toISOString()
      })

      expect(message.id).toBeDefined()
      expect(message.sessionId).toBe(sessionId)
      expect(message.content).toBe('Hello, world!')
    })

    it('应正确获取会话消息列表', async () => {
      await storage.addMessage({
        id: 'msg-1',
        sessionId,
        role: 'user',
        content: 'Message 1',
        createdAt: '2024-01-01T00:00:00Z'
      })
      await storage.addMessage({
        id: 'msg-2',
        sessionId,
        role: 'assistant',
        content: 'Message 2',
        createdAt: '2024-01-01T00:00:01Z'
      })

      const messages = await storage.getSessionMessages(sessionId)

      expect(messages).toHaveLength(2)
      expect(messages[0].content).toBe('Message 1')
      expect(messages[1].content).toBe('Message 2')
    })

    it('应正确限制消息数量', async () => {
      await storage.addMessage({
        id: 'limit-msg-1',
        sessionId,
        role: 'user',
        content: 'Message 1',
        createdAt: '2024-01-01T00:00:00Z'
      })
      await storage.addMessage({
        id: 'limit-msg-2',
        sessionId,
        role: 'assistant',
        content: 'Message 2',
        createdAt: '2024-01-01T00:00:01Z'
      })
      await storage.addMessage({
        id: 'limit-msg-3',
        sessionId,
        role: 'user',
        content: 'Message 3',
        createdAt: '2024-01-01T00:00:02Z'
      })

      const messages = await storage.getSessionMessages(sessionId, 2)

      expect(messages).toHaveLength(2)
    })

    it('应正确清除会话消息', async () => {
      await storage.addMessage({
        sessionId,
        role: 'user',
        content: 'To be cleared',
        createdAt: new Date().toISOString()
      })

      await storage.clearSessionMessages(sessionId)
      const messages = await storage.getSessionMessages(sessionId)

      expect(messages).toHaveLength(0)
    })

    it('应正确存储带工具调用的消息', async () => {
      const message: SessionMessage = {
        id: 'tool-msg',
        sessionId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"location": "Beijing"}' }
          }
        ]
      }

      const saved = await storage.addMessage(message)
      const messages = await storage.getSessionMessages(sessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].tool_calls).toBeDefined()
      expect(messages[0].tool_calls).toHaveLength(1)
      expect(messages[0].tool_calls![0].function.name).toBe('get_weather')
    })

    it('应正确存储工具响应消息', async () => {
      await storage.addMessage({
        id: 'tool-response',
        sessionId,
        role: 'tool',
        content: '{"temperature": 25}',
        createdAt: new Date().toISOString(),
        tool_call_id: 'call_123'
      })

      const messages = await storage.getSessionMessages(sessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('tool')
      expect(messages[0].tool_call_id).toBe('call_123')
    })
  })

  describe('压缩摘要存储', () => {
    const sessionId = 'summary-test-session'

    beforeEach(async () => {
      await storage.createSession({
        id: sessionId,
        model: 'gpt-4',
        providerType: 'openai'
      })
    })

    it('应正确添加压缩摘要', async () => {
      await storage.addCompressedSummary({
        id: 'summary-1',
        sessionId,
        summary: 'This is a test summary',
        originalMessageIds: ['msg-1', 'msg-2'],
        originalTokenCount: 1000,
        compressedTokenCount: 100,
        createdAt: new Date().toISOString()
      })

      const summaries = await storage.getSessionSummaries(sessionId)

      expect(summaries).toHaveLength(1)
      expect(summaries[0].summary).toBe('This is a test summary')
      expect(summaries[0].originalTokenCount).toBe(1000)
    })

    it('应正确获取多个压缩摘要', async () => {
      await storage.addCompressedSummary({
        id: 'summary-a',
        sessionId,
        summary: 'Summary A',
        originalMessageIds: [],
        originalTokenCount: 500,
        compressedTokenCount: 50,
        createdAt: '2024-01-01T00:00:00Z'
      })
      await storage.addCompressedSummary({
        id: 'summary-b',
        sessionId,
        summary: 'Summary B',
        originalMessageIds: [],
        originalTokenCount: 600,
        compressedTokenCount: 60,
        createdAt: '2024-01-01T00:01:00Z'
      })

      const summaries = await storage.getSessionSummaries(sessionId)

      expect(summaries).toHaveLength(2)
    })

    it('删除 Session 时应同时删除压缩摘要', async () => {
      await storage.addCompressedSummary({
        id: 'summary-delete',
        sessionId,
        summary: 'To be deleted',
        originalMessageIds: [],
        originalTokenCount: 100,
        compressedTokenCount: 10,
        createdAt: new Date().toISOString()
      })

      await storage.deleteSession(sessionId)
      const summaries = await storage.getSessionSummaries(sessionId)

      expect(summaries).toHaveLength(0)
    })
  })

  describe('Memory 操作', () => {
    const sessionId = 'memory-test-session'

    beforeEach(async () => {
      await storage.createSession({
        id: sessionId,
        model: 'gpt-4',
        providerType: 'openai'
      })
    })

    it('应正确添加记忆', async () => {
      const memory = await storage.addMemory({
        sessionId,
        type: 'fact',
        content: 'User prefers dark mode',
        importance: 0.8
      })

      expect(memory.id).toBeDefined()
      expect(memory.type).toBe('fact')
      expect(memory.content).toBe('User prefers dark mode')
      expect(memory.importance).toBe(0.8)
      expect(memory.accessCount).toBe(0)
    })

    it('应正确获取相关记忆', async () => {
      await storage.addMemory({
        sessionId,
        type: 'fact',
        content: 'User likes TypeScript programming',
        importance: 0.9
      })
      await storage.addMemory({
        sessionId,
        type: 'preference',
        content: 'User prefers minimal design',
        importance: 0.7
      })

      const memories = await storage.getRelevantMemories(sessionId, 'TypeScript')

      expect(memories.length).toBeGreaterThan(0)
      expect(memories[0].content).toContain('TypeScript')
    })

    it('应正确删除记忆', async () => {
      const memory = await storage.addMemory({
        sessionId,
        type: 'context',
        content: 'Temporary context',
        importance: 0.5
      })

      await storage.deleteMemory(memory.id)
      const memories = await storage.getRelevantMemories(sessionId, '', 100)

      expect(memories.find((m) => m.id === memory.id)).toBeUndefined()
    })
  })

  describe('生命周期', () => {
    it('应正确保存数据库', async () => {
      await storage.createSession({
        id: 'save-test',
        model: 'gpt-4',
        providerType: 'openai'
      })

      await storage.save()

      // 验证文件存在
      const dbPath = path.join(tempPath, 'test.db')
      const exists = await fs
        .access(dbPath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)
    })

    it('应正确关闭数据库', async () => {
      await storage.close()

      // 关闭后应该能够重新初始化
      storage = new LokiStorage('test.db')
      await storage.initialize()

      expect(true).toBe(true)
    })
  })
})
