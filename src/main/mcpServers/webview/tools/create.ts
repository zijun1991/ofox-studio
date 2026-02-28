import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, jsonResponse } from './utils'

export const CreateSchema = z.object({
  name: z.string().optional().describe('Human-readable name for the webview'),
  url: z.string().optional().describe('Initial URL to navigate to'),
  width: z.number().optional().describe('Viewport width (default: 1280)'),
  height: z.number().optional().describe('Viewport height (default: 800)'),
  userAgent: z.string().optional().describe('Custom user agent string'),
  showWindow: z.boolean().optional().describe('Show a visible window (default: false)')
})

export const createToolDefinition = {
  name: 'webview_create',
  description:
    'Create a new isolated webview with an ephemeral session (cookies, localStorage, cache are all isolated and not persisted to disk). The webview starts in locked (agent-controlled) mode. Returns the webview ID and info.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human-readable name for the webview' },
      url: { type: 'string', description: 'Initial URL to navigate to' },
      width: { type: 'number', description: 'Viewport width (default: 1280)' },
      height: { type: 'number', description: 'Viewport height (default: 800)' },
      userAgent: { type: 'string', description: 'Custom user agent string' },
      showWindow: { type: 'boolean', description: 'Show a visible window (default: false)' }
    }
  }
}

export async function handleCreate(controller: WebviewController, args: unknown) {
  try {
    const options = CreateSchema.parse(args)
    const info = await controller.create(options)
    return jsonResponse({
      id: info.id,
      name: info.name,
      partition: info.partition,
      url: info.url,
      title: info.title,
      locked: info.locked,
      viewportSize: info.viewportSize
    })
  } catch (error) {
    logger.error('webview_create failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
