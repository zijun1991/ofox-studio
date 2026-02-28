import { DynamicStructuredTool } from '@langchain/core/tools'
import fs from 'fs/promises'
import path from 'path'
import * as z from 'zod'

const MAX_LINE_LENGTH = 2000
const DEFAULT_READ_LIMIT = 2000

function formatFileContent(filePath: string, content: string): string {
  const lines = content.split('\n')
  const limit = Math.min(lines.length, DEFAULT_READ_LIMIT)
  const output: string[] = []

  output.push(`File: ${filePath}`)
  if (lines.length > limit) {
    output.push(`Lines 1 to ${limit} of ${lines.length}`)
  }
  output.push('')

  for (let i = 0; i < limit; i++) {
    const line = lines[i]
    const lineNumber = i + 1
    const truncatedLine = line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH) + '...' : line
    output.push(`${lineNumber.toString().padStart(6)}\t${truncatedLine}`)
  }

  if (lines.length > limit) {
    output.push('')
    output.push(`(${lines.length - limit} more lines not shown)`)
  }

  return output.join('\n')
}

export function createReadFileTool(allowedPaths: string[]): DynamicStructuredTool {
  const resolvedAllowed = allowedPaths.map((p) => path.resolve(p))

  return new DynamicStructuredTool({
    name: 'read_file',
    description:
      'Read content of a local file. Only files in the allowed list can be read. Returns file content with line numbers.',
    schema: z.object({
      file_path: z.string().describe('Absolute path to the file to read')
    }),
    func: async ({ file_path }) => {
      const resolved = path.resolve(file_path)

      if (!resolvedAllowed.some((p) => p === resolved)) {
        return `Error: File '${file_path}' is not in the allowed file list. Allowed files: ${allowedPaths.join(', ')}`
      }

      try {
        const stats = await fs.stat(resolved)
        if (!stats.isFile()) {
          return `Error: '${file_path}' is not a file`
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return `Error: File not found: ${file_path}`
        }
        return `Error: Cannot access file: ${error.message}`
      }

      const content = await fs.readFile(resolved, 'utf-8')
      return formatFileContent(file_path, content)
    }
  })
}
