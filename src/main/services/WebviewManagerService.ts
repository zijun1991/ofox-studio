import { loggerService } from '@logger'
import { isDev } from '@main/constant'
import { getWebviewController } from '@main/mcpServers/webview'
import { IpcChannel } from '@shared/IpcChannel'
import { BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'

const logger = loggerService.withContext('WebviewManagerService')

let managerWindow: BrowserWindow | null = null

export function openWebviewManagerWindow() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show()
    managerWindow.focus()
    return
  }

  managerWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    titleBarOverlay: { height: 40 },
    resizable: true,
    maximizable: true,
    title: 'WebView Manager',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
      webviewTag: true
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    managerWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/webviewManager.html')
  } else {
    managerWindow.loadFile(path.join(__dirname, '../renderer/webviewManager.html'))
  }

  managerWindow.once('ready-to-show', () => {
    managerWindow?.show()
  })

  managerWindow.on('closed', () => {
    managerWindow = null
  })

  logger.info('WebView Manager window opened')
}

function sendToManager(channel: string, ...args: unknown[]) {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send(channel, ...args)
  }
}

export function registerWebviewManagerIpc() {
  const controller = getWebviewController()

  // Relay change events to manager window
  controller.onChanged(() => {
    sendToManager(IpcChannel.WebviewManager_OnChange, controller.list())
  })

  // Relay screenshot stream to manager window
  controller.onScreenshot((webviewId, base64) => {
    sendToManager(IpcChannel.WebviewManager_Screenshot, { webviewId, base64 })
  })

  ipcMain.handle(IpcChannel.WebviewManager_Open, () => {
    openWebviewManagerWindow()
  })

  ipcMain.handle(IpcChannel.WebviewManager_List, () => {
    return controller.list()
  })

  ipcMain.handle(IpcChannel.WebviewManager_Create, async (_event, options: { name?: string; url?: string }) => {
    const info = await controller.create(options)
    return {
      id: info.id,
      name: info.name,
      partition: info.partition,
      url: info.url
    }
  })

  ipcMain.handle(IpcChannel.WebviewManager_Close, (_event, webviewId: string) => {
    controller.destroyWebview(webviewId)
  })

  ipcMain.handle(IpcChannel.WebviewManager_Show, async (_event, webviewId: string) => {
    await controller.showWindow(webviewId)
  })

  logger.info('WebView Manager IPC handlers registered')
}
