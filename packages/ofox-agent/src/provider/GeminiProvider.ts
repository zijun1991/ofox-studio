/**
 * Gemini Provider 实现
 */

import { GeminiMessageConverter, type GeminiTool } from '../messages/converters/gemini'
import type { StreamChunk, UnifiedMessage } from '../types/message'
import type { GenerateOptions, GenerateResult } from '../types/provider'
import type { ToolDefinition } from '../types/tool'
import { LlmProvider } from './LlmProvider'

/**
 * Gemini API 响应类型（简化版）
 */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string
        functionCall?: {
          name: string
          args: Record<string, unknown>
        }
      }>
      role: string
    }
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER'
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

/**
 * Gemini Provider
 */
export class GeminiProvider extends LlmProvider {
  private converter = new GeminiMessageConverter()

  /**
   * 生成完整响应
   */
  async generate(messages: UnifiedMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const config = this.getApiConfig()
    const requestOptions = this.buildRequestOptions(options)

    // 提取系统提示词
    const systemPrompt = requestOptions.systemPrompt || this.converter.extractSystemPrompt(messages)

    // 转换消息格式
    const geminiMessages = this.converter.toSdk(messages)

    // 构建请求体
    const body: Record<string, unknown> = {
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: requestOptions.maxTokens,
        temperature: requestOptions.temperature,
        topP: requestOptions.topP,
        stopSequences: requestOptions.stopSequences
      }
    }

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }]
      }
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.convertTools(options.tools)
    }

    // 发送请求
    const response = await this.fetchApi<GeminiResponse>(`/v1beta/models/${config.model}:generateContent`, body)

    // 解析响应
    const candidate = response.candidates?.[0]
    if (!candidate) {
      return { content: '', finishReason: 'error' }
    }

    const result: GenerateResult = {
      content: '',
      finishReason: this.mapFinishReason(candidate.finishReason),
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount,
            outputTokens: response.usageMetadata.candidatesTokenCount
          }
        : undefined
    }

    // 处理内容
    for (const part of candidate.content.parts) {
      if (part.text) {
        result.content += part.text
      } else if (part.functionCall) {
        if (!result.toolCalls) result.toolCalls = []
        result.toolCalls.push({
          id: `fc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args
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
    const geminiMessages = this.converter.toSdk(messages)

    // 构建请求体
    const body: Record<string, unknown> = {
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: requestOptions.maxTokens,
        temperature: requestOptions.temperature,
        topP: requestOptions.topP,
        stopSequences: requestOptions.stopSequences
      }
    }

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }]
      }
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.convertTools(options.tools)
    }

    // 发送流式请求
    const response = await this.fetchApiStream(`/v1beta/models/${config.model}:streamGenerateContent?alt=sse`, body)

    // 解析 SSE 流
    for await (const line of response) {
      if (!line.startsWith('data: ')) continue

      const data = line.slice(6)
      try {
        const chunk = JSON.parse(data) as GeminiResponse

        const candidate = chunk.candidates?.[0]
        if (!candidate) continue

        const result: StreamChunk = {
          delta: '',
          isComplete: candidate.finishReason !== undefined && candidate.finishReason !== null
        }

        // 处理内容
        for (const part of candidate.content.parts) {
          if (part.text) {
            result.delta = part.text
          } else if (part.functionCall) {
            result.toolCalls = [
              {
                id: `fc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                name: part.functionCall.name,
                delta: JSON.stringify(part.functionCall.args)
              }
            ]
          }
        }

        // 添加 usage
        if (chunk.usageMetadata && result.isComplete) {
          result.usage = {
            inputTokens: chunk.usageMetadata.promptTokenCount,
            outputTokens: chunk.usageMetadata.candidatesTokenCount
          }
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
  convertTools(tools: ToolDefinition[]): GeminiTool[] {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as {
            type: 'object'
            properties: Record<string, unknown>
            required?: string[]
          }
        }))
      }
    ]
  }

  /**
   * 发送 API 请求
   */
  private async fetchApi<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const config = this.getApiConfig()
    const baseURL = config.baseURL || 'https://generativelanguage.googleapis.com'

    // Gemini API Key 通过 URL 参数传递
    const url = `${baseURL}${endpoint}?key=${config.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * 发送流式 API 请求
   */
  private async *fetchApiStream(endpoint: string, body: Record<string, unknown>): AsyncIterable<string> {
    const config = this.getApiConfig()
    const baseURL = config.baseURL || 'https://generativelanguage.googleapis.com'

    // Gemini API Key 通过 URL 参数传递
    const url = `${baseURL}${endpoint}&key=${config.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${error}`)
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
      case 'STOP':
        return 'stop'
      case 'MAX_TOKENS':
        return 'length'
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
        return 'error'
      default:
        return 'stop'
    }
  }
}
