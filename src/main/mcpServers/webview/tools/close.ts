import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, successResponse } from './utils'

export const CloseSchema = z.object({
  webviewId: z.string().describe('ID of the webview to close')
})

export const closeToolDefinition = {
  name: 'webview_close',
  description: 'Close and destroy a webview, releasing all associated resources and session data.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview to close' }
    },
    required: ['webviewId']
  }
}

export async function handleClose(controller: WebviewController, args: unknown) {
  try {
    const { webviewId } = CloseSchema.parse(args)
    controller.destroyWebview(webviewId)
    return successResponse(`Webview ${webviewId} closed successfully`)
  } catch (error) {
    logger.error('webview_close failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
