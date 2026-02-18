/**
 * Mock messages for testing
 */

import type { SessionMessage, UnifiedMessage } from '../../src/types/message'

/**
 * 简单测试消息
 */
export const mockSimpleMessages: UnifiedMessage[] = [
  { id: 'msg-1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:00Z' }
]

/**
 * 带系统消息的测试消息
 */
export const mockMessagesWithSystem: UnifiedMessage[] = [
  { id: 'msg-sys', role: 'system', content: 'You are a helpful assistant.', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'msg-1', role: 'user', content: 'Hello', createdAt: '2024-01-01T00:00:01Z' }
]

/**
 * 对话历史测试消息
 */
export const mockConversationMessages: UnifiedMessage[] = [
  { id: 'msg-1', role: 'user', content: 'What is TypeScript?', createdAt: '2024-01-01T00:00:00Z' },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'TypeScript is a typed superset of JavaScript.',
    createdAt: '2024-01-01T00:00:01Z'
  },
  { id: 'msg-3', role: 'user', content: 'Tell me more about it.', createdAt: '2024-01-01T00:00:02Z' },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'TypeScript adds static typing and other features.',
    createdAt: '2024-01-01T00:00:03Z'
  }
]

/**
 * 带工具调用的测试消息
 */
export const mockMessagesWithToolCalls: UnifiedMessage[] = [
  { id: 'msg-1', role: 'user', content: 'What is the weather in Beijing?', createdAt: '2024-01-01T00:00:00Z' },
  {
    id: 'msg-2',
    role: 'assistant',
    content: '',
    createdAt: '2024-01-01T00:00:01Z',
    tool_calls: [
      {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location": "Beijing"}' }
      }
    ]
  },
  {
    id: 'msg-3',
    role: 'tool',
    content: '{"temperature": "25°C", "condition": "sunny"}',
    createdAt: '2024-01-01T00:00:02Z',
    tool_call_id: 'call_123'
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'The weather in Beijing is sunny with 25°C.',
    createdAt: '2024-01-01T00:00:03Z'
  }
]

/**
 * 带多部分内容的测试消息
 */
export const mockMessagesWithMultiPart: UnifiedMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
    ],
    createdAt: '2024-01-01T00:00:00Z'
  }
]

/**
 * 带 thinking 内容的测试消息
 */
export const mockMessagesWithThinking: UnifiedMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'Let me think about this...' },
      { type: 'text', text: 'The answer is 42.' }
    ],
    createdAt: '2024-01-01T00:00:00Z'
  }
]

/**
 * 长对话（用于压缩测试）
 */
export function createLongMessages(count: number): SessionMessage[] {
  const messages: SessionMessage[] = []
  for (let i = 0; i < count; i++) {
    messages.push({
      id: `msg-${i}`,
      sessionId: 'test-session',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `This is message number ${i}. It contains some content to make it longer and test token estimation.`,
      createdAt: new Date(2024, 0, 1, 0, 0, i).toISOString()
    })
  }
  return messages
}

/**
 * Session 消息
 */
export const mockSessionMessages: SessionMessage[] = [
  {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Hello',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'msg-2',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'Hi there!',
    createdAt: '2024-01-01T00:00:01Z',
    metadata: { model: 'gpt-4', provider: 'openai' }
  }
]
