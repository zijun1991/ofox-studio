import { randomUUID } from 'crypto'
import { app, BaseWindow, session, WebContentsView } from 'electron'

import { ALLOWED_CDP_DOMAINS, BLOCKED_CDP_DOMAINS, DEFAULT_VIEWPORT, IDLE_TIMEOUT_MS, MAX_WEBVIEWS } from './constants'
import { logger, type WebviewInfo } from './types'

type WebviewManagerChangeCallback = () => void
type ScreenshotCallback = (webviewId: string, base64: string) => void

export class WebviewController {
  private webviews: Map<string, WebviewInfo> = new Map()
  private onChangeCallbacks: WebviewManagerChangeCallback[] = []
  private onScreenshotCallbacks: ScreenshotCallback[] = []

  onChanged(cb: WebviewManagerChangeCallback) {
    this.onChangeCallbacks.push(cb)
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((c) => c !== cb)
    }
  }

  onScreenshot(cb: ScreenshotCallback) {
    this.onScreenshotCallbacks.push(cb)
    return () => {
      this.onScreenshotCallbacks = this.onScreenshotCallbacks.filter((c) => c !== cb)
    }
  }

  private emitChange() {
    for (const cb of this.onChangeCallbacks) {
      try {
        cb()
      } catch (e) {
        logger.warn('onChange callback error', { error: e })
      }
    }
  }

  private emitScreenshot(webviewId: string, base64: string) {
    for (const cb of this.onScreenshotCallbacks) {
      try {
        cb(webviewId, base64)
      } catch (e) {
        logger.warn('onScreenshot callback error', { error: e })
      }
    }
  }

  private async ensureAppReady() {
    if (!app.isReady()) {
      await app.whenReady()
    }
  }

  private sweepIdle() {
    const now = Date.now()
    for (const [id, info] of this.webviews.entries()) {
      if (now - info.lastActiveAt > IDLE_TIMEOUT_MS) {
        logger.info('Evicting idle webview', { id, name: info.name })
        this.destroyWebview(id)
      }
    }
  }

  private evictIfNeeded() {
    if (this.webviews.size < MAX_WEBVIEWS) return

    let lruId: string | null = null
    let lruTime = Number.POSITIVE_INFINITY
    for (const [id, info] of this.webviews.entries()) {
      if (info.lastActiveAt < lruTime) {
        lruTime = info.lastActiveAt
        lruId = id
      }
    }
    if (lruId) {
      logger.info('Evicting LRU webview', { id: lruId })
      this.destroyWebview(lruId)
    }
  }

  private getWebview(id: string): WebviewInfo {
    const info = this.webviews.get(id)
    if (!info) {
      throw new Error(`Webview not found: ${id}`)
    }
    return info
  }

  private touch(id: string) {
    const info = this.webviews.get(id)
    if (info) {
      info.lastActiveAt = Date.now()
    }
  }

  private async ensureDebugger(info: WebviewInfo) {
    const dbg = info.view.webContents.debugger
    if (!info.debuggerAttached || !dbg.isAttached()) {
      try {
        if (!dbg.isAttached()) {
          dbg.attach('1.3')
        }
        await dbg.sendCommand('Page.enable')
        await dbg.sendCommand('Runtime.enable')
        info.debuggerAttached = true
        info.cdpDomainsEnabled.add('Page')
        info.cdpDomainsEnabled.add('Runtime')
        logger.info('Debugger attached', { id: info.id })
      } catch (error) {
        logger.error('Failed to attach debugger', { id: info.id, error })
        throw error
      }
    }
  }

  private validateCdpMethod(method: string) {
    const domain = method.split('.')[0]
    if (BLOCKED_CDP_DOMAINS.includes(domain)) {
      throw new Error(`CDP domain '${domain}' is blocked for security reasons`)
    }
    if (!ALLOWED_CDP_DOMAINS.includes(domain)) {
      throw new Error(`CDP domain '${domain}' is not in the allowed list. Allowed: ${ALLOWED_CDP_DOMAINS.join(', ')}`)
    }
  }

  private startScreenshotStream(info: WebviewInfo) {
    this.stopScreenshotStream(info)
    info.screenshotTimer = setInterval(async () => {
      try {
        if (info.view.webContents.isDestroyed()) {
          this.stopScreenshotStream(info)
          return
        }
        await this.ensureDebugger(info)
        const result = (await info.view.webContents.debugger.sendCommand('Page.captureScreenshot', {
          format: 'png'
        })) as { data: string }
        if (!result.data) return
        this.emitScreenshot(info.id, result.data)
      } catch {
        // Ignore screenshot errors
      }
    }, 500)
  }

  private stopScreenshotStream(info: WebviewInfo) {
    if (info.screenshotTimer) {
      clearInterval(info.screenshotTimer)
      info.screenshotTimer = undefined
    }
  }

  setLocked(id: string, locked: boolean, message?: string) {
    const info = this.getWebview(id)
    const wasLocked = info.locked
    info.locked = locked
    info.unlockMessage = locked ? undefined : message

    if (locked && !wasLocked) {
      this.startScreenshotStream(info)
    } else if (!locked && wasLocked) {
      this.stopScreenshotStream(info)
    }

    this.emitChange()
  }

  autoLock(id: string) {
    const info = this.webviews.get(id)
    if (info && !info.locked) {
      this.setLocked(id, true)
    }
  }

  async create(options: {
    name?: string
    url?: string
    width?: number
    height?: number
    userAgent?: string
    showWindow?: boolean
  }): Promise<WebviewInfo> {
    await this.ensureAppReady()
    this.sweepIdle()
    this.evictIfNeeded()

    const id = randomUUID()
    const partition = `webview-${id}`
    const width = options.width ?? DEFAULT_VIEWPORT.width
    const height = options.height ?? DEFAULT_VIEWPORT.height

    const ses = session.fromPartition(partition)

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: true,
        partition,
        additionalArguments: [`--webview-id=${id}`]
      }
    })

    if (options.userAgent) {
      view.webContents.setUserAgent(options.userAgent)
    }

    view.setBounds({ x: 0, y: 0, width, height })

    // Always create a BaseWindow to host the view so capturePage() works.
    // When showWindow is false, the window is hidden (offscreen host).
    const win = new BaseWindow({
      width,
      height,
      show: !!options.showWindow,
      title: options.name || 'WebView'
    })
    win.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width, height })

    win.on('resize', () => {
      if (win.isDestroyed()) return
      const bounds = win.getContentBounds()
      view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
    })

    win.on('closed', () => {
      const info = this.webviews.get(id)
      if (info) {
        info.window = null
      }
    })

    const info: WebviewInfo = {
      id,
      name: options.name || `webview-${id.slice(0, 8)}`,
      partition,
      url: options.url || '',
      title: '',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      locked: true,
      window: win,
      view,
      debuggerAttached: false,
      cdpDomainsEnabled: new Set(),
      viewportSize: { width, height }
    }

    view.webContents.on('page-title-updated', (_event, title) => {
      info.title = title
      this.emitChange()
    })

    view.webContents.on('did-navigate', (_event, url) => {
      info.url = url
      this.emitChange()
    })

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      info.url = url
      this.emitChange()
    })

    this.webviews.set(id, info)

    // Auto-lock on create → start screenshot stream
    this.startScreenshotStream(info)

    if (options.url) {
      try {
        await this.navigate(id, options.url)
      } catch (error) {
        logger.warn('Initial navigation failed', { id, url: options.url, error })
      }
    }

    logger.info('Webview created', {
      id,
      name: info.name,
      partition,
      url: options.url,
      showWindow: !!options.showWindow
    })
    this.emitChange()

    // We don't use ses directly here but it's created via session.fromPartition
    void ses

    return info
  }

  list(): Array<{
    id: string
    name: string
    partition: string
    url: string
    title: string
    createdAt: number
    lastActiveAt: number
    locked: boolean
    unlockMessage?: string
    hasWindow: boolean
    viewportSize: { width: number; height: number }
  }> {
    return Array.from(this.webviews.values()).map((info) => ({
      id: info.id,
      name: info.name,
      partition: info.partition,
      url: info.url,
      title: info.title,
      createdAt: info.createdAt,
      lastActiveAt: info.lastActiveAt,
      locked: info.locked,
      unlockMessage: info.unlockMessage,
      hasWindow: info.window !== null && !info.window.isDestroyed() && info.window.isVisible(),
      viewportSize: info.viewportSize
    }))
  }

  async navigate(id: string, url: string, timeout = 30000): Promise<{ url: string; title: string }> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)

    const wc = info.view.webContents

    let resolved = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let onFinish: () => void
    let onDomReady: () => void
    let onFail: (_event: Electron.Event, code: number, desc: string) => void

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      wc.removeListener('did-finish-load', onFinish)
      wc.removeListener('did-fail-load', onFail)
      wc.removeListener('dom-ready', onDomReady)
    }

    const loadPromise = new Promise<void>((resolve, reject) => {
      onFinish = () => {
        if (resolved) return
        resolved = true
        cleanup()
        resolve()
      }
      onDomReady = () => {
        if (resolved) return
        resolved = true
        cleanup()
        resolve()
      }
      onFail = (_event: Electron.Event, code: number, desc: string) => {
        if (resolved) return
        resolved = true
        cleanup()
        reject(new Error(`Navigation failed (${code}): ${desc}`))
      }
      wc.once('did-finish-load', onFinish)
      wc.once('dom-ready', onDomReady)
      wc.once('did-fail-load', onFail)
    })

    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Navigation timed out')), timeout)
    })

    try {
      await Promise.race([wc.loadURL(url), loadPromise, timeoutPromise])
    } finally {
      cleanup()
    }

    info.url = wc.getURL()
    info.title = wc.getTitle()
    this.emitChange()

    return { url: info.url, title: info.title }
  }

  async evaluate(id: string, expression: string, timeout = 5000): Promise<unknown> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)

    await this.ensureDebugger(info)

    const dbg = info.view.webContents.debugger
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    try {
      const result = await Promise.race([
        dbg.sendCommand('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true
        }),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('Execution timed out')), timeout)
        })
      ])

      const evalResult = result as {
        result?: { value?: unknown; description?: string }
        exceptionDetails?: { exception?: { description?: string } }
      }

      if (evalResult?.exceptionDetails) {
        const message = evalResult.exceptionDetails.exception?.description || 'Unknown script error'
        throw new Error(message)
      }

      return evalResult?.result?.value ?? evalResult?.result?.description ?? null
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }

  async cdpSend(id: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)
    this.validateCdpMethod(method)

    await this.ensureDebugger(info)

    const domain = method.split('.')[0]
    const dbg = info.view.webContents.debugger

    // Auto-enable domain if not yet enabled
    if (!info.cdpDomainsEnabled.has(domain)) {
      try {
        await dbg.sendCommand(`${domain}.enable`)
        info.cdpDomainsEnabled.add(domain)
      } catch {
        // Some domains don't have .enable — that's fine
      }
    }

    return dbg.sendCommand(method, params || {})
  }

  async screenshot(id: string, options?: { format?: 'png' | 'jpeg'; quality?: number }): Promise<string> {
    const info = this.getWebview(id)
    this.touch(id)

    await this.ensureDebugger(info)
    const format = options?.format ?? 'png'
    const captureParams: Record<string, unknown> = { format }
    if (format === 'jpeg') {
      captureParams.quality = options?.quality ?? 80
    }
    const result = (await info.view.webContents.debugger.sendCommand('Page.captureScreenshot', captureParams)) as {
      data: string
    }
    return result.data
  }

  async input(
    id: string,
    actions: Array<{
      type: 'click' | 'type' | 'keyPress' | 'scroll' | 'move'
      x?: number
      y?: number
      text?: string
      key?: string
      deltaX?: number
      deltaY?: number
      button?: 'left' | 'right' | 'middle'
      clickCount?: number
      modifiers?: number
    }>
  ): Promise<void> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)

    await this.ensureDebugger(info)
    const dbg = info.view.webContents.debugger

    for (const action of actions) {
      switch (action.type) {
        case 'click': {
          await dbg.sendCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: action.x ?? 0,
            y: action.y ?? 0,
            button: action.button || 'left',
            clickCount: action.clickCount || 1,
            modifiers: action.modifiers || 0
          })
          await dbg.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: action.x ?? 0,
            y: action.y ?? 0,
            button: action.button || 'left',
            clickCount: action.clickCount || 1,
            modifiers: action.modifiers || 0
          })
          break
        }
        case 'type': {
          if (action.text) {
            for (const char of action.text) {
              await dbg.sendCommand('Input.dispatchKeyEvent', {
                type: 'keyDown',
                text: char,
                unmodifiedText: char
              })
              await dbg.sendCommand('Input.dispatchKeyEvent', {
                type: 'keyUp',
                text: char,
                unmodifiedText: char
              })
            }
          }
          break
        }
        case 'keyPress': {
          if (action.key) {
            await dbg.sendCommand('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: action.key,
              modifiers: action.modifiers || 0
            })
            await dbg.sendCommand('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: action.key,
              modifiers: action.modifiers || 0
            })
          }
          break
        }
        case 'scroll': {
          await dbg.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: action.x ?? 0,
            y: action.y ?? 0,
            deltaX: action.deltaX ?? 0,
            deltaY: action.deltaY ?? 0
          })
          break
        }
        case 'move': {
          await dbg.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: action.x ?? 0,
            y: action.y ?? 0
          })
          break
        }
      }
    }
  }

  async getCookies(id: string, filter?: { url?: string; name?: string; domain?: string }): Promise<Electron.Cookie[]> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)

    const ses = session.fromPartition(info.partition)
    return ses.cookies.get(filter || {})
  }

  async setCookies(id: string, cookies: Electron.CookiesSetDetails[]): Promise<void> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)

    const ses = session.fromPartition(info.partition)
    for (const cookie of cookies) {
      await ses.cookies.set(cookie)
    }
  }

  async removeCookies(id: string, url: string, name: string): Promise<void> {
    const info = this.getWebview(id)
    this.touch(id)
    this.autoLock(id)

    const ses = session.fromPartition(info.partition)
    await ses.cookies.remove(url, name)
  }

  destroyWebview(id: string) {
    const info = this.webviews.get(id)
    if (!info) return

    this.stopScreenshotStream(info)

    try {
      if (!info.view.webContents.isDestroyed()) {
        if (info.view.webContents.debugger.isAttached()) {
          info.view.webContents.debugger.detach()
        }
      }
    } catch (error) {
      logger.warn('Error detaching debugger', { id, error })
    }

    try {
      if (info.window && !info.window.isDestroyed()) {
        info.window.contentView.removeChildView(info.view)
        info.window.close()
      }
    } catch (error) {
      logger.warn('Error closing window', { id, error })
    }

    try {
      if (!info.view.webContents.isDestroyed()) {
        // WebContentsView doesn't have a destroy() method — closing the webContents suffices
        info.view.webContents.close()
      }
    } catch (error) {
      logger.warn('Error destroying view', { id, error })
    }

    this.webviews.delete(id)
    logger.info('Webview destroyed', { id, name: info.name })
    this.emitChange()
  }

  async showWindow(id: string): Promise<void> {
    const info = this.getWebview(id)

    if (info.window && !info.window.isDestroyed()) {
      info.window.show()
      info.window.focus()
      return
    }

    const { width, height } = info.viewportSize
    const win = new BaseWindow({
      width,
      height,
      show: true,
      title: info.name
    })

    win.contentView.addChildView(info.view)
    info.view.setBounds({ x: 0, y: 0, width, height })

    win.on('resize', () => {
      if (win.isDestroyed()) return
      const bounds = win.getContentBounds()
      info.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
      info.viewportSize = { width: bounds.width, height: bounds.height }
    })

    win.on('closed', () => {
      info.window = null
      this.emitChange()
    })

    info.window = win
    this.emitChange()
  }

  destroyAll() {
    const ids = Array.from(this.webviews.keys())
    for (const id of ids) {
      this.destroyWebview(id)
    }
  }
}
