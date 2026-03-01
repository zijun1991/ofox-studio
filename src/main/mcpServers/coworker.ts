import { loggerService } from '@logger'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const logger = loggerService.withContext('CoworkerMCPServer')

export class CoworkerServer {
  private _server: Server
  private readonly baseUrl: string
  private readonly token: string
  private cachedTools: any[] | null = null

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || 'http://192.168.0.51:8003'
    this.token = token || ''

    this._server = new Server({ name: '@ofox/coworker', version: '1.0.0' }, { capabilities: { tools: {} } })
    this.setupHandlers()
  }

  get server(): Server {
    return this._server
  }

  private get mcpEndpoint(): string {
    return `${this.baseUrl}/api/mcp/`
  }

  /** Forward JSON-RPC request to Coworker HTTP MCP endpoint */
  private async rpcCall(method: string, params?: Record<string, unknown>): Promise<any> {
    const response = await fetch(this.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        ...(params ? { params } : {})
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Coworker MCP HTTP ${response.status}: ${text}`)
    }

    const data = await response.json()
    if (data.error) {
      throw new Error(`Coworker MCP error: ${JSON.stringify(data.error)}`)
    }

    return data.result
  }

  private setupHandlers() {
    // List tools (fetch from remote on first call, then cache)
    this._server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.cachedTools) {
        const result = await this.rpcCall('tools/list')
        this.cachedTools = result.tools || []
        logger.info('Fetched tools from Coworker MCP', { count: this.cachedTools!.length })
      }
      return { tools: this.cachedTools }
    })

    // Forward tool calls
    this._server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      logger.debug('Forwarding tool call to Coworker', { tool: name })

      const result = await this.rpcCall('tools/call', {
        name,
        arguments: { ...args, token: this.token }
      })
      return result
    })
  }
}

export default CoworkerServer
