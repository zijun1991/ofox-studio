/**
 * Ofox API 封装服务
 *
 * 使用 Electron net.fetch 封装所有 ofox.ai API 调用
 * 自动添加 Referer 和必要的 headers
 * 禁止业务代码直接调用 axios 或其他 HTTP 客户端访问 ofox API
 */

import { loggerService } from '@logger'
import { session } from 'electron'

import type {
  OfoxAnthropicModel,
  OfoxApiResponse,
  OfoxGeminiModel,
  OfoxModel,
  OfoxModelCapabilities,
  OfoxModelPricing,
  OfoxOpenAIModel
} from '../../renderer/src/types/ofox'

const logger = loggerService.withContext('OfoxService')

// Ofox API 基础配置
const OFOX_BASE_URL = 'https://app.ofox.ai'
const OFOX_API_BASE = 'https://app.ofox.ai/api'
const OFOX_REFERER = 'https://app.ofox.ai/'
const OFOX_PARTITION = 'persist:ofox'

// Ofox 模型 API 端点配置
const OFOX_API_ENDPOINTS = {
  openai: 'https://api.ofox.ai/v1/models',
  anthropic: 'https://api.ofox.ai/anthropic/v1/models',
  gemini: 'https://api.ofox.ai/gemini/v1beta/models'
} as const

type OfoxProtocol = keyof typeof OFOX_API_ENDPOINTS

// 用户会话信息接口
export interface OfoxSession {
  user: {
    id: string
    email: string
    name?: string
    image?: string
    emailVerified?: boolean
    createdAt?: string
    updatedAt?: string
  } | null
  session: {
    id: string
    userId: string
    expiresAt: string
    token?: string
    createdAt?: string
    updatedAt?: string
    ipAddress?: string
    userAgent?: string
  } | null
}

/**
 * Ofox API 服务类
 * 封装所有与 ofox.ai 的 API 通信
 */
class OfoxService {
  private static instance: OfoxService

  private constructor() {}

  static getInstance(): OfoxService {
    if (!OfoxService.instance) {
      OfoxService.instance = new OfoxService()
    }
    return OfoxService.instance
  }

