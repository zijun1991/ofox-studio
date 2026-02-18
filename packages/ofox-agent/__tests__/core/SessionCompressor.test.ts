/**
 * SessionCompressor 测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CompressionConfig } from '../../src/core/SessionCompressor'
import { SessionCompressor } from '../../src/core/SessionCompressor'
import type { LlmProvider } from '../../src/provider/LlmProvider'
import type { SessionMessage } from '../../src/types/message'
import type { StreamChunk, UnifiedMessage } from '../../src/types/message'
import type { GenerateOptions, GenerateResult } from '../../src/types/provider'
import { createLongMessages } from '../mocks'

/**
 * 创建适用于 LlmProvider 类型的 Mock
 */
function createMockLlmProvider() {
  return {
    generate: vi
      .fn()
      .mockImplementation(async (_messages: UnifiedMessage[], _options?: GenerateOptions): Promise<GenerateResult> => {
        return {
          content: 'Mock response',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5 }
        }
      }),
    stream: vi.fn().mockImplementation(async function* (
      _messages: UnifiedMessage[],
      _options?: GenerateOptions
    ): AsyncIterable<StreamChunk> {
      yield { delta: 'Mock ', toolCalls: undefined, isComplete: false }
      yield { delta: 'response', toolCalls: undefined, isComplete: true }
    }),
    convertMessages: vi.fn().mockReturnValue([])
  } as unknown as LlmProvider
}

