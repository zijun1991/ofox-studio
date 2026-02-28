import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, successResponse } from './utils'

export const EvaluateSchema = z.object({
  webviewId: z.string().describe('ID of the webview'),
  expression: z.string().describe('JavaScript expression to evaluate in the page context'),
  timeout: z.number().optional().describe('Execution timeout in ms (default: 5000)')
})

export const evaluateToolDefinition = {
  name: 'webview_evaluate',
  description:
    'Execute JavaScript in a webview page context via CDP Runtime.evaluate. Auto-locks the webview. Returns the evaluated result.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview' },
      expression: {
        type: 'string',
        description:
          'JavaScript to evaluate. Examples: document.body.innerText, document.querySelector("button").click(), document.title'
      },
      timeout: { type: 'number', description: 'Execution timeout in ms (default: 5000)' }
    },
    required: ['webviewId', 'expression']
  }
}

export async function handleEvaluate(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, expression, timeout } = EvaluateSchema.parse(args)
    const value = await controller.evaluate(webviewId, expression, timeout)
    return successResponse(typeof value === 'string' ? value : JSON.stringify(value))
  } catch (error) {
    logger.error('webview_evaluate failed', { error, expression: (args as any)?.expression?.slice(0, 100) })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
