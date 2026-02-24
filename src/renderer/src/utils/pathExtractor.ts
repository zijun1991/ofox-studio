/**
 * 路径提取工具函数
 * 用于从文本中提取 Windows、Mac、Linux 系统的绝对路径
 */

export type PathSegment =
  | { type: 'text'; value: string }
  | { type: 'path'; value: string; normalizedValue: string; pathType: 'windows' | 'unix' | 'unc' }
  | { type: 'url'; value: string }

/**
 * 检测路径类型
 */
function detectPathType(path: string): 'windows' | 'unix' | 'unc' {
  if (path.startsWith('\\')) return 'unc'
  if (/^[a-zA-Z]:/.test(path)) return 'windows'
  return 'unix'
}

/**
 * 规范化路径
 * 移除末尾的斜杠（根目录除外），使 /path/to/dir 和 /path/to/dir/ 被视为相同路径
 */
function normalizePath(path: string): string {
  // 如果是根目录，直接返回
  if (path === '/' || path === '\\') return path

  // 移除末尾的斜杠和反斜杠
  return path.replace(/[\\/]+$/, '')
}

/**
 * 验证路径是否看起来像有效的绝对路径
 */
function isValidPath(path: string): boolean {
  const trimmed = path.trim()
  if (trimmed.length < 2) return false

  const type = detectPathType(trimmed)

  switch (type) {
    case 'windows':
      // Windows: C:\path 或 C:/path，至少要有盘符和分隔符
      return /^[a-zA-Z]:[\\/]/.test(trimmed) && trimmed.length > 3
    case 'unc':
      // UNC: \\server\share，至少要有 \\server
      return /^\\\\[^\\/]+/.test(trimmed) && trimmed.length > 4
    case 'unix':
      // Unix: /path，至少要有 / 和一个字符
      return trimmed.startsWith('/') && trimmed.length > 1
    default:
      return false
  }
}

/**
 * 从文本中提取 URL 和路径
 * URL 优先级高于路径，避免 URL 中的路径部分被错误识别
 * 代码块内的内容会被跳过
 * 支持 Windows (C:\path, C:/path)、Unix (/path)、UNC (\\server\share) 格式
 *
 * @param text 输入文本
 * @returns 分割后的数组，包含文本段、URL 段和路径段
 */
export function extractPaths(text: string): PathSegment[] {
  if (!text || typeof text !== 'string') {
    return [{ type: 'text', value: '' }]
  }

  const segments: PathSegment[] = []
  let lastIndex = 0

  // 首先提取所有代码块范围（最高优先级）
  const codeBlockRanges = extractCodeBlockRanges(text)

  // URL 正则：匹配 http:// 或 https:// 开头的 URL
  // 包含域名、端口、路径、查询参数和锚点
  const urlRegex = /https?:\/\/[^\s<>"`{}|^[\]]+/gi

  // 提取所有 URL 的位置，但跳过代码块内的 URL
  const urlRanges: Array<{ start: number; end: number; url: string }> = []
  let urlMatch: RegExpExecArray | null
  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const start = urlMatch.index
    const end = start + urlMatch[0].length

    // 跳过代码块内的 URL
    if (isInCodeBlock(start, codeBlockRanges) || isInCodeBlock(end - 1, codeBlockRanges)) {
      continue
    }

    urlRanges.push({
      start: start,
      end: end,
      url: urlMatch[0]
    })
  }

  // 处理 URL 和路径
  for (const range of urlRanges) {
    // 添加 URL 前的文本（排除代码块）
    if (range.start > lastIndex) {
      const textBefore = text.slice(lastIndex, range.start)
      // 在文本前段中查找路径（传入代码块范围以跳过）
      const pathSegments = extractPathsFromSegment(textBefore, codeBlockRanges)
      segments.push(...pathSegments)
    }

    // 添加 URL 段
    segments.push({
      type: 'url',
      value: range.url
    })

    lastIndex = range.end
  }

  // 处理剩余文本（排除代码块）
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex)
    const pathSegments = extractPathsFromSegment(remainingText, codeBlockRanges)
    segments.push(...pathSegments)
  }

  // 如果没有匹配到任何内容，返回原文本
  if (segments.length === 0) {
    return [{ type: 'text', value: text }]
  }

  return segments
}