describe('SessionCompressor', () => {
  let compressor: SessionCompressor
  let mockProvider: LlmProvider

  const defaultConfig: CompressionConfig = {
    enabled: true,
    maxTokens: 1000, // 低阈值便于测试
    preserveRecentMessages: 4
  }

  beforeEach(() => {
    mockProvider = createMockLlmProvider()
    compressor = new SessionCompressor(mockProvider, defaultConfig)
  })

  describe('estimateTokens', () => {
    it('应正确估算文本消息的 token 数', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId: 'test',
          role: 'user',
          content: 'Hello world!', // 12 字符 ≈ 3 tokens
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]

      const tokens = compressor.estimateTokens(messages)

      expect(tokens).toBe(Math.ceil(12 / 4)) // = 3
    })

    it('应正确估算多部分内容的 token 数', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId: 'test',
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]

      const tokens = compressor.estimateTokens(messages)

      // JSON.stringify 后的长度 / 4
      expect(tokens).toBeGreaterThan(0)
    })

    it('应计算工具调用的 token', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId: 'test',
          role: 'assistant',
          content: '',
          createdAt: '2024-01-01T00:00:00Z',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'test', arguments: '{"arg": "value"}' }
            }
          ]
        }
      ]

      const tokens = compressor.estimateTokens(messages)

      expect(tokens).toBeGreaterThan(0)
    })

    it('空消息列表应返回 0', () => {
      const tokens = compressor.estimateTokens([])
      expect(tokens).toBe(0)
    })

    it('应正确估算多条消息', () => {
      const messages = createLongMessages(10)
      const tokens = compressor.estimateTokens(messages)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe('needsCompression', () => {
    it('未超过阈值时不应触发压缩', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId: 'test',
          role: 'user',
          content: 'Hello', // 5 字符 ≈ 2 tokens
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]

      expect(compressor.needsCompression(messages)).toBe(false)
    })

    it('超过阈值时应触发压缩', () => {
      // 创建足够长的消息以超过 1000 tokens
      const messages = createLongMessages(100)
      expect(compressor.needsCompression(messages)).toBe(true)
    })

    it('禁用时应始终返回 false', () => {
      compressor.updateConfig({ enabled: false })

      const messages = createLongMessages(100)
      expect(compressor.needsCompression(messages)).toBe(false)
    })
  })

  describe('splitMessages', () => {
    it('应保留最近的 N 条消息', async () => {
      const messages = createLongMessages(10)
      compressor = new SessionCompressor(mockProvider, {
        ...defaultConfig,
        preserveRecentMessages: 4
      })

      // 通过 compress 间接测试 splitMessages
      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: JSON.stringify({ summary: 'Test summary' }),
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      // 保留 4 条 + 1 条摘要消息 = 5
      expect(result.retainedMessages.length).toBe(5)
    })

    it('不应切断工具调用链', async () => {
      // 创建消息，其中包含工具调用
      const messages: SessionMessage[] = [
        { id: '1', sessionId: 'test', role: 'user', content: 'A'.repeat(100), createdAt: '2024-01-01T00:00:00Z' },
        { id: '2', sessionId: 'test', role: 'assistant', content: 'B'.repeat(100), createdAt: '2024-01-01T00:00:01Z' },
        { id: '3', sessionId: 'test', role: 'user', content: 'C'.repeat(100), createdAt: '2024-01-01T00:00:02Z' },
        {
          id: '4',
          sessionId: 'test',
          role: 'assistant',
          content: '',
          createdAt: '2024-01-01T00:00:03Z',
          tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'test', arguments: '{}' } }]
        },
        {
          id: '5',
          sessionId: 'test',
          role: 'tool',
          content: 'tool result',
          createdAt: '2024-01-01T00:00:04Z',
          tool_call_id: 'tc1'
        }
      ]

      // 创建新的 mock provider 用于这个测试
      const localMockProvider = createMockLlmProvider()
      vi.mocked(localMockProvider.generate).mockResolvedValue({
        content: JSON.stringify({ summary: 'Test summary' }),
        finishReason: 'stop'
      })
      const localCompressor = new SessionCompressor(localMockProvider, defaultConfig)

      const result = await localCompressor.compress('test-session', messages)

      // 验证工具调用和响应都在保留的消息中
      const toolCallMsg = result.retainedMessages.find((m) => m.id === '4')
      const toolResultMsg = result.retainedMessages.find((m) => m.id === '5')
      expect(toolCallMsg).toBeDefined()
      expect(toolResultMsg).toBeDefined()
    })
  })

  describe('compress', () => {
    it('无消息可压缩时返回 null summary', async () => {
      const messages: SessionMessage[] = [
        { id: '1', sessionId: 'test', role: 'user', content: 'Hi', createdAt: '2024-01-01T00:00:00Z' }
      ]

      // preserveRecentMessages = 4，消息少于 4 条
      const result = await compressor.compress('test-session', messages)

      expect(result.summary).toBeNull()
      expect(result.retainedMessages).toEqual(messages)
    })

    it('应调用 LLM 生成摘要', async () => {
      const messages = createLongMessages(10)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: JSON.stringify({
          summary: 'Test summary',
          topics: ['topic1'],
          keyDecisions: ['decision1'],
          pendingTasks: []
        }),
        finishReason: 'stop'
      })

      await compressor.compress('test-session', messages)

      expect(mockProvider.generate).toHaveBeenCalled()
    })

    it('应正确解析 JSON 格式的摘要', async () => {
      const messages = createLongMessages(10)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: JSON.stringify({
          summary: 'Valid JSON summary',
          topics: ['TypeScript'],
          keyDecisions: ['Use TypeScript'],
          pendingTasks: ['Write tests']
        }),
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      expect(result.summary.summary).toBe('Valid JSON summary')
      expect(result.summary.topics).toContain('TypeScript')
      expect(result.summary.keyDecisions).toContain('Use TypeScript')
      expect(result.summary.pendingTasks).toContain('Write tests')
    })

    it('应正确解析 markdown 代码块包装的 JSON', async () => {
      const messages = createLongMessages(10)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: '```json\n{"summary": "Markdown wrapped summary"}\n```',
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      expect(result.summary.summary).toBe('Markdown wrapped summary')
    })

    it('解析失败时应使用原始内容作为摘要', async () => {
      const messages = createLongMessages(10)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: 'This is not valid JSON but should be used as summary.',
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      expect(result.summary.summary).toBe('This is not valid JSON but should be used as summary.')
    })

    it('应包含原始消息 ID 列表', async () => {
      const messages = createLongMessages(10)
      const originalIds = messages.map((m) => m.id)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: JSON.stringify({ summary: 'Test' }),
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      expect(result.summary.originalMessageIds).toEqual(expect.arrayContaining(originalIds.slice(0, -4)))
    })

    it('应包含 token 数统计', async () => {
      const messages = createLongMessages(10)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: JSON.stringify({ summary: 'Test summary' }),
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      expect(result.summary.originalTokenCount).toBeGreaterThan(0)
      expect(result.summary.compressedTokenCount).toBeGreaterThan(0)
    })

    it('应在返回的消息中包含摘要消息', async () => {
      const messages = createLongMessages(10)

      vi.mocked(mockProvider.generate).mockResolvedValue({
        content: JSON.stringify({ summary: 'Test summary' }),
        finishReason: 'stop'
      })

      const result = await compressor.compress('test-session', messages)

      // 第一条应该是摘要消息
      expect(result.retainedMessages[0].role).toBe('system')
      expect(result.retainedMessages[0].content).toContain('[历史对话摘要]')
      expect(result.retainedMessages[0].content).toContain('Test summary')
    })
  })

  describe('buildCompressionPrompt', () => {
    it('应包含对话历史', async () => {
      let capturedPrompt = ''
      vi.mocked(mockProvider.generate).mockImplementation(async (msgs) => {
        capturedPrompt = msgs[1].content as string
        return { content: JSON.stringify({ summary: 'Test' }), finishReason: 'stop' }
      })

      // 创建足够多的消息触发压缩
      const longMessages = createLongMessages(10)
      await compressor.compress('test-session', longMessages)

      // 验证 prompt 包含必要元素
      expect(capturedPrompt).toContain('压缩摘要')
      expect(capturedPrompt).toContain('JSON 格式')
    })
  })

  describe('config management', () => {
    it('应正确更新配置', () => {
      compressor.updateConfig({ maxTokens: 5000 })

      const config = compressor.getConfig()
      expect(config.maxTokens).toBe(5000)
      expect(config.preserveRecentMessages).toBe(4) // 保持原值
    })

    it('getConfig 应返回配置副本', () => {
      const config1 = compressor.getConfig()
      const config2 = compressor.getConfig()

      expect(config1).not.toBe(config2) // 不同的对象引用
      expect(config1).toEqual(config2) // 但内容相同
    })
  })

  describe('edge cases', () => {
    it('消息数量少于 preserveRecentMessages 时不应压缩', async () => {
      const messages: SessionMessage[] = [
        { id: '1', sessionId: 'test', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
      ]

      const result = await compressor.compress('test-session', messages)

      expect(mockProvider.generate).not.toHaveBeenCalled()
      expect(result.summary).toBeNull()
    })

    it('应处理空工具调用数组', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId: 'test',
          role: 'assistant',
          content: 'Response',
          createdAt: '2024-01-01T00:00:00Z',
          tool_calls: []
        }
      ]

      const tokens = compressor.estimateTokens(messages)
      expect(tokens).toBeGreaterThan(0)
    })

    it('应正确处理包含 JSON 内容部分的消息', () => {
      const messages: SessionMessage[] = [
        {
          id: '1',
          sessionId: 'test',
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]

      const tokens = compressor.estimateTokens(messages)
      expect(tokens).toBeGreaterThan(0)
    })
  })
})
