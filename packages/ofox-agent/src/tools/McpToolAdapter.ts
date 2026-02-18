/**
 * MCP Tool 适配器
 * 将 MCP 工具转换为统一的 ToolDefinition 格式
 */

import type { MCPCallToolResponse, MCPTool, ToolDefinition } from '../types/tool'

/**
 * MCP 服务接口（简化版）
 * 实际使用时需要注入 Cherry Studio 的 MCPService
 */
export interface IMcpService {
  listAllActiveServerTools(): Promise<MCPTool[]>
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPCallToolResponse>
}

/**
 * MCP Tool 适配器
 */
export class McpToolAdapter {
  /**
   * 将 MCP Tool 转换为统一 ToolDefinition
   */
  static toToolDefinition(mcpTool: MCPTool): ToolDefinition {
    return {
      name: mcpTool.id, // 使用 serverId__toolName 格式作为唯一标识
      description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
      parameters: mcpTool.inputSchema,
      execute: undefined // MCP 工具的执行由 McpService 处理
    }
  }

  /**
   * 批量转换 MCP Tools
   */
  static toToolDefinitions(mcpTools: MCPTool[]): ToolDefinition[] {
    return mcpTools.map((tool) => this.toToolDefinition(tool))
  }

  /**
   * 创建 MCP 工具执行器
   * 返回一个可以在 ToolRegistry 中使用的执行函数
   */
  static createExecutor(
    mcpService: IMcpService,
    serverId: string,
    toolName: string
  ): (args: Record<string, unknown>) => Promise<string> {
    return async (args: Record<string, unknown>) => {
      try {
        const response = await mcpService.callTool(serverId, toolName, args)
        return this.extractContent(response)
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 创建完整的 MCP ToolDefinition（带执行函数）
   */
  static createExecutableToolDefinition(mcpTool: MCPTool, mcpService: IMcpService): ToolDefinition {
    const toolDef = this.toToolDefinition(mcpTool)
    toolDef.execute = this.createExecutor(mcpService, mcpTool.serverId, mcpTool.name)
    return toolDef
  }

  /**
   * 从 MCP 响应中提取内容
   */
  static extractContent(response: MCPCallToolResponse): string {
    if (!response.content || response.content.length === 0) {
      return ''
    }

    // 提取文本内容
    const textParts = response.content.filter((c) => c.type === 'text' && c.text).map((c) => c.text as string)

    if (textParts.length > 0) {
      return textParts.join('\n')
    }

    // 如果有图片或其他资源，返回 JSON 表示
    return JSON.stringify(response.content, null, 2)
  }

  /**
   * 获取所有 MCP 工具（带执行函数）
   */
  static async getAllMcpToolsWithExecutor(mcpService: IMcpService): Promise<ToolDefinition[]> {
    const mcpTools = await mcpService.listAllActiveServerTools()
    return mcpTools.map((tool) => this.createExecutableToolDefinition(tool, mcpService))
  }
}
