/**
 * Mock Provider for testing
 */

import { vi } from 'vitest'

import type { StreamChunk, UnifiedMessage } from '../../src/types/message'
import type { GenerateOptions, GenerateResult, ILlmProvider, LlmProviderConfig } from '../../src/types/provider'
import type { ToolDefinition } from '../../src/types/tool'

/**
 * 创建 Mock Provider 配置
 */
export function createMockProviderConfig(overrides?: Partial<LlmProviderConfig>): LlmProviderConfig {
  return {
    type: 'openai',
    apiKey: 'test-api-key',
    model: 'gpt-4',
    ...overrides
  }
}

/**
 * 创建 Mock Provider (实现 ILlmProvider 接口)
 */
export function createMockProvider(_configOverrides?: Partial<LlmProviderConfig>): ILlmProvider {
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
      yield { delta: 'response', toolCalls: undefined, isComplete: false }
      yield { delta: '', toolCalls: undefined, isComplete: true }
    }),

    convertMessages: vi.fn().mockReturnValue([]),

    convertTools: vi.fn().mockImplementation((tools: ToolDefinition[]) => tools)
  }
}

/**
 * 创建带工具调用的 Mock Provider
 */
export function createMockProviderWithToolCalls(_configOverrides?: Partial<LlmProviderConfig>): ILlmProvider {
  return {
    generate: vi.fn().mockImplementation(async (): Promise<GenerateResult> => {
      return {
        content: '',
        finishReason: 'tool_use',
        toolCalls: [
          {
            id: 'call_123',
            name: 'get_weather',
            arguments: { location: 'Beijing' }
          }
        ],
        usage: { inputTokens: 15, outputTokens: 10 }
      }
    }),

    stream: vi.fn().mockImplementation(async function* (): AsyncIterable<StreamChunk> {
      yield {
        delta: '',
        toolCalls: [{ id: 'call_123', name: 'get_weather', delta: '{"location": "Beijing"}' }],
        isComplete: false
      }
      yield { delta: '', toolCalls: undefined, isComplete: true }
    }),

    convertMessages: vi.fn().mockReturnValue([]),
    convertTools: vi.fn().mockImplementation((tools: ToolDefinition[]) => tools)
  }
}

/**
 * 创建会抛出错误的 Mock Provider
 */
export function createMockProviderWithError(error: Error, _configOverrides?: Partial<LlmProviderConfig>): ILlmProvider {
  return {
    generate: vi.fn().mockRejectedValue(error),
    stream: vi.fn().mockImplementation(async function* (): AsyncIterable<StreamChunk> {
      throw error
    }),
    convertMessages: vi.fn().mockReturnValue([]),
    convertTools: vi.fn().mockImplementation((tools: ToolDefinition[]) => tools)
  }
}

/**
 * 创建返回压缩摘要的 Mock Provider
 */
export function createMockProviderForCompression(): ILlmProvider {
  return {
    generate: vi.fn().mockImplementation(async (): Promise<GenerateResult> => {
      return {
        content: JSON.stringify({
          summary: '用户询问了 TypeScript 的相关内容，助手解释了 TypeScript 是 JavaScript 的类型超集。',
          topics: ['TypeScript', 'JavaScript'],
          keyDecisions: ['决定使用 TypeScript 进行开发'],
          pendingTasks: []
        }),
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 }
      }
    }),

    stream: vi.fn().mockImplementation(async function* (): AsyncIterable<StreamChunk> {
      const content = JSON.stringify({
        summary: '用户询问了 TypeScript 的相关内容',
        topics: ['TypeScript'],
        keyDecisions: [],
        pendingTasks: []
      })
      yield { delta: content, toolCalls: undefined, isComplete: false }
      yield { delta: '', toolCalls: undefined, isComplete: true }
    }),

    convertMessages: vi.fn().mockReturnValue([]),
    convertTools: vi.fn().mockImplementation((tools: ToolDefinition[]) => tools)
  }
}
