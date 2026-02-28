import { mkdir, writeFile } from 'fs/promises'
import { dirname } from 'path'
import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, imageResponse, successResponse } from './utils'

export const ScreenshotSchema = z.object({
  webviewId: z.string().describe('ID of the webview'),
  format: z.enum(['png', 'jpeg']).optional().describe('Image format (default: png)'),
  quality: z.number().min(1).max(100).optional().describe('JPEG quality 1-100 (default: 80)'),
  savePath: z
    .string()
    .optional()
    .describe('Absolute path to save the screenshot file. If provided, returns the file path instead of base64 image.')
})

export const screenshotToolDefinition = {
  name: 'webview_screenshot',
  description:
    'Take a screenshot of a webview. Does not change the lock state. Returns a base64-encoded image, or saves to file and returns the file path if savePath is provided.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview' },
      format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format (default: png)' },
      quality: { type: 'number', description: 'JPEG quality 1-100 (default: 80)' },
      savePath: {
        type: 'string',
        description:
          'Absolute path to save the screenshot file. If provided, returns the file path instead of base64 image.'
      }
    },
    required: ['webviewId']
  }
}

export async function handleScreenshot(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, format, quality, savePath } = ScreenshotSchema.parse(args)
    const base64 = await controller.screenshot(webviewId, { format, quality })

    if (savePath) {
      await mkdir(dirname(savePath), { recursive: true })
      await writeFile(savePath, Buffer.from(base64, 'base64'))
      return successResponse(savePath)
    }

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    return imageResponse(base64, mimeType)
  } catch (error) {
    logger.error('webview_screenshot failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
