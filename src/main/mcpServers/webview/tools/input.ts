import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, successResponse } from './utils'

const InputActionSchema = z.object({
  type: z.enum(['click', 'type', 'keyPress', 'scroll', 'move']).describe('Input action type'),
  x: z.number().optional().describe('X coordinate'),
  y: z.number().optional().describe('Y coordinate'),
  text: z.string().optional().describe('Text to type (for "type" action)'),
  key: z.string().optional().describe('Key name (for "keyPress" action, e.g. "Enter", "Tab", "Escape")'),
  deltaX: z.number().optional().describe('Scroll delta X (for "scroll" action)'),
  deltaY: z.number().optional().describe('Scroll delta Y (for "scroll" action)'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button (for "click" action)'),
  clickCount: z.number().optional().describe('Click count, 2 for double-click (for "click" action)'),
  modifiers: z.number().optional().describe('Keyboard modifiers bitmask (1=Alt, 2=Ctrl, 4=Meta, 8=Shift)')
})

export const InputSchema = z.object({
  webviewId: z.string().describe('ID of the webview'),
  actions: z.array(InputActionSchema).describe('Sequence of input actions to perform')
})

export const inputToolDefinition = {
  name: 'webview_input',
  description:
    'Simulate mouse and keyboard input in a webview via CDP Input.dispatch* commands. Auto-locks the webview. Supports click, type, keyPress, scroll, and move actions.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview' },
      actions: {
        type: 'array',
        description: 'Sequence of input actions',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['click', 'type', 'keyPress', 'scroll', 'move'],
              description: 'Action type'
            },
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            text: { type: 'string', description: 'Text to type' },
            key: { type: 'string', description: 'Key name (Enter, Tab, etc.)' },
            deltaX: { type: 'number', description: 'Scroll delta X' },
            deltaY: { type: 'number', description: 'Scroll delta Y' },
            button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button' },
            clickCount: { type: 'number', description: 'Click count' },
            modifiers: { type: 'number', description: 'Keyboard modifiers bitmask' }
          },
          required: ['type']
        }
      }
    },
    required: ['webviewId', 'actions']
  }
}

export async function handleInput(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, actions } = InputSchema.parse(args)
    await controller.input(webviewId, actions)
    return successResponse(`Executed ${actions.length} input action(s) successfully`)
  } catch (error) {
    logger.error('webview_input failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
