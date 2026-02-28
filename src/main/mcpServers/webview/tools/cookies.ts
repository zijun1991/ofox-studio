import * as z from 'zod'

import type { WebviewController } from '../controller'
import { logger } from '../types'
import { errorResponse, jsonResponse, successResponse } from './utils'

export const CookiesSchema = z.object({
  webviewId: z.string().describe('ID of the webview'),
  operation: z.enum(['get', 'set', 'remove']).describe('Cookie operation: get, set, or remove'),
  url: z.string().optional().describe('URL filter for get/remove operations'),
  name: z.string().optional().describe('Cookie name filter for get, or name for remove'),
  domain: z.string().optional().describe('Domain filter for get operation'),
  cookies: z
    .array(
      z.object({
        url: z.string().describe('URL to associate the cookie with'),
        name: z.string().describe('Cookie name'),
        value: z.string().describe('Cookie value'),
        domain: z.string().optional(),
        path: z.string().optional(),
        secure: z.boolean().optional(),
        httpOnly: z.boolean().optional(),
        sameSite: z.enum(['unspecified', 'no_restriction', 'lax', 'strict']).optional(),
        expirationDate: z.number().optional()
      })
    )
    .optional()
    .describe('Cookies to set (for "set" operation)')
})

export const cookiesToolDefinition = {
  name: 'webview_cookies',
  description:
    'Manage cookies for a webview session. Supports get (list cookies), set (add cookies), and remove (delete a cookie). Auto-locks the webview.',
  inputSchema: {
    type: 'object',
    properties: {
      webviewId: { type: 'string', description: 'ID of the webview' },
      operation: {
        type: 'string',
        enum: ['get', 'set', 'remove'],
        description: 'Cookie operation'
      },
      url: { type: 'string', description: 'URL filter (for get/remove)' },
      name: { type: 'string', description: 'Cookie name filter (for get) or name (for remove)' },
      domain: { type: 'string', description: 'Domain filter (for get)' },
      cookies: {
        type: 'array',
        description: 'Cookies to set (for "set" operation)',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            name: { type: 'string' },
            value: { type: 'string' },
            domain: { type: 'string' },
            path: { type: 'string' },
            secure: { type: 'boolean' },
            httpOnly: { type: 'boolean' },
            sameSite: { type: 'string', enum: ['unspecified', 'no_restriction', 'lax', 'strict'] },
            expirationDate: { type: 'number' }
          },
          required: ['url', 'name', 'value']
        }
      }
    },
    required: ['webviewId', 'operation']
  }
}

export async function handleCookies(controller: WebviewController, args: unknown) {
  try {
    const { webviewId, operation, url, name, domain, cookies } = CookiesSchema.parse(args)

    switch (operation) {
      case 'get': {
        const result = await controller.getCookies(webviewId, { url, name, domain })
        return jsonResponse(result)
      }
      case 'set': {
        if (!cookies || cookies.length === 0) {
          return errorResponse('No cookies provided for set operation')
        }
        await controller.setCookies(webviewId, cookies)
        return successResponse(`Set ${cookies.length} cookie(s) successfully`)
      }
      case 'remove': {
        if (!url || !name) {
          return errorResponse('Both url and name are required for remove operation')
        }
        await controller.removeCookies(webviewId, url, name)
        return successResponse(`Removed cookie "${name}" for ${url}`)
      }
      default:
        return errorResponse(`Unknown operation: ${operation}`)
    }
  } catch (error) {
    logger.error('webview_cookies failed', { error })
    return errorResponse(error instanceof Error ? error : String(error))
  }
}
