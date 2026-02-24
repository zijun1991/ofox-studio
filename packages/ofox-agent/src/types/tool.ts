/**
 * Tool 类型定义
 */

/**
 * 工具参数 Schema（JSON Schema 格式）
 */
export interface ToolParameterSchema {
  type: string
  properties?: Record<
    string,
    {
      type: string
      description?: string
      enum?: string[]
      default?: unknown
    }
  >
  required?: string[]
  description?: string
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 参数 Schema */
  parameters: ToolParameterSchema
  /** 执行函数 */
  execute?: (args: Record<string, unknown>) => Promise<string | unknown>
}

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  /** 调用 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 调用参数 */
  arguments: Record<string, unknown>
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  /** 调用 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 执行结果 */
  result: string
  /** 是否出错 */
  isError?: boolean
}

/**
 * MCP Tool 格式（来自 Ofox Claw）
 */
export interface MCPTool {
  /** 工具 ID（格式：serverId__toolName） */
  id: string
  /** 工具名称 */
  name: string
  /** 所属服务器 ID */
  serverId: string
  /** 工具描述 */
  description?: string
  /** 输入 Schema */
  inputSchema: ToolParameterSchema
}

/**
 * MCP 调用响应
 */
export interface MCPCallToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
}

/**
 * 工具注册表配置
 */
export interface ToolRegistryConfig {
  /** 是否启用内置工具 */
  enableBuiltinTools?: boolean
  /** 是否启用 MCP 工具 */
  enableMcpTools?: boolean
  /** 自定义工具 */
  customTools?: ToolDefinition[]
}
