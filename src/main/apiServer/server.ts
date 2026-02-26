import { createServer } from 'node:http'

import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'

import { reduxService } from '../services/ReduxService'
import { windowService } from '../services/WindowService'
import { app } from './app'
import { config } from './config'

const logger = loggerService.withContext('ApiServer')

const GLOBAL_REQUEST_TIMEOUT_MS = 5 * 60_000
const GLOBAL_HEADERS_TIMEOUT_MS = GLOBAL_REQUEST_TIMEOUT_MS + 5_000
const GLOBAL_KEEPALIVE_TIMEOUT_MS = 60_000
const MAX_PORT_RETRIES = 10

export class ApiServer {
  private server: ReturnType<typeof createServer> | null = null

  async start(): Promise<void> {
    if (this.server && this.server.listening) {
      logger.warn('Server already running')
      return
    }

    // Clean up any failed server instance
    if (this.server && !this.server.listening) {
      logger.warn('Cleaning up failed server instance')
      this.server = null
    }

    // Load config
    const { port: configPort, host } = await config.load()

    for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
      const port = configPort + attempt
      try {
        await this.tryListen(host, port)
        if (attempt > 0) {
          logger.info('Port conflict resolved, using fallback port', { configPort, actualPort: port })
          await reduxService.dispatch({
            type: 'settings/setApiServerPort',
            payload: port
          })
        }
        return
      } catch (error: any) {
        if (error.code === 'EADDRINUSE' && attempt < MAX_PORT_RETRIES - 1) {
          logger.warn(`Port ${port} in use, trying next port`)
          continue
        }
        throw error
      }
    }
  }

  private tryListen(host: string, port: number): Promise<void> {
    this.server = createServer(app)
    this.applyServerTimeouts(this.server)

    return new Promise((resolve, reject) => {
      this.server!.listen(port, host, () => {
        logger.info('API server started', { host, port })

        // Notify renderer that API server is ready
        const mainWindow = windowService.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IpcChannel.ApiServer_Ready)
        }

        resolve()
      })

      this.server!.on('error', (error) => {
        // Clean up the server instance if listen fails
        this.server = null
        reject(error)
      })
    })
  }

  private applyServerTimeouts(server: ReturnType<typeof createServer>): void {
    server.requestTimeout = GLOBAL_REQUEST_TIMEOUT_MS
    server.headersTimeout = Math.max(GLOBAL_HEADERS_TIMEOUT_MS, server.requestTimeout + 1_000)
    server.keepAliveTimeout = GLOBAL_KEEPALIVE_TIMEOUT_MS
    server.setTimeout(0)
  }

  async stop(): Promise<void> {
    if (!this.server) return

    return new Promise((resolve) => {
      this.server!.close(() => {
        logger.info('API server stopped')
        this.server = null
        resolve()
      })
    })
  }

  async restart(): Promise<void> {
    await this.stop()
    await config.reload()
    await this.start()
  }

  isRunning(): boolean {
    const hasServer = this.server !== null
    const isListening = this.server?.listening || false
    const result = hasServer && isListening

    logger.debug('isRunning check', { hasServer, isListening, result })

    return result
  }
}

export const apiServer = new ApiServer()
