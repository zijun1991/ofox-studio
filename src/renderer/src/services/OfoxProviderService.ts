/**
 * Ofox 供应商同步服务
 *
 * 负责从 Ofox 获取模型列表，并同步到 Redux store 中的供应商配置
 */

import { loggerService } from '@logger'
import { OFOX_PROVIDER_CONFIGS, OFOX_SUPPORTED_PROTOCOLS } from '@renderer/config/ofox'
import type { AppDispatch, RootState } from '@renderer/store'
import { addProvider, updateProvider } from '@renderer/store/llm'
import type {
  EndpointType,
  Model,
  ModelCapability,
  ModelPricing,
  OfoxModel,
  OfoxModelCapabilities,
  OfoxModelPricing,
  Provider
} from '@renderer/types'

const logger = loggerService.withContext('OfoxProviderService')

/**
 * Ofox 供应商同步服务
 * 单例模式，负责将 Ofox 模型同步到本地供应商配置
 */
class OfoxProviderService {
  private static instance: OfoxProviderService
  private initialized = false

  private constructor() {}

  static getInstance(): OfoxProviderService {
    if (!OfoxProviderService.instance) {
      OfoxProviderService.instance = new OfoxProviderService()
    }
    return OfoxProviderService.instance
  }

  /**
   * 初始化 Ofox providers（不依赖网络请求）
   * 在应用启动时立即调用，创建带有空模型列表的 providers
   * @param dispatch Redux dispatch 函数
   */
  initializeProviders(dispatch: AppDispatch): void {
    if (this.initialized) {
      return
    }

    logger.info('Initializing Ofox providers...')

    const state = window.store?.getState() as RootState
    const currentProviders = state?.llm?.providers || []

    for (const protocol of OFOX_SUPPORTED_PROTOCOLS) {
      const config = OFOX_PROVIDER_CONFIGS[protocol]
      const providerId = config.id

      // 检查供应商是否已存在
      const existingProvider = currentProviders.find((p) => p.id === providerId)

      if (!existingProvider) {
        // 创建空的 provider，models 列表为空，apiKey 由用户在设置中配置（persist 恢复）
        const newProvider: Provider = {
          id: providerId,
          name: config.name,
          type: config.type,
          apiKey: '',
          apiHost: config.apiHost,
          models: [],
          enabled: true,
          isSystem: true
        }
        dispatch(addProvider(newProvider))
        logger.info(`Initialized empty provider ${providerId}`)
      }
    }

    this.initialized = true
    logger.info('Ofox providers initialization completed')
  }

  /**
   * 同步 Ofox 供应商和模型到 Redux store
   * @param dispatch Redux dispatch 函数
   */
  async syncProviders(dispatch: AppDispatch): Promise<void> {
    try {
      logger.info('Starting Ofox provider sync...')

      // 1. 获取 Ofox 模型列表
      const response = await window.api.ofox.getModels()
      if (!response.success || !response.data) {
        logger.error('Failed to fetch Ofox models:', response.error)
        return
      }

      const ofoxModels = response.data
      logger.info(`Fetched ${ofoxModels.length} models from Ofox`)

      // 2. 获取当前 providers 状态
      const state = window.store?.getState() as RootState
      const currentProviders = state?.llm?.providers || []

      // 从已有的 OFOX provider 读取 apiKey（用于新建 provider 时继承）
      const existingOfoxProvider = currentProviders.find((p) => p.id === 'ofox-openai')

      // 3. 为每个支持的协议创建或更新供应商
      for (const protocol of OFOX_SUPPORTED_PROTOCOLS) {
        const config = OFOX_PROVIDER_CONFIGS[protocol]
        const providerId = config.id

        // 筛选支持该协议的模型
        const protocolModels = this.filterModelsByProtocol(ofoxModels, protocol)
        const convertedModels = protocolModels.map((m) => this.convertToModel(m, protocol))

        logger.debug(`Protocol ${protocol}: ${convertedModels.length} models`)

        // 检查供应商是否已存在
        const existingProvider = currentProviders.find((p) => p.id === providerId)

        if (existingProvider) {
          // 更新现有供应商的模型和 apiHost（不覆盖 apiKey，由用户在设置中管理）
          dispatch(
            updateProvider({
              id: providerId,
              models: convertedModels,
              apiHost: config.apiHost
            })
          )
          logger.debug(`Updated provider ${providerId} with ${convertedModels.length} models`)
        } else {
          // 创建新供应商，从已有 OFOX provider 继承 apiKey
          const newProvider: Provider = {
            id: providerId,
            name: config.name,
            type: config.type,
            apiKey: existingOfoxProvider?.apiKey || '',
            apiHost: config.apiHost,
            models: convertedModels,
            enabled: true,
            isSystem: true
          }
          dispatch(addProvider(newProvider))
          logger.info(`Created new provider ${providerId} with ${convertedModels.length} models`)
        }
      }

      logger.info('Ofox provider sync completed successfully')
    } catch (error) {
      logger.error('Failed to sync Ofox providers:', error as Error)
      throw error
    }
  }

