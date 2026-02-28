import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { Server as MCServer } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { app } from 'electron'

import { WebviewController } from './controller'
import { toolDefinitions, toolHandlers } from './tools'

let sharedController: WebviewController | null = null

export function getWebviewController(): WebviewController {
  if (!sharedController) {
    sharedController = new WebviewController()
  }
  return sharedController
}

export class WebviewServer {
  public server: Server
  public controller: WebviewController

  constructor() {
    this.controller = getWebviewController()

    const server = new MCServer(
      {
        name: '@ofox/webview',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: toolDefinitions
      }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      const handler = toolHandlers[name]
      if (!handler) {
        throw new Error(`Tool not found: ${name}`)
      }
      return handler(this.controller, args)
    })

    app.on('before-quit', () => {
      this.controller.destroyAll()
    })

    this.server = server
  }
}

export default WebviewServer
