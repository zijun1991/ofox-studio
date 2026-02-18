/**
 * Mock Tools for testing
 */

import type { ToolDefinition } from '../../src/types/tool'

/**
 * 简单测试工具
 */
export const mockSimpleTool: ToolDefinition = {
  name: 'test_tool',
  description: 'A simple test tool',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to process'
      }
    },
    required: ['message']
  }
}

/**
 * 获取天气工具
 */
export const mockWeatherTool: ToolDefinition = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or coordinates'
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature unit'
      }
    },
    required: ['location']
  }
}

/**
 * 读取文件工具
 */
export const mockReadFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read'
      }
    },
    required: ['path']
  }
}

/**
 * 写入文件工具
 */
export const mockWriteFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to write'
      },
      content: {
        type: 'string',
        description: 'Content to write'
      }
    },
    required: ['path', 'content']
  }
}

/**
 * 多个测试工具
 */
export const mockMultipleTools: ToolDefinition[] = [
  mockSimpleTool,
  mockWeatherTool,
  mockReadFileTool,
  mockWriteFileTool
]

/**
 * 创建自定义测试工具
 */
export function createMockTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: 'custom_tool',
    description: 'Custom tool description',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input value' }
      }
    },
    ...overrides
  }
}
