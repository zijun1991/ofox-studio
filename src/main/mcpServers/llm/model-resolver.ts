import { ChatOpenAI } from '@langchain/openai'
import {
  getAvailableProviders,
  getRealProviderModel,
  listAllAvailableModels,
  validateModelId
} from '@main/apiServer/utils'

import { DEFAULT_TEMPERATURE, logger } from './types'

export async function resolveModelToChat(modelStr: string, temperature?: number): Promise<ChatOpenAI> {
  const validation = await validateModelId(modelStr)
  if (!validation.valid) {
    throw new Error(validation.error?.message ?? 'Invalid model ID')
  }

  const provider = validation.provider!
  const modelId = getRealProviderModel(modelStr)

  if (provider.type !== 'openai') {
    throw new Error(
      `Provider '${provider.id}' type '${provider.type}' is not OpenAI-compatible. Only OpenAI-compatible providers are supported.`
    )
  }

  const apiKey = provider.apiKey

  if (!apiKey) {
    throw new Error(`API key is missing for provider '${provider.id}'. Please configure the API key in settings.`)
  }

  logger.info('Resolved model', { providerId: provider.id, modelId })

  return new ChatOpenAI({
    model: modelId,
    apiKey: apiKey,
    configuration: {
      baseURL: provider.apiHost,
      defaultHeaders: provider.extra_headers || {}
    },
    temperature: temperature ?? DEFAULT_TEMPERATURE
  })
}

export interface AvailableModel {
  id: string
  name: string
  provider_id: string
  provider_name: string
}

export async function listOpenAICompatibleModels(): Promise<AvailableModel[]> {
  const providers = await getAvailableProviders()
  const openaiProviders = providers.filter((p) => p.type === 'openai')
  const models = await listAllAvailableModels(openaiProviders)

  return models.map((m) => ({
    id: `${m.provider}:${m.id}`,
    name: m.name || m.id,
    provider_id: m.provider,
    provider_name: openaiProviders.find((p) => p.id === m.provider)?.name || m.provider
  }))
}
