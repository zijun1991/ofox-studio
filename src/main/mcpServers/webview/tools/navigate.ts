import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, jsonResponse } from './utils'

export const NavigateSchema = z.object({
  webviewId: z.string().describe('ID of the webview to navigate'),
  url: z.string().describe('URL to navigate to'),
  timeout: z.number().optional().describe('Navigation timeout in ms (default: 30000)')
})

export const navigateToolDefinition = {
  name: 'webview_navigate',
  description: 'Navigate a webview to a URL and wait for the page to load. Auto-locks the webview for agent control.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview to navigate' },
      url: { type: 'string', description: 'URL to navigate to' },
      timeout: { type: 'number', description: 'Navigation timeout in ms (default: 30000)' }
    },
    required: ['webviewId', 'url']
  }
}

export async function handleNavigate(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, url, timeout } = NavigateSchema.parse(args)
    const result = await controller.navigate(webviewId, url, timeout)
    return jsonResponse(result)
  } catch (error) {
    logger.error('webview_navigate failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