  /**
   * 按协议筛选模型
   * @param models Ofox 模型列表
   * @param protocol 协议名称
   * @returns 支持该协议的模型列表
   */
  private filterModelsByProtocol(models: OfoxModel[], protocol: string): OfoxModel[] {
    return models.filter((model) => model.supported_protocols?.includes(protocol))
  }

  /**
   * 将 OfoxModel 转换为应用内的 Model 类型
   * @param ofoxModel Ofox 模型
   * @param protocol 协议名称
   * @returns 转换后的 Model
   */
  private convertToModel(ofoxModel: OfoxModel, protocol: string): Model {
    const providerId = OFOX_PROVIDER_CONFIGS[protocol as keyof typeof OFOX_PROVIDER_CONFIGS]?.id || `ofox-${protocol}`

    return {
      id: ofoxModel.id,
      provider: providerId,
      name: ofoxModel.display_name,
      group: ofoxModel.series || 'default',
      owned_by: ofoxModel.owned_by,
      description: ofoxModel.description,
      endpoint_type: this.mapEndpointType(protocol),
      capabilities: this.mapCapabilities(ofoxModel.capabilities),
      pricing: this.convertPricing(ofoxModel.pricing),
      context_window: ofoxModel.context_window
    }
  }

  /**
   * 转换 Ofox 定价信息为应用内的 ModelPricing
   * Ofox API 返回的是每 token 价格（字符串），需要转换为每百万 token 价格
   * @param ofoxPricing Ofox 定价信息
   * @returns ModelPricing 或 undefined
   */
  private convertPricing(ofoxPricing?: OfoxModelPricing): ModelPricing | undefined {
    if (!ofoxPricing) return undefined

    const inputPerToken = parseFloat(ofoxPricing.input) || 0
    const outputPerToken = parseFloat(ofoxPricing.output) || 0

    // 如果价格都是 0，返回 undefined
    if (inputPerToken === 0 && outputPerToken === 0) return undefined

    return {
      input_per_million_tokens: inputPerToken * 1_000_000,
      output_per_million_tokens: outputPerToken * 1_000_000
    }
  }

  /**
   * 映射协议到端点类型
   * @param protocol 协议名称
   * @returns 端点类型
   */
  private mapEndpointType(protocol: string): EndpointType {
    const mapping: Record<string, EndpointType> = {
      openai: 'openai',
      anthropic: 'anthropic',
      gemini: 'gemini'
    }
    return mapping[protocol] || 'openai'
  }

  /**
   * 映射 Ofox 能力到应用内的 ModelCapability
   * @param capabilities Ofox 模型能力
   * @returns ModelCapability 数组
   */
  private mapCapabilities(capabilities?: OfoxModelCapabilities): ModelCapability[] {
    if (!capabilities) return []

    const result: ModelCapability[] = []

    if (capabilities.vision) {
      result.push({ type: 'vision' })
    }
    if (capabilities.function_calling) {
      result.push({ type: 'function_calling' })
    }
    if (capabilities.reasoning) {
      result.push({ type: 'reasoning' })
    }
    if (capabilities.web_search) {
      result.push({ type: 'web_search' })
    }

    return result
  }
}

export default OfoxProviderService
