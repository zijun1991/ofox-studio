/**
 * Ofox API 封装服务
 *
 * 使用 Electron net.fetch 封装所有 ofox.ai API 调用
 * 自动添加 Referer 和必要的 headers
 * 禁止业务代码直接调用 axios 或其他 HTTP 客户端访问 ofox API
 */

import { loggerService } from '@logger'
import { session } from 'electron'

import type { OfoxApiResponse, OfoxModel } from '../../renderer/src/types/ofox'

const logger = loggerService.withContext('OfoxService')

// Ofox API 基础配置
const OFOX_BASE_URL = 'https://app.ofox.ai'
const OFOX_API_BASE = 'https://app.ofox.ai/api'
const OFOX_REFERER = 'https://app.ofox.ai/'
const OFOX_PARTITION = 'persist:ofox'
const OFOX_MODELS_PAGE = 'https://ofox.ai/zh/models'

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
   * 从 ofox.ai/zh/models 页面获取模型列表
   * 解析页面中的 Next.js RSC payload 提取模型数据
   */
  async getModels(): Promise<OfoxApiResponse<OfoxModel[]>> {
    try {
      logger.debug(`Fetching models from ${OFOX_MODELS_PAGE}`)

      const response = await this.getOfoxSession().fetch(OFOX_MODELS_PAGE, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Failed to fetch models page: ${response.status} ${errorText}`)
        return {
          success: false,
          error: `HTTP ${response.status}: Failed to fetch models page`
        }
      }

      const html = await response.text()
      const models = this.parseModelsFromHtml(html)

      if (models.length === 0) {
        logger.warn('No models found in page, structure may have changed')
        return {
          success: false,
          error: 'No models found in page, the page structure may have changed'
        }
      }

      logger.info(`Successfully fetched ${models.length} models from ofox.ai`)
      return {
        success: true,
        data: models
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
   * 解析 Next.js RSC payload 中的模型数据
   * 查找 "models":[{...}] 数组并提取
   */
  private parseModelsFromHtml(html: string): OfoxModel[] {
    try {
      // Next.js RSC payload 中的模型数据格式为 "models":[{...}]
      // 数据以转义 JSON 格式存在，需要先找到位置再解析

      // 查找模型数组的起始位置
      // 模式: \"models\":[{\"id\":
      const modelsPattern = /\\"models\\":\[\{\\"id\\":/
      const match = html.match(modelsPattern)

      if (!match || match.index === undefined) {
        logger.warn('Could not find models array in HTML')
        return []
      }

      // 从 \"models\":[ 开始提取
      const startMarker = '\\"models\\":['
      const startIndex = html.indexOf(startMarker, match.index)

      if (startIndex === -1) {
        logger.warn('Could not find models array start marker')
        return []
      }

      // 从 [ 位置开始提取数组
      const arrayStart = startIndex + startMarker.length - 1

      // 找到匹配的 ] 结束位置（需要计算括号深度）
      let depth = 0
      let arrayEnd = -1
      let inString = false
      let escapeNext = false

      for (let i = arrayStart; i < html.length; i++) {
        const char = html[i]

        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (char === '\\') {
          escapeNext = true
          continue
        }

        if (char === '"' && !escapeNext) {
          inString = !inString
          continue
        }

        if (!inString) {
          if (char === '[') {
            depth++
          } else if (char === ']') {
            depth--
            if (depth === 0) {
              arrayEnd = i + 1
              break
            }
          }
        }
      }

      if (arrayEnd === -1) {
        logger.warn('Could not find models array end')
        return []
      }

      // 提取 JSON 数组字符串
      let jsonArrayStr = html.substring(arrayStart, arrayEnd)

      // 处理转义字符: \\" -> ", \\\\ -> \
      jsonArrayStr = jsonArrayStr
        .replace(/\\\\"/g, '\\"') // 先处理 \\" -> \"
        .replace(/\\"/g, '"') // 再处理 \" -> "
        .replace(/\\\\/g, '\\') // 处理 \\ -> \

      // 解析 JSON
      const models = JSON.parse(jsonArrayStr) as OfoxModel[]

      // 过滤掉非模型对象（有些可能是 ID 字符串数组）
      const validModels = models.filter(
        (model) =>
          model && typeof model === 'object' && typeof model.id === 'string' && typeof model.display_name === 'string'
      )

      return validModels
    } catch (error) {
      logger.error('Error parsing models from HTML:', error as Error)
      return []
    }
  }
}

// 导出单例实例
export const ofoxService = OfoxService.getInstance()

// 导出类型
export default OfoxService
