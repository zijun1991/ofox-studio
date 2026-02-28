import * as z from 'zod'

import { ALLOWED_CDP_DOMAINS } from '../constants'
import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, jsonResponse } from './utils'

export const CdpSendSchema = z.object({
  webviewId: z.string().describe('ID of the webview'),
  method: z.string().describe('CDP method name (e.g. "DOM.getDocument", "Network.enable")'),
  params: z.record(z.string(), z.unknown()).optional().describe('CDP method parameters')
})

export const cdpSendToolDefinition = {
  name: 'cdp_send',
  description: `Send a raw Chrome DevTools Protocol command to a webview. Auto-locks the webview. Allowed CDP domains: ${ALLOWED_CDP_DOMAINS.join(', ')}. Use this for advanced operations like network interception, DOM queries, device emulation, etc.`,
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview' },
      method: {
        type: 'string',
        description: 'CDP method name (e.g. "DOM.getDocument", "Network.enable", "Input.dispatchMouseEvent")'
      },
      params: {
        type: 'object',
        description: 'CDP method parameters (optional)',
        additionalProperties: true
      }
    },
    required: ['webviewId', 'method']
  }
}

export async function handleCdpSend(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, method, params } = CdpSendSchema.parse(args)
    const result = await controller.cdpSend(webviewId, method, params)
    return jsonResponse(result)
  } catch (error) {
    logger.error('cdp_send failed', { error, method: (args as any)?.method })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
