import PathTag from '@renderer/components/PathTag'
import type { PathSegment } from '@renderer/utils/pathExtractor'
import { extractPaths } from '@renderer/utils/pathExtractor'
import React, { useEffect, useMemo, useState } from 'react'

interface PathTextRendererProps {
  /** 文本内容 */
  text: string
  /** 是否保留空白字符 */
  preserveWhitespace?: boolean
  /** 自定义类名 */
  className?: string
}

/**
 * 路径文本渲染器
 * 自动识别文本中的 URL、绝对路径并渲染为对应组件
 * 支持 URL (http://, https://)、Windows、Mac/Linux、UNC 格式的路径
 * URL 优先级高于路径识别
 * 对于不存在的路径，直接渲染原始文本
 */
export const PathTextRenderer: React.FC<PathTextRendererProps> = ({ text, preserveWhitespace = true, className }) => {
  const segments = useMemo(() => extractPaths(text), [text])

  // 状态管理路径存在性
  const [pathExistsMap, setPathExistsMap] = useState<Record<string, boolean>>({})

  // 使用 useMemo 缓存路径列表
  const pathSegments = useMemo(
    () => segments.filter((s): s is PathSegment & { type: 'path' } => s.type === 'path'),
    [segments]
  )

  // 使用 useEffect 异步检查路径存在性
  useEffect(() => {
    const checkPaths = async () => {
      // 批量检查路径存在性
      const results = await Promise.all(
        pathSegments.map(async (segment) => ({
          path: segment.normalizedValue,
          exists: await window.api.fs.exists(segment.normalizedValue)
        }))
      )

      // 更新状态
      const existsMap = Object.fromEntries(results.map((r) => [r.path, r.exists]))
      setPathExistsMap(existsMap)
    }

    if (pathSegments.length > 0) {
      checkPaths()
    }
  }, [pathSegments])

  const handleUrlClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <span className={className} style={{ whiteSpace: preserveWhitespace ? 'pre-wrap' : 'normal' }}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.value}</span>
        } else if (segment.type === 'url') {
          return (
            <a
              key={index}
              href={segment.value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation()
                handleUrlClick(segment.value)
              }}
              style={{
                color: 'var(--color-link)',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}>
              {segment.value}
            </a>
          )
        } else {
          const pathExists = pathExistsMap[segment.normalizedValue]

          // 如果路径不存在，直接渲染原始文本
          if (!pathExists) {
            return <span key={index}>{segment.value}</span>
          }

          return (
            <PathTag
              key={index}
              path={segment.value}
              exists={true}
              type={segment.value.endsWith('/') || segment.value.endsWith('\\') ? 'directory' : 'file'}
            />
          )
        }
      })}
    </span>
  )
}

export default PathTextRenderer
