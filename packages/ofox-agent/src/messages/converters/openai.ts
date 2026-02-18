/**
 * OpenAI 消息转换器
 * 将统一消息格式转换为 OpenAI API 格式
 */

import type { UnifiedContentPart, UnifiedMessage } from '../../types/message'

/**
 * OpenAI 消息类型（简化版，用于类型安全）
 */
export type OpenAIMessageParam = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIContentPart[] | null
  name?: string
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * OpenAI 消息转换器
 */
export class OpenAIMessageConverter {
  /**
   * 将统一消息转换为 OpenAI 格式
   */
  toSdk(messages: UnifiedMessage[]): OpenAIMessageParam[] {
    return messages.map((msg) => this.convertMessage(msg))
  }

  /**
   * 转换单条消息
   */
  private convertMessage(msg: UnifiedMessage): OpenAIMessageParam {
    const base: OpenAIMessageParam = {
      role: msg.role,
      name: msg.name
    } as OpenAIMessageParam

    // 处理工具响应
    if (msg.role === 'tool') {
      return {
        ...base,
        role: 'tool',
        tool_call_id: msg.tool_call_id!,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }
    }

    // 处理带工具调用的助手消息
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        ...base,
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }))
      }
    }

    // 处理普通文本消息
    if (typeof msg.content === 'string') {
      return {
        ...base,
        content: msg.content
      }
    }

    // 处理多部分内容
    return {
      ...base,
      content: (msg.content as UnifiedContentPart[]).map((part) => this.convertContentPart(part))
    }
  }

  /**
   * 转换内容部分
   */
  private convertContentPart(part: UnifiedContentPart): OpenAIContentPart {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text }

      case 'image_url':
        return { type: 'image_url', image_url: part.image_url }

      case 'image':
        // 将 image 转换为 image_url 格式
        return {
          type: 'image_url',
          image_url: {
            url: part.image.startsWith('data:')
              ? part.image
              : `data:${part.mimeType || 'image/png'};base64,${part.image}`
          }
        }

      case 'tool_use':
        // OpenAI 不支持内联 tool_use，应该使用 tool_calls
        return {
          type: 'text',
          text: `[Tool Use: ${part.name}]\n${JSON.stringify(part.input, null, 2)}`
        }

      case 'tool_result':
        return {
          type: 'text',
          text: `[Tool Result${part.is_error ? ' (Error)' : ''}]: ${part.content}`
        }

      case 'thinking':
        return {
          type: 'text',
          text: `[Thinking]: ${part.thinking}`
        }

      default:
        return {
          type: 'text',
          text: JSON.stringify(part)
        }
    }
  }

  /**
   * 将 OpenAI 格式转换为统一消息
   */
  fromSdk(sdkMsg: OpenAIMessageParam, id: string): UnifiedMessage {
    const msg: UnifiedMessage = {
      id,
      role: sdkMsg.role,
      content: '',
      createdAt: new Date().toISOString()
    }

    if (sdkMsg.name) {
      msg.name = sdkMsg.name
    }

    if (sdkMsg.tool_call_id) {
      msg.tool_call_id = sdkMsg.tool_call_id
    }

    if (sdkMsg.tool_calls) {
      msg.tool_calls = sdkMsg.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      }))
    }

    // 处理内容
    if (sdkMsg.content === null) {
      msg.content = ''
    } else if (typeof sdkMsg.content === 'string') {
      msg.content = sdkMsg.content
    } else {
      // 处理多部分内容
      msg.content = sdkMsg.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
    }

    return msg
  }
}
