import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { Server as MCServer } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { toolDefinitions, toolHandlers } from './tools'

export class LlmServer {
  public server: Server

  constructor() {
    const server = new MCServer(
      {
        name: '@ofox/llm',
        version: '0.1.0'
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
        throw new Error(`Unknown tool: ${name}`)
      }
      return handler(args)
    })

    this.server = server
  }
}

export default LlmServer
