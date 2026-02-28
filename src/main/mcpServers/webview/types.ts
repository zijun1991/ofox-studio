import { loggerService } from '@logger'
import type { BaseWindow, WebContentsView } from 'electron'

export const logger = loggerService.withContext('MCPWebview')

export interface WebviewInfo {
  id: string
  name: string
  partition: string
  url: string
  title: string
  createdAt: number
  lastActiveAt: number
  locked: boolean
  unlockMessage?: string
  window: BaseWindow | null
  view: WebContentsView
  debuggerAttached: boolean
  cdpDomainsEnabled: Set<string>
  viewportSize: { width: number; height: number }
  screenshotTimer?: ReturnType<typeof setInterval>
}
