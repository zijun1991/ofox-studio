/**
 * OpenAI Provider 实现
 */

import { OpenAIMessageConverter } from '../messages/converters/openai'
import type { StreamChunk, UnifiedMessage } from '../types/message'
import type { GenerateOptions, GenerateResult } from '../types/provider'
import type { ToolDefinition } from '../types/tool'
import { LlmProvider } from './LlmProvider'

/**
 * OpenAI API 响应类型（简化版）
 */
interface OpenAIResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * OpenAI Provider
 */
export class OpenAIProvider extends LlmProvider {
  private converter = new OpenAIMessageConverter()

  /**
   * 生成完整响应
   */
  async generate(messages: UnifiedMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const config = this.getApiConfig()
    const requestOptions = this.buildRequestOptions(options)

    // 转换消息格式
    const openaiMessages = this.converter.toSdk(messages)

    // 构建请求体
    const body: Record<string, unknown> = {
      model: config.model,
      messages: openaiMessages,
      max_tokens: requestOptions.maxTokens,
      temperature: requestOptions.temperature
    }

    if (requestOptions.topP !== undefined) {
      body.top_p = requestOptions.topP
    }

    if (requestOptions.stopSequences) {
      body.stop = requestOptions.stopSequences
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.convertTools(options.tools)
      body.tool_choice = 'auto'
    }

    // 发送请求
    const response = await this.fetchApi<OpenAIResponse>('/chat/completions', body)

    // 解析响应
    const choice = response.choices[0]
    const result: GenerateResult = {
      content: choice.message.content || '',
      finishReason: this.mapFinishReason(choice.finish_reason)
    }

    // 处理工具调用
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>
      }))
    }

    // 处理 usage
    if (response.usage) {
      result.usage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens
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

    // 转换消息格式
    const openaiMessages = this.converter.toSdk(messages)

    // 构建请求体
    const body: Record<string, unknown> = {
      model: config.model,
      messages: openaiMessages,
      max_tokens: requestOptions.maxTokens,
      temperature: requestOptions.temperature,
      stream: true
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.convertTools(options.tools)
      body.tool_choice = 'auto'
    }

    // 发送流式请求
    const response = await this.fetchApiStream('/chat/completions', body)

    // 解析 SSE 流
    for await (const line of response) {
      if (!line.startsWith('data: ')) continue

      const data = line.slice(6)
      if (data === '[DONE]') {
        yield { delta: '', isComplete: true }
        break
      }

      try {
        const chunk = JSON.parse(data) as {
          choices: Array<{
            delta: {
              content?: string
              tool_calls?: Array<{
                id?: string
                function?: {
                  name?: string
                  arguments?: string
                }
              }>
            }
            finish_reason: string | null
          }>
        }

        const choice = chunk.choices[0]
        if (!choice) continue

        const result: StreamChunk = {
          delta: choice.delta.content || '',
          isComplete: choice.finish_reason !== null
        }

        // 处理流式工具调用
        if (choice.delta.tool_calls) {
          result.toolCalls = choice.delta.tool_calls.map((tc) => ({
            id: tc.id || '',
            name: tc.function?.name || '',
            delta: tc.function?.arguments || ''
          }))
        }

        yield result
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
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))
  }

  /**
   * 发送 API 请求
   */
  private async fetchApi<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const config = this.getApiConfig()
    const baseURL = config.baseURL || 'https://api.openai.com/v1'

    const response = await fetch(`${baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.headers
      },
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * 发送流式 API 请求
   */
  private async *fetchApiStream(endpoint: string, body: Record<string, unknown>): AsyncIterable<string> {
    const config = this.getApiConfig()
    const baseURL = config.baseURL || 'https://api.openai.com/v1'

    const response = await fetch(`${baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.headers
      },
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${error}`)
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
   * 映射完成原因
   */
  private mapFinishReason(reason: string): GenerateResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop'
      case 'tool_calls':
        return 'tool_use'
      case 'length':
        return 'length'
      default:
        return 'error'
    }
  }
}
