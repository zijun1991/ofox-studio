import fs from 'fs/promises'
import path from 'path'

import type { ImageAttachment } from '../agent'
import { runAgent } from '../agent'
import { resolveModelToChat } from '../model-resolver'
import { ChatToolSchema, DEFAULT_TIMEOUT_MS, logger, MAX_ITERATIONS } from '../types'
import { createReadFileTool } from './read-file'
import { errorResponse, successResponse } from './utils'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

async function loadImageAttachments(imagePaths: string[]): Promise<ImageAttachment[]> {
  const attachments: ImageAttachment[] = []
  for (const imgPath of imagePaths) {
    try {
      const resolved = path.resolve(imgPath)
      const data = await fs.readFile(resolved)
      const ext = path.extname(resolved).toLowerCase()
      attachments.push({
        mimeType: MIME_MAP[ext] || 'image/png',
        base64Data: data.toString('base64')
      })
    } catch (error: any) {
      logger.warn('Failed to read image file', { path: imgPath, error: error.message })
    }
  }
  return attachments
}

export const chatToolDefinition = {
  name: 'chat',
  description: `Send a chat request to an LLM model configured in Ofox Studio. Supports optional file reading - when file_paths are provided, the LLM agent can autonomously read those files to answer questions. Image files (png/jpg/gif/webp) in file_paths are automatically embedded as visual content for multimodal models. Use 'list_models' tool first to discover available models.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      system_prompt: {
        type: 'string',
        description: 'Optional system prompt to guide the LLM behavior'
      },
      messages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' }
          },
          required: ['role', 'content']
        },
        description: 'Array of conversation messages (at least one required)'
      },
      model: {
        type: 'string',
        description: "Model identifier in 'provider:model_id' format (e.g., 'my-openai:gpt-4o')"
      },
      file_paths: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional array of absolute file paths the LLM can read. Image files (png/jpg/gif/webp) are embedded as visual content; text files are available via internal read_file tool.'
      },
      temperature: {
        type: 'number',
        description: 'Sampling temperature (0-2, default: 0.7)'
      },
      max_iterations: {
        type: 'number',
        description: 'Maximum agent iterations for file reading (1-50, default: 10)'
      }
    },
    required: ['messages', 'model']
  }
}

export async function handleChat(args: unknown) {
  const parsed = ChatToolSchema.safeParse(args)
  if (!parsed.success) {
    return errorResponse(`Invalid arguments: ${parsed.error.message}`)
  }

  const { system_prompt, messages, model, file_paths, temperature, max_iterations } = parsed.data

  try {
    const llm = await resolveModelToChat(model, temperature)

    // Separate image files from text files
    const imagePaths = file_paths?.filter(isImagePath) || []
    const textPaths = file_paths?.filter((p) => !isImagePath(p)) || []

    // Load image files as base64 attachments for multimodal embedding
    const imageAttachments = imagePaths.length > 0 ? await loadImageAttachments(imagePaths) : undefined

    // Only create read_file tool for non-image files
    const tools = textPaths.length > 0 ? [createReadFileTool(textPaths)] : []

    const maxIter = max_iterations ?? MAX_ITERATIONS

    const resultPromise = runAgent({
      llm,
      tools,
      systemPrompt: system_prompt,
      messages,
      imageAttachments,
      maxIterations: maxIter
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 120 seconds')), DEFAULT_TIMEOUT_MS)
    })

    const result = await Promise.race([resultPromise, timeoutPromise])

    logger.info('Chat completed', {
      model,
      messageCount: messages.length,
      imageCount: imagePaths.length,
      textFileCount: textPaths.length
    })

    return successResponse(result)
  } catch (error: any) {
    logger.error('Chat failed', { error: error.message, model })

    if (error.status === 401 || error.message?.includes('401')) {
      return errorResponse('Authentication failed. Please check the API key for this provider.')
    }
    if (error.status === 429 || error.message?.includes('429')) {
      return errorResponse('Rate limited. Please wait and try again.')
    }
    if (error.message?.includes('context') && error.message?.includes('length')) {
      return errorResponse('Context length exceeded. Try reducing the message or file content size.')
    }

    return errorResponse(error)
  }
}
