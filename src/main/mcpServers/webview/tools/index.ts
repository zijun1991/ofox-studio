import type { WebviewController } from '../controller'
import { cdpSendToolDefinition, handleCdpSend } from './cdp-send'
import { closeToolDefinition, handleClose } from './close'
import { cookiesToolDefinition, handleCookies } from './cookies'
import { createToolDefinition, handleCreate } from './create'
import { evaluateToolDefinition, handleEvaluate } from './evaluate'
import { handleInput, inputToolDefinition } from './input'
import { handleList, listToolDefinition } from './list'
import { handleLock, handleUnlock, lockToolDefinition, unlockToolDefinition } from './lock'
import { handleNavigate, navigateToolDefinition } from './navigate'
import { handleScreenshot, screenshotToolDefinition } from './screenshot'

export const toolDefinitions = [
  createToolDefinition,
  listToolDefinition,
  navigateToolDefinition,
  closeToolDefinition,
  evaluateToolDefinition,
  cdpSendToolDefinition,
  screenshotToolDefinition,
  inputToolDefinition,
  cookiesToolDefinition,
  lockToolDefinition,
  unlockToolDefinition
]

export const toolHandlers: Record<
  string,
  (
    controller: WebviewController,
    args: unknown
  ) => Promise<{ content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError: boolean }>
> = {
  webview_create: handleCreate,
  webview_list: handleList,
  webview_navigate: handleNavigate,
  webview_close: handleClose,
  webview_evaluate: handleEvaluate,
  cdp_send: handleCdpSend,
  webview_screenshot: handleScreenshot,
  webview_input: handleInput,
  webview_cookies: handleCookies,
  webview_lock: handleLock,
  webview_unlock: handleUnlock
}
