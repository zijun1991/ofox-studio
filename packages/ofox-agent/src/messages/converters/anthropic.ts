/**
 * Anthropic 消息转换器
 * 将统一消息格式转换为 Anthropic API 格式
 */

import type { UnifiedContentPart, UnifiedMessage } from '../../types/message'

/**
 * Anthropic 消息类型（简化版）
 */
export type AnthropicMessageParam = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result'
      tool_use_id: string
      content: string | AnthropicContentBlock[]
      is_error?: boolean
    }
  | { type: 'thinking'; thinking: string; signature?: string }

/**
 * Anthropic 消息转换器
 */
export class AnthropicMessageConverter {
  /**
   * 将统一消息转换为 Anthropic 格式
   */
  toSdk(messages: UnifiedMessage[]): AnthropicMessageParam[] {
    const result: AnthropicMessageParam[] = []

    for (const msg of messages) {
      // 跳过系统消息（Anthropic 使用单独的 system 参数）
      if (msg.role === 'system') {
        continue
      }

      const converted = this.convertMessage(msg)
      if (converted) {
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
  private convertMessage(msg: UnifiedMessage): AnthropicMessageParam | null {
    // 工具响应需要特殊处理
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id!,
            content: typeof msg.content === 'string' ? msg.content : this.contentToBlocks(msg.content),
            is_error: false
          }
        ]
      }
    }

    // 助手消息
    if (msg.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = []

      // 添加文本内容
      if (typeof msg.content === 'string') {
        if (msg.content) {
          blocks.push({ type: 'text', text: msg.content })
        }
      } else {
        for (const part of msg.content as UnifiedContentPart[]) {
          const block = this.convertContentBlock(part)
          if (block) blocks.push(block)
        }
      }

      // 添加工具调用
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          try {
            const input = JSON.parse(tc.function.arguments) as Record<string, unknown>
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input
            })
          } catch {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: { raw: tc.function.arguments }
            })
          }
        }
      }

      return {
        role: 'assistant',
        content: blocks.length > 0 ? blocks : ''
      }
    }

    // 用户消息
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return {
          role: 'user',
          content: msg.content
        }
      }

      const blocks: AnthropicContentBlock[] = []
      for (const part of msg.content as UnifiedContentPart[]) {
        const block = this.convertContentBlock(part)
        if (block) blocks.push(block)
      }

      return {
        role: 'user',
        content: blocks.length > 0 ? blocks : ''
      }
    }

    return null
  }

  /**
   * 转换内容块
   */
  private convertContentBlock(part: UnifiedContentPart): AnthropicContentBlock | null {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text }

      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mimeType || 'image/png',
            data: part.image.replace(/^data:[^;]+;base64,/, '')
          }
        }

      case 'image_url':
        // Anthropic 需要下载图片转换为 base64
        // 这里简化处理，仅支持 data URL
        const url = part.image_url.url
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1],
                data: match[2]
              }
            }
          }
        }
        return null

      case 'tool_use':
        return {
          type: 'tool_use',
          id: part.id,
          name: part.name,
          input: part.input
        }

      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: part.tool_use_id,
          content: part.content,
          is_error: part.is_error
        }

      case 'thinking':
        return {
          type: 'thinking',
          thinking: part.thinking,
          signature: part.signature
        }

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

  /**
   * 内容转块数组
   */
  private contentToBlocks(content: UnifiedContentPart[] | string): AnthropicContentBlock[] {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }]
    }
    return content.map((p) => this.convertContentBlock(p)).filter((b): b is AnthropicContentBlock => b !== null)
  }
}
