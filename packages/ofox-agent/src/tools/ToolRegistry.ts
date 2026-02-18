/**
 * Tool 注册表
 * 管理所有可用工具
 */

import type { ToolCallRequest, ToolCallResult, ToolDefinition } from '../types/tool'

/**
 * 工具注册表配置
 */
export interface ToolRegistryConfig {
  /** 是否启用内置工具 */
  enableBuiltinTools?: boolean
  /** 自定义工具 */
  customTools?: ToolDefinition[]
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()

  constructor(config?: ToolRegistryConfig) {
    // 注册自定义工具
    if (config?.customTools) {
      for (const tool of config.customTools) {
        this.register(tool)
      }
    }
  }

  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool already registered: ${tool.name}`)
      return
    }
    this.tools.set(tool.name, tool)
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /**
   * 获取工具
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  /**
   * 获取所有工具
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取所有工具定义（用于 LLM API）
   */
  getAllForLLM(): ToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 移除工具
   */
  remove(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear()
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size
  }

  /**
   * 执行工具调用
   */
  async execute(request: ToolCallRequest): Promise<ToolCallResult> {
    const tool = this.tools.get(request.name)

    if (!tool) {
      return {
        id: request.id,
        name: request.name,
        result: `Error: Tool not found: ${request.name}`,
        isError: true
      }
    }

    if (!tool.execute) {
      return {
        id: request.id,
        name: request.name,
        result: `Error: Tool has no execute function: ${request.name}`,
        isError: true
      }
    }

    try {
      const result = await tool.execute(request.arguments)
      return {
        id: request.id,
        name: request.name,
        result: typeof result === 'string' ? result : JSON.stringify(result),
        isError: false
      }
    } catch (error) {
      return {
        id: request.id,
        name: request.name,
        result: `Error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true
      }
    }
  }

  /**
   * 批量执行工具调用
   */
  async executeAll(requests: ToolCallRequest[]): Promise<ToolCallResult[]> {
    return Promise.all(requests.map((r) => this.execute(r)))
  }
}
