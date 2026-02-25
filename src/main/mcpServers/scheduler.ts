/**
 * Scheduler MCP Server
 *
 * Provides AI tools for managing scheduled tasks:
 * - create_scheduler: Create a new scheduled task
 * - list_schedulers: List all scheduled tasks
 * - get_scheduler: Get a specific scheduler by ID
 * - update_scheduler: Update an existing scheduler
 * - delete_scheduler: Delete a scheduler
 * - toggle_scheduler: Enable/disable a scheduler
 */

import { loggerService } from '@logger'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CreateSchedulerRequest, SchedulerEntity, UpdateSchedulerRequest } from '@types'
import * as z from 'zod'

const logger = loggerService.withContext('MCPServer:Scheduler')

// Zod schemas for tool inputs
const CreateSchedulerSchema = z.object({
  name: z.string().min(1).describe('Name of the scheduled task'),
  description: z.string().optional().describe('Description of the task'),
  agent_id: z.string().min(1).describe('ID of the target Agent'),
  session_id: z.string().min(1).describe('ID of the target Session'),
  cron_expression: z.string().min(1).describe('Cron expression (6-field format: second minute hour day month weekday)'),
  timezone: z.string().optional().default('Asia/Shanghai').describe('Timezone for the schedule'),
  message_content: z.string().min(1).describe('Message content to send when triggered'),
  enabled: z.boolean().optional().default(true).describe('Whether the task is enabled')
})

const ListSchedulersSchema = z.object({
  agent_id: z.string().optional().describe('Filter by Agent ID'),
  enabled: z.boolean().optional().describe('Filter by enabled status'),
  limit: z.number().optional().default(100).describe('Maximum number of results'),
  offset: z.number().optional().default(0).describe('Offset for pagination')
})

const GetSchedulerSchema = z.object({
  id: z.string().min(1).describe('ID of the scheduler to get')
})

const UpdateSchedulerSchema = z.object({
  id: z.string().min(1).describe('ID of the scheduler to update'),
  name: z.string().optional().describe('New name for the task'),
  description: z.string().optional().describe('New description'),
  agent_id: z.string().optional().describe('New target Agent ID'),
  session_id: z.string().optional().describe('New target Session ID'),
  cron_expression: z.string().optional().describe('New cron expression'),
  timezone: z.string().optional().describe('New timezone'),
  message_content: z.string().optional().describe('New message content'),
  enabled: z.boolean().optional().describe('New enabled status')
})

const DeleteSchedulerSchema = z.object({
  id: z.string().min(1).describe('ID of the scheduler to delete')
})

const ToggleSchedulerSchema = z.object({
  id: z.string().min(1).describe('ID of the scheduler to toggle'),
  enabled: z.boolean().describe('Whether to enable (true) or disable (false)')
})

// Tool response helper
function createResponse(text: string, isError: boolean = false) {
  return {
    content: [{ type: 'text' as const, text }],
    isError
  }
}

function createJsonResponse(data: unknown, isError: boolean = false) {
  return createResponse(JSON.stringify(data, null, 2), isError)
}

// Store reference to scheduler service handler
let schedulerServiceHandler: {
  createScheduler: (data: CreateSchedulerRequest) => Promise<SchedulerEntity>
  getScheduler: (id: string) => Promise<SchedulerEntity | null>
  listSchedulers: (options?: {
    agent_id?: string
    enabled?: boolean
    limit?: number
    offset?: number
  }) => Promise<{ schedulers: SchedulerEntity[]; total: number }>
  updateScheduler: (id: string, updates: Partial<UpdateSchedulerRequest>) => Promise<SchedulerEntity | null>
  deleteScheduler: (id: string) => Promise<boolean>
  toggleScheduler: (id: string, enabled: boolean) => Promise<SchedulerEntity | null>
} | null = null

/**
 * Set the scheduler service handler
 * This should be called during app initialization to provide access to SchedulerService
 */
export function setSchedulerServiceHandler(handler: typeof schedulerServiceHandler): void {
  schedulerServiceHandler = handler
  logger.info('Scheduler service handler registered')
}