  /**
   * 获取默认请求头
   */
  private getDefaultHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Referer: OFOX_REFERER,
      Origin: OFOX_BASE_URL
    }
  }

  /**
   * 获取 Ofox 专用的 session (与 webview 共享)
   */
  private getOfoxSession(): Electron.Session {
    return session.fromPartition(OFOX_PARTITION)
  }

  /**
   * 发送请求到 Ofox API
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      body?: Record<string, unknown>
      headers?: Record<string, string>
    } = {}
  ): Promise<OfoxApiResponse<T>> {
    const { method = 'GET', body, headers: customHeaders } = options
    const url = `${OFOX_API_BASE}${endpoint}`

    const headers = {
      ...this.getDefaultHeaders(),
      ...customHeaders
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: headers as HeadersInit
      }

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body)
      }

      logger.debug(`Requesting ${method} ${url}`)

      // 使用 ofox session 发起请求，确保与 webview 共享 Cookie
      const response = await this.getOfoxSession().fetch(url, fetchOptions)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`API request failed: ${response.status} ${errorText}`)
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`
        }
      }

      const data = await response.json()
      logger.debug(`Response from ${endpoint}:`, data)

      return {
        success: true,
        data: data as T
      }
    } catch (error) {
      logger.error(`API request error for ${endpoint}:`, error as Error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 获取当前用户会话信息
   * 对应 API: GET /api/auth/get-session
   */
  async getSession(): Promise<OfoxApiResponse<OfoxSession>> {
    return this.request<OfoxSession>('/auth/get-session')
  }

  /**
   * 检查用户是否已登录
   */
  async isLoggedIn(): Promise<boolean> {
    const response = await this.getSession()
    return response.success && response.data?.user !== null && response.data?.session !== null
  }

  /**
   * 获取用户信息（简化版）
   */
  async getUserInfo(): Promise<OfoxApiResponse<OfoxSession['user']>> {
    const response = await this.getSession()
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.user
      }
    }
    return {
      success: false,
      error: response.error
    }
  }

  /**
   * 通用 GET 请求
   */
  async get<T>(endpoint: string): Promise<OfoxApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  /**
   * 通用 POST 请求
   */
  async post<T>(endpoint: string, body: Record<string, unknown>): Promise<OfoxApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body })
  }

  /**
   * 通用 PUT 请求
   */
  async put<T>(endpoint: string, body: Record<string, unknown>): Promise<OfoxApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body })
  }

  /**
   * 通用 DELETE 请求
   */
  async delete<T>(endpoint: string): Promise<OfoxApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  /**
   * 获取登录 URL
   */
  getLoginUrl(): string {
    return `${OFOX_BASE_URL}/auth/sign-in`
  }

  /**
   * 获取 Dashboard URL（用于检测登录完成）
   */
  getDashboardUrl(): string {
    return `${OFOX_BASE_URL}/dashboard`
  }

  /**
   * 检查 URL 是否为登录完成（跳转到 dashboard）的 URL
   */
  isLoginComplete(url: string): boolean {
    return url.startsWith(this.getDashboardUrl())
  }

  /**
   * 登出 - 清除 Ofox session 中的 Cookie
   */
  async logout(): Promise<void> {
    const ofoxSession = this.getOfoxSession()
    await ofoxSession.clearStorageData({
      storages: ['cookies']
    })
    logger.info('Ofox session cookies cleared')
  }

  /**
   * 从三个 Ofox API 端点获取模型列表
   * - OpenAI: /v1/models
   * - Anthropic: /anthropic/v1/models
   * - Gemini: /gemini/v1beta/models
   */
  async getModels(): Promise<OfoxApiResponse<OfoxModel[]>> {
    try {
      logger.info('Fetching models from all Ofox API endpoints...')

      // 并行获取三个端点的数据
      const [openaiResult, anthropicResult, geminiResult] = await Promise.all([
        this.fetchModelsFromEndpoint('openai'),
        this.fetchModelsFromEndpoint('anthropic'),
        this.fetchModelsFromEndpoint('gemini')
      ])

      // 合并所有模型
      const allModels: OfoxModel[] = []

      if (openaiResult.success && openaiResult.data) {
        const openaiModels = openaiResult.data as OfoxOpenAIModel[]
        allModels.push(...openaiModels.map((m) => this.convertOpenAIModel(m)))
        logger.debug(`Fetched ${openaiModels.length} models from OpenAI endpoint`)
      }
      if (anthropicResult.success && anthropicResult.data) {
        const anthropicModels = anthropicResult.data as OfoxAnthropicModel[]
        allModels.push(...anthropicModels.map((m) => this.convertAnthropicModel(m)))
        logger.debug(`Fetched ${anthropicModels.length} models from Anthropic endpoint`)
      }
      if (geminiResult.success && geminiResult.data) {
        const geminiModels = geminiResult.data as OfoxGeminiModel[]
        allModels.push(...geminiModels.map((m) => this.convertGeminiModel(m)))
        logger.debug(`Fetched ${geminiModels.length} models from Gemini endpoint`)
      }

      // 去重并合并协议（基于 canonical_slug）
      const uniqueModels = this.deduplicateAndMergeProtocols(allModels)

      if (uniqueModels.length === 0) {
        logger.error('No models fetched from any endpoint')
        return {
          success: false,
          error: 'No models fetched from any endpoint'
        }
      }

      // 统计各协议模型数量
      const protocolCounts: Record<string, number> = {}
      for (const model of uniqueModels) {
        for (const protocol of model.supported_protocols) {
          protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1
        }
      }
      logger.info('Models by protocol:', protocolCounts)

      logger.info(`Successfully fetched ${uniqueModels.length} unique models from Ofox APIs`)
      return {
        success: true,
        data: uniqueModels
      }
    } catch (error) {
      logger.error('Error fetching models:', error as Error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 从指定端点获取模型列表
   */
  private async fetchModelsFromEndpoint(protocol: OfoxProtocol): Promise<OfoxApiResponse<unknown[]>> {
    const url = OFOX_API_ENDPOINTS[protocol]

    try {
      logger.debug(`Fetching models from ${url}`)

      const response = await this.getOfoxSession().fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Failed to fetch from ${protocol}: ${response.status} ${errorText}`)
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`
        }
      }

      const data = (await response.json()) as Record<string, unknown>

      // 根据协议提取模型数组
      let models: unknown[] = []
      if (protocol === 'openai' && Array.isArray(data.data)) {
        models = data.data
      } else if (protocol === 'anthropic' && Array.isArray(data.data)) {
        models = data.data
      } else if (protocol === 'gemini' && Array.isArray(data.models)) {
        models = data.models
      }

      return {
        success: true,
        data: models
      }
    } catch (error) {
      logger.error(`Error fetching from ${protocol}:`, error as Error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 将 OpenAI 格式模型转换为统一 OfoxModel
   */
  private convertOpenAIModel(model: OfoxOpenAIModel): OfoxModel {
    return {
      id: model.id,
      canonical_slug: model.canonical_slug,
      display_name: model.name,
      description: model.description,
      owned_by: model.owned_by,
      model_protocol: 'openai',
      series: this.extractSeries(model.canonical_slug),
      mode: 'chat',
      context_window: model.context_length,
      max_output_tokens: model.top_provider?.max_completion_tokens,
      pricing: this.convertPricing(model.pricing),
      capabilities: this.extractCapabilities(model.supported_parameters, model.architecture),
      supported_provider_types: [model.owned_by],
      supported_protocols: ['openai'],
      released_at: model.created ? new Date(model.created * 1000).toISOString() : undefined
    }
  }

  /**
   * 将 Anthropic 格式模型转换为统一 OfoxModel
   */
  private convertAnthropicModel(model: OfoxAnthropicModel): OfoxModel {
    return {
      id: model.id,
      canonical_slug: model.canonical_slug,
      display_name: model.display_name,
      description: model.description,
      owned_by: model.owned_by,
      model_protocol: 'anthropic',
      series: this.extractSeries(model.canonical_slug),
      mode: 'chat',
      context_window: model.context_length,
      max_output_tokens: model.top_provider?.max_completion_tokens,
      pricing: this.convertPricing(model.pricing),
      capabilities: this.extractCapabilities(model.supported_parameters, model.architecture),
      supported_provider_types: [model.owned_by],
      supported_protocols: ['anthropic'],
      released_at: model.created_at
    }
  }

  /**
   * 将 Gemini 格式模型转换为统一 OfoxModel
   */
  private convertGeminiModel(model: OfoxGeminiModel): OfoxModel {
    // 移除 "models/" 前缀
    const id = model.name.replace(/^models\//, '')

    return {
      id,
      canonical_slug: model.canonicalSlug,
      display_name: model.displayName,
      description: model.description,
      owned_by: model.ownedBy,
      model_protocol: 'gemini',
      series: this.extractSeries(model.canonicalSlug),
      mode: 'chat',
      context_window: model.contextLength || model.inputTokenLimit,
      max_output_tokens: model.outputTokenLimit,
      pricing: this.convertPricing(model.pricing),
      capabilities: this.extractCapabilities(model.supportedParameters, model.architecture),
      supported_provider_types: [model.ownedBy],
      supported_protocols: ['gemini'],
      released_at: undefined
    }
  }

  /**
   * 转换定价信息
   */
  private convertPricing(pricing?: {
    prompt: string
    completion: string
    input_cache_read?: string
    input_cache_write?: string
    web_search?: string
  }): OfoxModelPricing {
    return {
      input: pricing?.prompt || '0',
      output: pricing?.completion || '0',
      input_cache_read: pricing?.input_cache_read,
      input_cache_write: pricing?.input_cache_write,
      web_search: pricing?.web_search
    }
  }

  /**
   * 提取模型能力
   */
  private extractCapabilities(
    supportedParams?: string[],
    architecture?: { modality?: string; input_modalities?: string[] }
  ): OfoxModelCapabilities {
    const capabilities: OfoxModelCapabilities = {}

    if (supportedParams) {
      if (supportedParams.includes('tools') || supportedParams.includes('tool_choice')) {
        capabilities.function_calling = true
      }
      if (supportedParams.includes('reasoning')) {
        capabilities.reasoning = true
      }
    }

    if (architecture?.modality?.includes('image')) {
      capabilities.vision = true
    }
    if (architecture?.input_modalities?.includes('image')) {
      capabilities.vision = true
    }
    if (architecture?.input_modalities?.includes('audio')) {
      capabilities.audio_input = true
    }
    if (architecture?.input_modalities?.includes('file')) {
      capabilities.pdf_input = true
    }

    return capabilities
  }

  /**
   * 从 canonical_slug 提取系列名称
   */
  private extractSeries(slug: string): string {
    // 例如: "claude-haiku-4-5-20251001" -> "claude"
    // 例如: "gemini-2.5-flash-preview-05-20" -> "gemini"
    const parts = slug.split('-')
    return parts[0] || 'default'
  }

  /**
   * 模型去重并合并协议（基于 canonical_slug）
   * 同一个模型可能支持多个协议，需要合并 supported_protocols
   */
  private deduplicateAndMergeProtocols(models: OfoxModel[]): OfoxModel[] {
    const modelMap = new Map<string, OfoxModel>()

    for (const model of models) {
      const existing = modelMap.get(model.canonical_slug)
      if (existing) {
        // 合并 supported_protocols
        const mergedProtocols = [...new Set([...existing.supported_protocols, ...model.supported_protocols])]
        existing.supported_protocols = mergedProtocols
        // 也合并 supported_provider_types
        const mergedProviderTypes = [
          ...new Set([...existing.supported_provider_types, ...model.supported_provider_types])
        ]
        existing.supported_provider_types = mergedProviderTypes
      } else {
        // 克隆模型，避免引用问题
        modelMap.set(model.canonical_slug, { ...model })
      }
    }

    return Array.from(modelMap.values())
  }
}

// 导出单例实例
export const ofoxService = OfoxService.getInstance()

// 导出类型
export default OfoxService
