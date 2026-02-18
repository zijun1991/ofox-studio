/**
 * ToolRegistry 测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToolRegistry } from '../../src/tools/ToolRegistry'
import type { ToolDefinition } from '../../src/types/tool'
import type { ToolCallRequest } from '../../src/types/tool'

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  const mockTool: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'A message' }
      },
      required: ['message']
    }
  }

  const mockToolWithExecutor: ToolDefinition = {
    name: 'executable_tool',
    description: 'A tool with executor',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      }
    },
    execute: vi.fn().mockResolvedValue('Tool executed successfully')
  }

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe('register', () => {
    it('应正确注册工具', () => {
      registry.register(mockTool)

      expect(registry.has('test_tool')).toBe(true)
      expect(registry.get('test_tool')).toEqual(mockTool)
    })

    it('重复注册同一工具时应发出警告', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      registry.register(mockTool)
      registry.register(mockTool)

      expect(warnSpy).toHaveBeenCalledWith('Tool already registered: test_tool')
      expect(registry.size).toBe(1)

      warnSpy.mockRestore()
    })
  })

  describe('registerAll', () => {
    it('应正确批量注册工具', () => {
      const tools: ToolDefinition[] = [
        mockTool,
        { name: 'tool2', description: 'Second tool', parameters: { type: 'object', properties: {} } },
        { name: 'tool3', description: 'Third tool', parameters: { type: 'object', properties: {} } }
      ]

      registry.registerAll(tools)

      expect(registry.size).toBe(3)
      expect(registry.has('test_tool')).toBe(true)
      expect(registry.has('tool2')).toBe(true)
      expect(registry.has('tool3')).toBe(true)
    })
  })

  describe('get', () => {
    it('应正确获取注册的工具', () => {
      registry.register(mockTool)

      const tool = registry.get('test_tool')

      expect(tool).toBeDefined()
      expect(tool?.name).toBe('test_tool')
      expect(tool?.description).toBe('A test tool')
    })

    it('不存在的工具应返回 undefined', () => {
      const tool = registry.get('non_existent')

      expect(tool).toBeUndefined()
    })
  })

  describe('getAll', () => {
    it('应正确获取所有工具', () => {
      registry.register(mockTool)
      registry.register({ name: 'tool2', description: 'Tool 2', parameters: { type: 'object', properties: {} } })

      const tools = registry.getAll()

      expect(tools).toHaveLength(2)
      expect(tools.map((t) => t.name)).toContain('test_tool')
      expect(tools.map((t) => t.name)).toContain('tool2')
    })

    it('空注册表应返回空数组', () => {
      const tools = registry.getAll()

      expect(tools).toEqual([])
    })
  })

  describe('getAllForLLM', () => {
    it('应返回 LLM 格式的工具定义', () => {
      registry.register(mockTool)

      const tools = registry.getAllForLLM()

      expect(tools).toHaveLength(1)
      expect(tools[0]).toEqual({
        name: 'test_tool',
        description: 'A test tool',
        parameters: mockTool.parameters
      })
    })

    it('不应包含 execute 函数', () => {
      registry.register(mockToolWithExecutor)

      const tools = registry.getAllForLLM()

      expect(tools[0]).not.toHaveProperty('execute')
    })
  })

  describe('has', () => {
    it('工具存在时返回 true', () => {
      registry.register(mockTool)

      expect(registry.has('test_tool')).toBe(true)
    })

    it('工具不存在时返回 false', () => {
      expect(registry.has('non_existent')).toBe(false)
    })
  })

  describe('remove', () => {
    it('应正确移除工具', () => {
      registry.register(mockTool)
      expect(registry.has('test_tool')).toBe(true)

      const result = registry.remove('test_tool')

      expect(result).toBe(true)
      expect(registry.has('test_tool')).toBe(false)
    })

    it('移除不存在的工具返回 false', () => {
      const result = registry.remove('non_existent')

      expect(result).toBe(false)
    })
  })

  describe('clear', () => {
    it('应正确清空所有工具', () => {
      registry.register(mockTool)
      registry.register({ name: 'tool2', description: 'Tool 2', parameters: { type: 'object', properties: {} } })
      expect(registry.size).toBe(2)

      registry.clear()

      expect(registry.size).toBe(0)
      expect(registry.getAll()).toEqual([])
    })
  })

  describe('size', () => {
    it('应正确返回工具数量', () => {
      expect(registry.size).toBe(0)

      registry.register(mockTool)
      expect(registry.size).toBe(1)

      registry.register({ name: 'tool2', description: 'Tool 2', parameters: { type: 'object', properties: {} } })
      expect(registry.size).toBe(2)

      registry.remove('test_tool')
      expect(registry.size).toBe(1)
    })
  })

  describe('execute', () => {
    it('应正确执行工具', async () => {
      registry.register(mockToolWithExecutor)

      const request: ToolCallRequest = {
        id: 'call_123',
        name: 'executable_tool',
        arguments: { input: 'test input' }
      }

      const result = await registry.execute(request)

      expect(result.isError).toBe(false)
      expect(result.result).toBe('Tool executed successfully')
      expect(mockToolWithExecutor.execute).toHaveBeenCalledWith({ input: 'test input' })
    })

    it('工具不存在时应返回错误', async () => {
      const request: ToolCallRequest = {
        id: 'call_123',
        name: 'non_existent',
        arguments: {}
      }

      const result = await registry.execute(request)

      expect(result.isError).toBe(true)
      expect(result.result).toContain('Tool not found')
    })

    it('工具没有执行函数时应返回错误', async () => {
      registry.register(mockTool) // 没有 execute 函数

      const request: ToolCallRequest = {
        id: 'call_123',
        name: 'test_tool',
        arguments: {}
      }

      const result = await registry.execute(request)

      expect(result.isError).toBe(true)
      expect(result.result).toContain('no execute function')
    })

    it('执行出错时应捕获错误', async () => {
      const errorTool: ToolDefinition = {
        name: 'error_tool',
        description: 'A tool that throws',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockRejectedValue(new Error('Execution failed'))
      }

      registry.register(errorTool)

      const request: ToolCallRequest = {
        id: 'call_123',
        name: 'error_tool',
        arguments: {}
      }

      const result = await registry.execute(request)

      expect(result.isError).toBe(true)
      expect(result.result).toContain('Execution failed')
    })

    it('应正确处理非字符串返回值', async () => {
      const objectTool: ToolDefinition = {
        name: 'object_tool',
        description: 'Returns an object',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue({ key: 'value', nested: { a: 1 } })
      }

      registry.register(objectTool)

      const request: ToolCallRequest = {
        id: 'call_123',
        name: 'object_tool',
        arguments: {}
      }

      const result = await registry.execute(request)

      expect(result.isError).toBe(false)
      expect(result.result).toBe(JSON.stringify({ key: 'value', nested: { a: 1 } }))
    })
  })

  describe('executeAll', () => {
    it('应正确批量执行工具', async () => {
      const tool1: ToolDefinition = {
        name: 'tool1',
        description: 'Tool 1',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('Result 1')
      }
      const tool2: ToolDefinition = {
        name: 'tool2',
        description: 'Tool 2',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('Result 2')
      }

      registry.register(tool1)
      registry.register(tool2)

      const requests: ToolCallRequest[] = [
        { id: 'call_1', name: 'tool1', arguments: {} },
        { id: 'call_2', name: 'tool2', arguments: {} }
      ]

      const results = await registry.executeAll(requests)

      expect(results).toHaveLength(2)
      expect(results[0].result).toBe('Result 1')
      expect(results[1].result).toBe('Result 2')
    })

    it('应正确处理部分失败', async () => {
      const successTool: ToolDefinition = {
        name: 'success_tool',
        description: 'Success',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn().mockResolvedValue('Success')
      }

      registry.register(successTool)

      const requests: ToolCallRequest[] = [
        { id: 'call_1', name: 'success_tool', arguments: {} },
        { id: 'call_2', name: 'non_existent', arguments: {} }
      ]

      const results = await registry.executeAll(requests)

      expect(results).toHaveLength(2)
      expect(results[0].isError).toBe(false)
      expect(results[1].isError).toBe(true)
    })
  })

  describe('constructor with config', () => {
    it('应正确从配置中注册自定义工具', () => {
      const customTools: ToolDefinition[] = [
        { name: 'custom1', description: 'Custom 1', parameters: { type: 'object', properties: {} } },
        { name: 'custom2', description: 'Custom 2', parameters: { type: 'object', properties: {} } }
      ]

      const registryWithConfig = new ToolRegistry({ customTools })

      expect(registryWithConfig.size).toBe(2)
      expect(registryWithConfig.has('custom1')).toBe(true)
      expect(registryWithConfig.has('custom2')).toBe(true)
    })
  })
})
