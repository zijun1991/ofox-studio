/**
 * @ofox/agent - AI Agent with MCP, Skills, Memory and Session Compression
 *
 * @packageDocumentation
 */

// Core
export type { CompressionConfig, CompressionResult, OfoxAgentConfig } from './core'
export { OfoxAgent } from './core/OfoxAgent'
export { SessionCompressor } from './core/SessionCompressor'

// Types
export type {
  MessageRole,
  SessionMessage,
  SessionMessageMetadata,
  StreamChunk,
  ToolCall,
  UnifiedContentPart,
  UnifiedMessage
} from './types/message'
export type {
  GenerateOptions,
  GenerateResult,
  ILlmProvider,
  LlmProviderConfig,
  Model,
  Provider,
  ProviderType
} from './types/provider'
export type {
  CompressedSummaryDocument,
  CreateSessionParams,
  SessionConfig,
  SessionContext,
  SessionDocument,
  SessionMetadata,
  UpdateSessionParams
} from './types/session'
export type {
  MCPCallToolResponse,
  MCPTool,
  ToolCallRequest,
  ToolCallResult,
  ToolDefinition,
  ToolParameterSchema,
  ToolRegistryConfig
} from './types/tool'

// Provider
export { AnthropicProvider } from './provider/AnthropicProvider'
export { GeminiProvider } from './provider/GeminiProvider'
export { LlmProvider } from './provider/LlmProvider'
export { OpenAIProvider } from './provider/OpenAIProvider'
export { ProviderFactory } from './provider/ProviderFactory'

// Storage
export { getOfoxAgentDataPath, LokiStorage } from './storage/LokiStorage'
export type { MemoryConfig, MemoryDocument } from './storage/MemoryStore'
export { MemoryStore } from './storage/MemoryStore'

// Skills
export type { SkillDefinition, SkillExecutionContext, SkillLoaderConfig } from './skills'
export { SkillExecutor } from './skills/SkillExecutor'
export { SkillLoader } from './skills/SkillLoader'

// Tools
export type { IMcpService } from './tools'
export { McpToolAdapter } from './tools/McpToolAdapter'
export { ToolRegistry } from './tools/ToolRegistry'

// Message Converters
export type {
  AnthropicContentBlock,
  AnthropicMessageParam,
  GeminiContent,
  GeminiPart,
  GeminiTool,
  OpenAIContentPart,
  OpenAIMessageParam,
  OpenAIToolCall
} from './messages/converters'
export {
  AnthropicMessageConverter,
  GeminiMessageConverter,
  OpenAIMessageConverter
} from './messages/converters'

// Electron integration
export { OfoxAgentService, ofoxAgentService } from './electron'

// Convenience function for quick chat
import type { OfoxAgentConfig as OfoxAgentConfigType } from './core/OfoxAgent'
import { OfoxAgent as OfoxAgentClass } from './core/OfoxAgent'

/**
 * 快捷聊天函数
 * 创建临时 Agent 并执行单次对话
 */
export async function quickChat(config: OfoxAgentConfigType, sessionId: string, content: string): Promise<string> {
  const agent = new OfoxAgentClass('quick-chat.db', config)
  try {
    await agent.initialize()
    return await agent.chat(sessionId, content)
  } finally {
    await agent.cleanup()
  }
}

// Version info
export const VERSION = '1.0.0'
export const PACKAGE_NAME = '@ofox/agent'
