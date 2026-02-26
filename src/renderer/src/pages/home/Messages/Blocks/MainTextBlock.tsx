import PathTextRenderer from '@renderer/components/PathTextRenderer'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { getModelUniqId } from '@renderer/services/ModelService'
import type { RootState } from '@renderer/store'
import { selectFormattedCitationsByBlockId } from '@renderer/store/messageBlock'
import { type Model } from '@renderer/types'
import type { MainTextMessageBlock, Message } from '@renderer/types/newMessage'
import { determineCitationSource, withCitationTags } from '@renderer/utils/citation'
import { extractPaths } from '@renderer/utils/pathExtractor'
import { Flex } from 'antd'
import React, { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import Markdown from '../../Markdown/Markdown'

// Turbo agent ID constant - must match the one in SpeedyPage.tsx
const TURBO_AGENT_ID = 'agent_turbo_system'

interface Props {
  block: MainTextMessageBlock
  citationBlockId?: string
  mentions?: Model[]
  role: Message['role']
}

const MainTextBlock: React.FC<Props> = ({ block, citationBlockId, role, mentions = [] }) => {
  // Use the passed citationBlockId directly in the selector
  const { renderInputMessageAsMarkdown } = useSettings()
  const runtime = useRuntime()

  const rawCitations = useSelector((state: RootState) => selectFormattedCitationsByBlockId(state, citationBlockId))

  // 检查内容中是否包含路径
  const hasPaths = useMemo(() => {
    const segments = extractPaths(block.content)
    const pathSegments = segments.filter((s) => s.type === 'path')
    return pathSegments.length > 0
  }, [block.content])

  // 创建引用处理函数，传递给 Markdown 组件在流式渲染中使用
  const processContent = useCallback(
    (rawText: string) => {
      if (!block.citationReferences?.length || !citationBlockId || rawCitations.length === 0) {
        return rawText
      }

      // 确定最适合的 source
      const sourceType = determineCitationSource(block.citationReferences)

      return withCitationTags(rawText, rawCitations, sourceType)
    },
    [block.citationReferences, citationBlockId, rawCitations]
  )

  // 判断是否使用 PathTextRenderer
  // 条件：仅用户消息在非专家模式下，且关闭了 Markdown 渲染或包含路径时使用
  // assistant 消息始终使用 Markdown 渲染器，避免路径检测导致格式丢失
  const { activeAgentId } = runtime.chat
  const isExpertMode = activeAgentId !== TURBO_AGENT_ID && activeAgentId !== null
  const shouldUsePathRenderer = !isExpertMode && role === 'user' && (!renderInputMessageAsMarkdown || hasPaths)

  return (
    <>
      {/* Render mentions associated with the message */}
      {mentions && mentions.length > 0 && (
        <Flex gap="8px" wrap style={{ marginBottom: 10 }}>
          {mentions.map((m) => (
            <MentionTag key={getModelUniqId(m)}>{'@' + m.name}</MentionTag>
          ))}
        </Flex>
      )}
      {shouldUsePathRenderer ? (
        <p className="markdown">
          <PathTextRenderer text={block.content} />
        </p>
      ) : (
        <Markdown block={block} postProcess={processContent} />
      )}
    </>
  )
}

const MentionTag = styled.span`
  color: var(--color-link);
`

export default React.memo(MainTextBlock)