/**
 * 提取代码块范围
 * 匹配 ```...``` 和 `...` 格式的代码块
 */
function extractCodeBlockRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []

  // 匹配 ```...``` 格式的代码块（多行）
  const tripleBacktickRegex = /```[\s\S]*?```/g
  let match: RegExpExecArray | null
  while ((match = tripleBacktickRegex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  // 匹配 `...` 格式的行内代码（但要排除已经匹配到的 ``` 范围）
  const singleBacktickRegex = /`[^`\n]+`/g
  while ((match = singleBacktickRegex.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length

    // 检查是否与已有的 ``` 范围重叠
    const overlaps = ranges.some((r) => start < r.end && end > r.start)
    if (!overlaps) {
      ranges.push({ start, end })
    }
  }

  return ranges.sort((a, b) => a.start - b.start)
}

/**
 * 检查位置是否在代码块范围内
 */
function isInCodeBlock(pos: number, codeBlockRanges: Array<{ start: number; end: number }>): boolean {
  return codeBlockRanges.some((range) => pos >= range.start && pos < range.end)
}

/**
 * 从文本段中提取路径（不包含 URL，跳过代码块）
 */
function extractPathsFromSegment(text: string, codeBlockRanges: Array<{ start: number; end: number }>): PathSegment[] {
  const segments: PathSegment[] = []
  let lastIndex = 0

  const pathRegex =
    /(?:[a-zA-Z]:[\\/](?:[^\\/:*?"<>|`'\r\n ]+[\\/])*[^\\/:*?"<>|`'\r\n ]*|\/(?:[^\\/:*?"<>|`'\r\n ]+\/)*[^\\/:*?"<>|`'\r\n ]+|\\\\[^\\/:*?"<>|`'\r\n ]+(?:[\\/][^\\/:*?"<>|`'\r\n ]+)*)/g

  let match: RegExpExecArray | null

  while ((match = pathRegex.exec(text)) !== null) {
    const path = match[0]
    const startIndex = match.index
    const endIndex = startIndex + path.length

    // 跳过代码块内的路径
    if (isInCodeBlock(startIndex, codeBlockRanges) || isInCodeBlock(endIndex - 1, codeBlockRanges)) {
      continue
    }

    // 验证路径有效性
    if (!isValidPath(path)) {
      continue
    }

    // 添加路径前的文本段
    if (startIndex > lastIndex) {
      const textSegment = text.slice(lastIndex, startIndex)
      if (textSegment) {
        segments.push({ type: 'text', value: textSegment })
      }
    }

    // 添加路径段（保留原始值用于显示，同时存储规范化值用于比较）
    segments.push({
      type: 'path',
      value: path,
      normalizedValue: normalizePath(path),
      pathType: detectPathType(path)
    })

    lastIndex = endIndex
  }

  // 添加剩余的文本段
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex)
    if (remainingText) {
      segments.push({ type: 'text', value: remainingText })
    }
  }

  // 如果没有匹配到任何路径，返回原文本
  if (segments.length === 0 && text) {
    return [{ type: 'text', value: text }]
  }

  return segments
}

/**
 * 检查路径是否存在（异步）
 * 注意：这是前端模拟，实际存在性检查需要在主进程中进行
 *
 * @param path 路径字符串
 * @returns 是否存在
 */
export async function checkPathExists(_path: string): Promise<boolean> {
  // 这里可以调用主进程的 API 来检查路径是否存在
  // 暂时返回 true，由调用方根据实际情况设置
  return true
}

/**
 * 将路径数组渲染为 React 元素
 * 辅助函数，用于在组件中渲染
 */
export function renderPathSegments(
  segments: PathSegment[],
  renderText: (text: string) => React.ReactNode,
  renderPath: (path: string, normalizedPath: string, pathType: 'windows' | 'unix' | 'unc') => React.ReactNode,
  renderUrl?: (url: string) => React.ReactNode
): React.ReactNode[] {
  return segments.map((segment) => {
    if (segment.type === 'text') {
      return renderText(segment.value)
    } else if (segment.type === 'url') {
      return renderUrl ? renderUrl(segment.value) : renderText(segment.value)
    } else {
      return renderPath(segment.value, segment.normalizedValue, segment.pathType)
    }
  })
}
