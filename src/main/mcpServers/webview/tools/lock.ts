import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, successResponse } from './utils'

export const LockSchema = z.object({
  webviewId: z.string().describe('ID of the webview to lock')
})

export const UnlockSchema = z.object({
  webviewId: z.string().describe('ID of the webview to unlock'),
  message: z
    .string()
    .optional()
    .describe('Message to show the user explaining what manual action is needed (e.g. "Please complete the login")')
})

export const lockToolDefinition = {
  name: 'webview_lock',
  description:
    'Explicitly lock a webview for agent control. While locked, the management window shows a screenshot stream and the user cannot interact. Most operation tools auto-lock, so this is mainly for re-locking after an unlock.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview to lock' }
    },
    required: ['webviewId']
  }
}

export const unlockToolDefinition = {
  name: 'webview_unlock',
  description:
    'Unlock a webview to allow manual user interaction via the management window. Use this when you need the user to perform actions like logging in, solving CAPTCHAs, or other manual tasks. The management window will switch from screenshot preview to an interactive embedded webview sharing the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview to unlock' },
      message: {
        type: 'string',
        description: 'Message to show the user explaining what manual action is needed'
      }
    },
    required: ['webviewId']
  }
}

export async function handleLock(controller: WebviewController, args: unknown) {
  try {
    const { webviewId } = LockSchema.parse(args)
    controller.setLocked(webviewId, true)
    return successResponse(`Webview ${webviewId} locked for agent control`)
  } catch (error) {
    logger.error('webview_lock failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}

export async function handleUnlock(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, message } = UnlockSchema.parse(args)
    controller.setLocked(webviewId, false, message)
    return successResponse(
      `Webview ${webviewId} unlocked for manual interaction${message ? `. User prompt: "${message}"` : ''}`
    )
  } catch (error) {
    logger.error('webview_unlock failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
