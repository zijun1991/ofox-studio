import { loggerService } from '@logger'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { BuiltinMCPServerName } from '@types'
import { BuiltinMCPServerNames } from '@types'

import BraveSearchServer from './brave-search'
import CoworkerServer from './coworker'
import DiDiMcpServer from './didi-mcp'
import DifyKnowledgeServer from './dify-knowledge'
import FetchServer from './fetch'
import FileSystemServer from './filesystem'
import HubServer from './hub'
import LlmServer from './llm'
import MemoryServer from './memory'
import PythonServer from './python'
import SchedulerServer from './scheduler'
import ThinkingServer from './sequentialthinking'
import WebviewServer from './webview'

const logger = loggerService.withContext('MCPFactory')

export function createInMemoryMCPServer(
  name: BuiltinMCPServerName,
  args: string[] = [],
  envs: Record<string, string> = {}
): Server {
  logger.debug(`[MCP] Creating in-memory MCP server: ${name} with args: ${args} and envs: ${JSON.stringify(envs)}`)
  switch (name) {
    case BuiltinMCPServerNames.memory: {
      const envPath = envs.MEMORY_FILE_PATH
      return new MemoryServer(envPath).server
    }
    case BuiltinMCPServerNames.sequentialThinking: {
      return new ThinkingServer().server
    }
    case BuiltinMCPServerNames.braveSearch: {
      return new BraveSearchServer(envs.BRAVE_API_KEY).server
    }
    case BuiltinMCPServerNames.fetch: {
      return new FetchServer().server
    }
    case BuiltinMCPServerNames.filesystem: {
      return new FileSystemServer(envs.WORKSPACE_ROOT).server
    }
    case BuiltinMCPServerNames.difyKnowledge: {
      const difyKey = envs.DIFY_KEY
      return new DifyKnowledgeServer(difyKey, args).server
    }
    case BuiltinMCPServerNames.python: {
      return new PythonServer().server
    }
    case BuiltinMCPServerNames.didiMCP: {
      const apiKey = envs.DIDI_API_KEY
      return new DiDiMcpServer(apiKey).server
    }
    case BuiltinMCPServerNames.hub: {
      return new HubServer().server
    }
    case BuiltinMCPServerNames.scheduler: {
      return new SchedulerServer().server
    }
    case BuiltinMCPServerNames.webview: {
      return new WebviewServer().server
    }
    case BuiltinMCPServerNames.llm: {
      return new LlmServer().server
    }
    case BuiltinMCPServerNames.coworker: {
      return new CoworkerServer(envs.COWORKER_BASE_URL, envs.COWORKER_TOKEN).server
    }
    default:
      throw new Error(`Unknown in-memory MCP server: ${name}`)
  }
}
