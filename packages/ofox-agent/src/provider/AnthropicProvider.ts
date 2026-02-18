/**
 * Anthropic Provider 实现
 */

import { AnthropicMessageConverter } from '../messages/converters/anthropic'
import type { StreamChunk, UnifiedMessage } from '../types/message'
import type { GenerateOptions, GenerateResult } from '../types/provider'
import type { ToolDefinition } from '../types/tool'
import { LlmProvider } from './LlmProvider'

/**
 * Anthropic API 响应类型（简化版）
 */
interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text' | 'tool_use' | 'thinking'
    text?: string
    thinking?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }>
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Anthropic Provider
 */
export class AnthropicProvider extends LlmProvider {
  private converter = new AnthropicMessageConverter()

  /**
   * 生成完整响应
   */
  async generate(messages: UnifiedMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const config = this.getApiConfig()
    const requestOptions = this.buildRequestOptions(options)

    // 提取系统提示词
    const systemPrompt = requestOptions.systemPrompt || this.converter.extractSystemPrompt(messages)

    // 转换消息格式（排除系统消息）
    const anthropicMessages = this.converter.toSdk(messages)

    // 构建请求体
    const body: Record<string, unknown> = {
      model: config.model,
      messages: anthropicMessages,
      max_tokens: requestOptions.maxTokens
    }

    if (systemPrompt) {
      body.system = systemPrompt
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.convertTools(options.tools)
    }

    // 发送请求
    const response = await this.fetchApi<AnthropicResponse>('/v1/messages', body)

    // 解析响应
    const result: GenerateResult = {
      content: '',
      finishReason: this.mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    }

    // 处理内容块
    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        result.content += block.text
      } else if (block.type === 'tool_use' && block.id && block.name) {
        if (!result.toolCalls) result.toolCalls = []
        result.toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input || {}
        })
      }
    }

    return result
  }

  /**
   * 流式生成响应
   */
  async *stream(messages: UnifiedMessage[], options?: GenerateOptions): AsyncIterable<StreamChunk> {
    const config = this.getApiConfig()
    const requestOptions = this.buildRequestOptions(options)

    // 提取系统提示词
    const systemPrompt = requestOptions.systemPrompt || this.converter.extractSystemPrompt(messages)

    // 转换消息格式
    const anthropicMessages = this.converter.toSdk(messages)

    // 构建请求体
    const body: Record<string, unknown> = {
      model: config.model,
      messages: anthropicMessages,
      max_tokens: requestOptions.maxTokens,
      stream: true
    }

    if (systemPrompt) {
      body.system = systemPrompt
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.convertTools(options.tools)
    }

    // 发送流式请求
    const response = await this.fetchApiStream('/v1/messages', body)

    // 解析 SSE 流
    let currentToolCall: { id: string; name: string; delta: string } | null = null

    for await (const line of response) {
      if (!line.startsWith('data: ')) continue

      const data = line.slice(6)
      try {
        const event = JSON.parse(data) as {
          type: string
          index?: number
          delta?: {
            type?: string
            text?: string
            partial_json?: string
            thinking?: string
          }
          content_block?: {
            type: string
            id?: string
            name?: string
          }
          message?: {
            stop_reason?: string
            usage?: { input_tokens: number; output_tokens: number }
          }
        }

        switch (event.type) {
          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              currentToolCall = {
                id: event.content_block.id || '',
                name: event.content_block.name || '',
                delta: ''
              }
            }
            break

          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              yield { delta: event.delta.text, isComplete: false }
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              if (currentToolCall) {
                currentToolCall.delta += event.delta.partial_json
                yield {
                  delta: '',
                  toolCalls: [{ ...currentToolCall, delta: event.delta.partial_json }],
                  isComplete: false
                }
              }
            } else if (event.delta?.thinking) {
              yield { delta: `[Thinking]: ${event.delta.thinking}`, isComplete: false }
            }
            break

          case 'content_block_stop':
            currentToolCall = null
            break

          case 'message_delta':
            if (event.message?.stop_reason) {
              yield {
                delta: '',
                isComplete: true,
                usage: event.message.usage
                  ? {
                      inputTokens: event.message.usage.input_tokens,
                      outputTokens: event.message.usage.output_tokens
                    }
                  : undefined
              }
            }
            break

          case 'message_stop':
            yield { delta: '', isComplete: true }
            break
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  /**
   * 转换消息格式
   */
  convertMessages(messages: UnifiedMessage[]): unknown {
    return this.converter.toSdk(messages)
  }

  /**
   * 转换工具定义
   */
  convertTools(tools: ToolDefinition[]): unknown {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }))
  }

  /**
   * 发送 API 请求
   */
  private async fetchApi<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const config = this.getApiConfig()
    const baseURL = config.baseURL || 'https://api.anthropic.com'

    const response = await fetch(`${baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...config.headers
      },
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * 发送流式 API 请求
   */
  private async *fetchApiStream(endpoint: string, body: Record<string, unknown>): AsyncIterable<string> {
    const config = this.getApiConfig()
    const baseURL = config.baseURL || 'https://api.anthropic.com'

    const response = await fetch(`${baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...config.headers
      },
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} - ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          yield line
        }
      }
    }
  }

  /**
   * 映射停止原因
   */
  private mapStopReason(reason: string | null): GenerateResult['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop'
      case 'tool_use':
        return 'tool_use'
      case 'max_tokens':
        return 'length'
      default:
        return 'stop'
    }
  }
}
