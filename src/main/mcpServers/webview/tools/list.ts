import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, jsonResponse } from './utils'

export const listToolDefinition = {
  name: 'webview_list',
  description: 'List all active webviews with their current status, URL, lock state, etc.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}

export async function handleList(controller: WebviewController, _args: unknown) {
  try {
    return jsonResponse(controller.list())
  } catch (error) {
    logger.error('webview_list failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
