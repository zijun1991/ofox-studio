import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import type { ChatOpenAI } from '@langchain/openai'

import { logger, MAX_ITERATIONS } from './types'

export interface ImageAttachment {
  mimeType: string
  base64Data: string
}

export async function runAgent(params: {
  llm: ChatOpenAI
  tools: DynamicStructuredTool[]
  systemPrompt?: string
  messages: { role: string; content: string }[]
  imageAttachments?: ImageAttachment[]
  maxIterations: number
}): Promise<string> {
  const { llm, tools, systemPrompt, messages, imageAttachments, maxIterations } = params
  const effectiveMax = Math.min(maxIterations, MAX_ITERATIONS * 5)

  const toolNode = new ToolNode(tools)
  const llmWithTools = tools.length > 0 ? llm.bindTools(tools) : llm

  let iterations = 0

  const callModel = async (state: typeof MessagesAnnotation.State) => {
    iterations++
    if (iterations > effectiveMax) {
      logger.warn('Reached maximum iterations', { iterations: effectiveMax })
      return { messages: [new AIMessage('Reached maximum iterations limit.')] }
    }
    const response = await llmWithTools.invoke(state.messages)
    return { messages: [response] }
  }

  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const last = state.messages[state.messages.length - 1]
    if (iterations >= effectiveMax) return '__end__'
    if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
      return 'call_tool'
    }
    return '__end__'
  }

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('call_model', callModel)
    .addNode('call_tool', toolNode)
    .addEdge('__start__', 'call_model')
    .addConditionalEdges('call_model', shouldContinue)
    .addEdge('call_tool', 'call_model')
    .compile()

  const initialMessages: (SystemMessage | HumanMessage | AIMessage)[] = []
  if (systemPrompt) {
    initialMessages.push(new SystemMessage(systemPrompt))
  }
  for (const msg of messages) {
    if (msg.role === 'user') {
      // If this is the last user message and we have image attachments, build multimodal content
      if (imageAttachments?.length && msg === messages.filter((m) => m.role === 'user').pop()) {
        const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
          { type: 'text', text: msg.content }
        ]
        for (const img of imageAttachments) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64Data}` }
          })
        }
        initialMessages.push(new HumanMessage({ content: parts }))
      } else {
        initialMessages.push(new HumanMessage(msg.content))
      }
    } else {
      initialMessages.push(new AIMessage(msg.content))
    }
  }

  logger.debug('Running agent', { messageCount: initialMessages.length, toolCount: tools.length })

  const result = await graph.invoke({ messages: initialMessages })

  const lastAiMsg = result.messages
    .filter((m: any) => m instanceof AIMessage && (!m.tool_calls || m.tool_calls.length === 0))
    .pop()

  const content = lastAiMsg?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}
