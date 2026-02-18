/**
 * Gemini 消息转换器
 * 将统一消息格式转换为 Google Gemini API 格式
 */

import type { UnifiedContentPart, UnifiedMessage } from '../../types/message'

/**
 * Gemini 消息类型（简化版）
 */
export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

/**
 * Gemini 工具声明
 */
export interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description: string
    parameters?: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }>
}

/**
 * Gemini 消息转换器
 */
export class GeminiMessageConverter {
  /**
   * 将统一消息转换为 Gemini 格式
   */
  toSdk(messages: UnifiedMessage[]): GeminiContent[] {
    const result: GeminiContent[] = []

    for (const msg of messages) {
      // 跳过系统消息（Gemini 使用单独的 systemInstruction）
      if (msg.role === 'system') {
        continue
      }

      const converted = this.convertMessage(msg)
      if (converted && converted.parts.length > 0) {
        result.push(converted)
      }
    }

    return result
  }

  /**
   * 提取系统提示词
   */
  extractSystemPrompt(messages: UnifiedMessage[]): string | undefined {
    const systemMessages = messages.filter((m) => m.role === 'system')
    if (systemMessages.length === 0) return undefined

    return systemMessages
      .map((m) => (typeof m.content === 'string' ? m.content : this.contentToString(m.content)))
      .join('\n\n')
  }

  /**
   * 转换单条消息
   */
  private convertMessage(msg: UnifiedMessage): GeminiContent | null {
    const role = msg.role === 'assistant' ? 'model' : 'user'

    // 工具响应
    if (msg.role === 'tool') {
      return {
        role: 'user', // Gemini 中工具响应作为 user 消息
        parts: [
          {
            functionResponse: {
              name: msg.name || 'unknown',
              response: {
                result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
              }
            }
          }
        ]
      }
    }

    const parts: GeminiPart[] = []

    // 处理文本内容
    if (typeof msg.content === 'string') {
      if (msg.content) {
        parts.push({ text: msg.content })
      }
    } else {
      for (const part of msg.content as UnifiedContentPart[]) {
        const geminiPart = this.convertPart(part)
        if (geminiPart) parts.push(geminiPart)
      }
    }

    // 处理工具调用
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        try {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
          parts.push({
            functionCall: {
              name: tc.function.name,
              args
            }
          })
        } catch {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: { raw: tc.function.arguments }
            }
          })
        }
      }
    }

    return {
      role,
      parts
    }
  }

  /**
   * 转换内容部分
   */
  private convertPart(part: UnifiedContentPart): GeminiPart | null {
    switch (part.type) {
      case 'text':
        return { text: part.text }

      case 'image':
        return {
          inlineData: {
            mimeType: part.mimeType || 'image/png',
            data: part.image.replace(/^data:[^;]+;base64,/, '')
          }
        }

      case 'image_url':
        const url = part.image_url.url
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            return {
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            }
          }
        }
        // 对于远程 URL，需要先下载
        return null

      case 'function_call':
        return {
          functionCall: {
            name: part.name,
            args: JSON.parse(part.arguments) as Record<string, unknown>
          }
        }

      case 'function_response':
        return {
          functionResponse: {
            name: part.name,
            response: part.response as Record<string, unknown>
          }
        }

      case 'tool_use':
        return {
          functionCall: {
            name: part.name,
            args: part.input
          }
        }

      case 'tool_result':
        return {
          functionResponse: {
            name: 'tool_result',
            response: {
              tool_use_id: part.tool_use_id,
              result: part.content,
              error: part.is_error
            }
          }
        }

      case 'thinking':
        // Gemini 不直接支持 thinking，作为注释文本处理
        return { text: `[Thinking]: ${part.thinking}` }

      default:
        return null
    }
  }

  /**
   * 内容转字符串
   */
  private contentToString(content: UnifiedContentPart[] | string): string {
    if (typeof content === 'string') return content
    return content
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('\n')
  }
}