const server = new Server(
  {
    name: 'cherry/scheduler',
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
    tools: [
      {
        name: 'create_scheduler',
        description:
          'Create a new scheduled task that will send a message to an Agent Session at specified times. The cron expression uses 6-field format: second minute hour day month weekday. Example: "0 0 9 * * *" runs every day at 9:00 AM.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the scheduled task' },
            description: { type: 'string', description: 'Description of the task (optional)' },
            agent_id: { type: 'string', description: 'ID of the target Agent' },
            session_id: { type: 'string', description: 'ID of the target Session' },
            cron_expression: {
              type: 'string',
              description: 'Cron expression (6-field: second minute hour day month weekday)'
            },
            timezone: { type: 'string', description: 'Timezone (default: Asia/Shanghai)' },
            message_content: { type: 'string', description: 'Message content to send when triggered' },
            enabled: { type: 'boolean', description: 'Whether the task is enabled (default: true)' }
          },
          required: ['name', 'agent_id', 'session_id', 'cron_expression', 'message_content']
        }
      },
      {
        name: 'list_schedulers',
        description: 'List all scheduled tasks, optionally filtered by Agent ID or enabled status.',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'Filter by Agent ID (optional)' },
            enabled: { type: 'boolean', description: 'Filter by enabled status (optional)' },
            limit: { type: 'number', description: 'Maximum number of results (default: 100)' },
            offset: { type: 'number', description: 'Offset for pagination (default: 0)' }
          }
        }
      },
      {
        name: 'get_scheduler',
        description: 'Get details of a specific scheduled task by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the scheduler to get' }
          },
          required: ['id']
        }
      },
      {
        name: 'update_scheduler',
        description: 'Update an existing scheduled task. Only provided fields will be updated.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the scheduler to update' },
            name: { type: 'string', description: 'New name for the task (optional)' },
            description: { type: 'string', description: 'New description (optional)' },
            agent_id: { type: 'string', description: 'New target Agent ID (optional)' },
            session_id: { type: 'string', description: 'New target Session ID (optional)' },
            cron_expression: { type: 'string', description: 'New cron expression (optional)' },
            timezone: { type: 'string', description: 'New timezone (optional)' },
            message_content: { type: 'string', description: 'New message content (optional)' },
            enabled: { type: 'boolean', description: 'New enabled status (optional)' }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_scheduler',
        description: 'Delete a scheduled task permanently.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the scheduler to delete' }
          },
          required: ['id']
        }
      },
      {
        name: 'toggle_scheduler',
        description: 'Enable or disable a scheduled task.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the scheduler to toggle' },
            enabled: { type: 'boolean', description: 'True to enable, false to disable' }
          },
          required: ['id', 'enabled']
        }
      }
    ]
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!schedulerServiceHandler) {
    return createResponse('Scheduler service not initialized. Please restart the application.', true)
  }

  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'create_scheduler': {
        const validatedArgs = CreateSchedulerSchema.parse(args)
        const scheduler = await schedulerServiceHandler.createScheduler({
          name: validatedArgs.name,
          description: validatedArgs.description,
          agent_id: validatedArgs.agent_id,
          session_id: validatedArgs.session_id,
          cron_expression: validatedArgs.cron_expression,
          timezone: validatedArgs.timezone,
          message_content: validatedArgs.message_content,
          enabled: validatedArgs.enabled ?? true
        })
        logger.info(`Created scheduler: ${scheduler.id}`)
        return createJsonResponse({
          success: true,
          message: `Scheduled task "${scheduler.name}" created successfully`,
          scheduler
        })
      }

      case 'list_schedulers': {
        const validatedArgs = ListSchedulersSchema.parse(args)
        const result = await schedulerServiceHandler.listSchedulers({
          agent_id: validatedArgs.agent_id,
          enabled: validatedArgs.enabled,
          limit: validatedArgs.limit,
          offset: validatedArgs.offset
        })
        return createJsonResponse(result)
      }

      case 'get_scheduler': {
        const validatedArgs = GetSchedulerSchema.parse(args)
        const scheduler = await schedulerServiceHandler.getScheduler(validatedArgs.id)
        if (!scheduler) {
          return createResponse(`Scheduler with ID "${validatedArgs.id}" not found`, true)
        }
        return createJsonResponse(scheduler)
      }

      case 'update_scheduler': {
        const validatedArgs = UpdateSchedulerSchema.parse(args)
        const { id, ...updates } = validatedArgs
        const scheduler = await schedulerServiceHandler.updateScheduler(id, updates)
        if (!scheduler) {
          return createResponse(`Scheduler with ID "${id}" not found`, true)
        }
        logger.info(`Updated scheduler: ${id}`)
        return createJsonResponse({
          success: true,
          message: `Scheduled task "${scheduler.name}" updated successfully`,
          scheduler
        })
      }

      case 'delete_scheduler': {
        const validatedArgs = DeleteSchedulerSchema.parse(args)
        const success = await schedulerServiceHandler.deleteScheduler(validatedArgs.id)
        if (!success) {
          return createResponse(`Failed to delete scheduler with ID "${validatedArgs.id}"`, true)
        }
        logger.info(`Deleted scheduler: ${validatedArgs.id}`)
        return createJsonResponse({
          success: true,
          message: `Scheduled task deleted successfully`
        })
      }

      case 'toggle_scheduler': {
        const validatedArgs = ToggleSchedulerSchema.parse(args)
        const scheduler = await schedulerServiceHandler.toggleScheduler(validatedArgs.id, validatedArgs.enabled)
        if (!scheduler) {
          return createResponse(`Scheduler with ID "${validatedArgs.id}" not found`, true)
        }
        logger.info(`Toggled scheduler ${validatedArgs.id} to ${validatedArgs.enabled ? 'enabled' : 'disabled'}`)
        return createJsonResponse({
          success: true,
          message: `Scheduled task "${scheduler.name}" ${validatedArgs.enabled ? 'enabled' : 'disabled'}`,
          scheduler
        })
      }

      default:
        return createResponse(`Unknown tool: ${name}`, true)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error in tool ${name}:`, error as Error)
    return createResponse(`Error: ${errorMessage}`, true)
  }
})

class SchedulerServer {
  public server: Server
  constructor() {
    this.server = server
  }
}

export default SchedulerServer
