import { loggerService } from '@logger'
import * as z from 'zod'

export const logger = loggerService.withContext('MCPServer:LLM')

export const MAX_ITERATIONS = 10
export const DEFAULT_TIMEOUT_MS = 120_000
export const DEFAULT_TEMPERATURE = 0.7

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
})

export const ChatToolSchema = z.object({
  system_prompt: z.string().optional().describe('Optional system prompt to guide the LLM behavior'),
  messages: z.array(MessageSchema).min(1).describe('Array of conversation messages'),
  model: z.string().describe("Model identifier in 'provider:model_id' format (e.g., 'my-openai:gpt-4o')"),
  file_paths: z.array(z.string()).optional().describe('Optional array of absolute file paths the LLM can read'),
  temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (0-2, default: 0.7)'),
  max_iterations: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum agent iterations for file reading (1-50, default: 10)')
})
