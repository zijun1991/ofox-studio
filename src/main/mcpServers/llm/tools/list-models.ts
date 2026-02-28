import { listOpenAICompatibleModels } from '../model-resolver'
import { logger } from '../types'
import { errorResponse, jsonResponse } from './utils'

export const listModelsToolDefinition = {
  name: 'list_models',
  description:
    "List all available OpenAI-compatible models configured in Ofox Studio. Returns model IDs in 'provider:model_id' format that can be used with the chat tool.",
  inputSchema: {
    type: 'object' as const,
    properties: {}
  }
}

export async function handleListModels() {
  try {
    const models = await listOpenAICompatibleModels()
    logger.info('Listed models', { count: models.length })
    return jsonResponse({ models, total: models.length })
  } catch (error) {
    logger.error('Failed to list models', { error })
    return errorResponse(error)
  }
}
