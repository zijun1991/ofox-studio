/**
 * 消息转换器测试
 */

import { describe, expect, it } from 'vitest'

import { AnthropicMessageConverter } from '../../src/messages/converters/anthropic'
import { GeminiMessageConverter } from '../../src/messages/converters/gemini'
import { OpenAIMessageConverter } from '../../src/messages/converters/openai'
import type { UnifiedMessage } from '../../src/types/message'

describe('Message Converters', () => {
  describe('OpenAIMessageConverter', () => {
    const converter = new OpenAIMessageConverter()

    describe('toSdk', () => {
      it('应正确转换简单文本消息', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
        expect(result[0].content).toBe('Hello')
      })

      it('应正确转换系统消息', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'system', content: 'You are a helpful assistant.', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('system')
        expect(result[0].content).toBe('You are a helpful assistant.')
      })

      it('应正确转换带工具调用的助手消息', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: '',
            createdAt: '2024-01-01T00:00:00Z',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"location": "Beijing"}' }
              }
            ]
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('assistant')
        expect(result[0].tool_calls).toBeDefined()
        expect(result[0].tool_calls).toHaveLength(1)
        expect(result[0].tool_calls![0].function.name).toBe('get_weather')
      })

      it('应正确转换工具响应消息', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'tool',
            content: '{"temperature": "25°C"}',
            createdAt: '2024-01-01T00:00:00Z',
            tool_call_id: 'call_123'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('tool')
        expect(result[0].tool_call_id).toBe('call_123')
        expect(result[0].content).toBe('{"temperature": "25°C"}')
      })

      it('应正确转换多部分内容消息（文本+图片）', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
            ],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
        expect(Array.isArray(result[0].content)).toBe(true)
        const content = result[0].content as Array<{ type: string }>
        expect(content[0].type).toBe('text')
        expect(content[1].type).toBe('image_url')
      })

      it('应正确处理 image 类型的内容', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'user',
            content: [{ type: 'image', image: 'base64data', mimeType: 'image/png' }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const content = result[0].content as Array<{ type: string; image_url?: { url: string } }>
        expect(content[0].type).toBe('image_url')
        expect(content[0].image_url?.url).toContain('data:image/png;base64,')
      })

      it('应正确处理 thinking 内容', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Let me think...' },
              { type: 'text', text: 'The answer is 42.' }
            ],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const content = result[0].content as Array<{ type: string; text?: string }>
        expect(content[0].type).toBe('text')
        expect(content[0].text).toContain('[Thinking]')
      })
    })

    describe('fromSdk', () => {
      it('应正确从 OpenAI 格式转换为统一消息', () => {
        const sdkMsg = {
          role: 'user' as const,
          content: 'Hello'
        }

        const result = converter.fromSdk(sdkMsg, 'test-id')

        expect(result.id).toBe('test-id')
        expect(result.role).toBe('user')
        expect(result.content).toBe('Hello')
      })

      it('应正确处理 null 内容', () => {
        const sdkMsg = {
          role: 'assistant' as const,
          content: null
        }

        const result = converter.fromSdk(sdkMsg, 'test-id')

        expect(result.content).toBe('')
      })

      it('应正确处理工具调用', () => {
        const sdkMsg = {
          role: 'assistant' as const,
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function' as const,
              function: { name: 'get_weather', arguments: '{"location": "Beijing"}' }
            }
          ]
        }

        const result = converter.fromSdk(sdkMsg, 'test-id')

        expect(result.tool_calls).toBeDefined()
        expect(result.tool_calls).toHaveLength(1)
        expect(result.tool_calls![0].function.name).toBe('get_weather')
      })
    })
  })

  describe('AnthropicMessageConverter', () => {
    const converter = new AnthropicMessageConverter()

    describe('toSdk', () => {
      it('应正确转换简单文本消息', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
        expect(result[0].content).toBe('Hello')
      })

      it('应跳过系统消息（Anthropic 使用单独的 system 参数）', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'system', content: 'System prompt', createdAt: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:01Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
      })

      it('应正确转换助手消息', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('assistant')
        const content = result[0].content as Array<{ type: string; text: string }>
        expect(content[0].type).toBe('text')
        expect(content[0].text).toBe('Hi there!')
      })

      it('应正确转换工具响应消息（作为 user 角色）', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'tool',
            content: '{"result": "success"}',
            createdAt: '2024-01-01T00:00:00Z',
            tool_call_id: 'toolu_123'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
        const content = result[0].content as Array<{ type: string; tool_use_id: string }>
        expect(content[0].type).toBe('tool_result')
        expect(content[0].tool_use_id).toBe('toolu_123')
      })

      it('应正确转换带工具调用的助手消息', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: '',
            createdAt: '2024-01-01T00:00:00Z',
            tool_calls: [
              {
                id: 'toolu_123',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"location": "Beijing"}' }
              }
            ]
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('assistant')
        const content = result[0].content as Array<{ type: string; name: string }>
        expect(content.some((c) => c.type === 'tool_use' && c.name === 'get_weather')).toBe(true)
      })

      it('应正确转换图片内容（image 类型）', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'user',
            content: [{ type: 'image', image: 'base64imagedata', mimeType: 'image/png' }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const content = result[0].content as Array<{ type: string; source?: { type: string } }>
        expect(content[0].type).toBe('image')
        expect(content[0].source?.type).toBe('base64')
      })

      it('应正确处理 image_url 类型的 data URL', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const content = result[0].content as Array<{ type: string }>
        expect(content[0].type).toBe('image')
      })

      it('应正确处理 thinking 内容', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: [{ type: 'thinking', thinking: 'Let me think...', signature: 'sig123' }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const content = result[0].content as Array<{ type: string; thinking?: string }>
        expect(content[0].type).toBe('thinking')
        expect(content[0].thinking).toBe('Let me think...')
      })
    })

    describe('extractSystemPrompt', () => {
      it('应正确提取系统提示词', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'system', content: 'You are helpful.', createdAt: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:01Z' }
        ]

        const result = converter.extractSystemPrompt(messages)

        expect(result).toBe('You are helpful.')
      })

      it('应合并多个系统消息', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'system', content: 'First rule.', createdAt: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'system', content: 'Second rule.', createdAt: '2024-01-01T00:00:01Z' }
        ]

        const result = converter.extractSystemPrompt(messages)

        expect(result).toBe('First rule.\n\nSecond rule.')
      })

      it('没有系统消息时应返回 undefined', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.extractSystemPrompt(messages)

        expect(result).toBeUndefined()
      })
    })
  })

  describe('GeminiMessageConverter', () => {
    const converter = new GeminiMessageConverter()

    describe('toSdk', () => {
      it('应正确转换简单文本消息', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
        expect(result[0].parts).toHaveLength(1)
        expect(result[0].parts[0]).toHaveProperty('text', 'Hello')
      })

      it('应跳过系统消息（Gemini 使用单独的 systemInstruction）', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'system', content: 'System prompt', createdAt: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:01Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
      })

      it('应将 assistant 角色转换为 model', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('model')
      })

      it('应正确转换工具响应消息', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'tool',
            content: '{"result": "success"}',
            createdAt: '2024-01-01T00:00:00Z',
            name: 'get_weather'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('user')
        expect(result[0].parts[0]).toHaveProperty('functionResponse')
      })

      it('应正确转换带工具调用的助手消息', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: '',
            createdAt: '2024-01-01T00:00:00Z',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"location": "Beijing"}' }
              }
            ]
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        expect(result[0].role).toBe('model')
        const functionCall = result[0].parts.find((p) => 'functionCall' in p)
        expect(functionCall).toBeDefined()
        expect((functionCall as { functionCall: { name: string } }).functionCall.name).toBe('get_weather')
      })

      it('应正确转换图片内容', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'user',
            content: [{ type: 'image', image: 'base64imagedata', mimeType: 'image/png' }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const inlineData = result[0].parts.find((p) => 'inlineData' in p)
        expect(inlineData).toBeDefined()
        expect((inlineData as { inlineData: { mimeType: string } }).inlineData.mimeType).toBe('image/png')
      })

      it('应正确处理 image_url 类型的 data URL', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,xyz789' } }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const inlineData = result[0].parts.find((p) => 'inlineData' in p)
        expect(inlineData).toBeDefined()
        expect((inlineData as { inlineData: { mimeType: string } }).inlineData.mimeType).toBe('image/jpeg')
      })

      it('应正确处理 thinking 内容（转换为文本）', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: [{ type: 'thinking', thinking: 'Let me think...' }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const textPart = result[0].parts.find((p) => 'text' in p)
        expect(textPart).toBeDefined()
        expect((textPart as { text: string }).text).toContain('[Thinking]')
      })

      it('应正确处理 tool_use 内容', () => {
        const messages: UnifiedMessage[] = [
          {
            id: '1',
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'tool_1', name: 'get_weather', input: { location: 'Beijing' } }],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]

        const result = converter.toSdk(messages)

        expect(result).toHaveLength(1)
        const functionCall = result[0].parts.find((p) => 'functionCall' in p)
        expect(functionCall).toBeDefined()
        expect((functionCall as { functionCall: { name: string } }).functionCall.name).toBe('get_weather')
      })
    })

    describe('extractSystemPrompt', () => {
      it('应正确提取系统提示词', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'system', content: 'You are helpful.', createdAt: '2024-01-01T00:00:00Z' },
          { id: '2', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:01Z' }
        ]

        const result = converter.extractSystemPrompt(messages)

        expect(result).toBe('You are helpful.')
      })

      it('没有系统消息时应返回 undefined', () => {
        const messages: UnifiedMessage[] = [
          { id: '1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
        ]

        const result = converter.extractSystemPrompt(messages)

        expect(result).toBeUndefined()
      })
    })
  })
})
