# Agent OpenAI 协议代理层设计方案

## 背景

### 问题

Agent 助手（专家模式/极速模式）使用 `@anthropic-ai/claude-agent-sdk`，该 SDK **只能与 Anthropic API 通信**，无法直接支持 OpenAI 协议的 LLM。

### 目标

让 Agent 助手能使用 OpenAI 协议的 LLM provider（DeepSeek、硅基流动、智谱等），且：
- **对用户无感知** - 无需用户额外配置
- **对 SDK 透明** - SDK 认为它在和 Anthropic API 通信
- **复用 SDK 全部功能** - MCP、工具调用循环、会话恢复、权限管理等

## 方案设计

### 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ClaudeCodeService                            │
│                              │                                       │
│                              ▼                                       │
│              @anthropic-ai/claude-agent-sdk                          │
│                              │                                       │
│                              ▼                                       │
│              POST ${ANTHROPIC_BASE_URL}/v1/messages                  │
│                    (Anthropic 格式请求)                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AnthropicProxyServer                             │
│                   (本地 HTTP 服务，自动启动)                          │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    请求转换层                                │   │
│   │  Anthropic Messages API -> OpenAI Chat Completions API      │   │
│   │                                                               │   │
│   │  - 消息格式转换 (content blocks -> content string)          │   │
│   │  - 工具定义转换 (input_schema -> parameters)                │   │
│   │  - 系统提示词处理                                           │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                 OpenAI Provider 调用                         │   │
│   │  - 使用主应用配置的 provider (apiKey, apiHost)              │   │
│   │  - 发送 OpenAI 格式请求                                     │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    响应转换层                                │   │
│   │  OpenAI SSE Stream -> Anthropic SSE Stream                  │   │
│   │                                                               │   │
│   │  - 转换流式事件格式                                          │   │
│   │  - 处理 tool_calls -> tool_use                              │   │
│   │  - 生成 Anthropic 事件序列                                   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              @anthropic-ai/claude-agent-sdk (继续处理)               │
│                    (收到 Anthropic 格式响应)                         │
│                              │                                       │
│                              ▼                                       │
│                    transformSDKMessageToStreamParts                  │
│                              │                                       │
│                              ▼                                       │
│                        TextStreamPart                                │
│                              │                                       │
│                              ▼                                       │
│                          前端 UI                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 工作流程

1. **应用启动时**：自动启动本地代理服务 `AnthropicProxyServer`
2. **创建 Agent Session 时**：
   - 检测 provider 协议类型
   - 如果是 OpenAI 协议，设置 `ANTHROPIC_BASE_URL=http://localhost:{port}/{providerId}`
3. **SDK 发送请求时**：
   - 请求到达代理服务
   - 代理服务根据 URL 中的 `providerId` 获取配置
   - 转换请求格式并发送到实际的 OpenAI API
4. **收到响应时**：
   - 代理服务转换 SSE 流格式
   - SDK 收到标准 Anthropic 格式响应

## 实现步骤

### Phase 1: 创建 AnthropicProxyServer

**新文件**: `src/main/services/agents/anthropic-proxy/AnthropicProxyServer.ts`

```typescript
import http from 'node:http'
import { loggerService } from '@logger'

const logger = loggerService.withContext('AnthropicProxyServer')

export interface ProxyConfig {
  port: number
  host: string
}

export class AnthropicProxyServer {
  private server: http.Server | null = null
  private requestHandler: AnthropicRequestHandler

  constructor(private config: ProxyConfig) {
    this.requestHandler = new AnthropicRequestHandler()
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        logger.error('Request handling error', { error })
        res.writeHead(500).end('Internal Server Error')
      })
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        logger.info('AnthropicProxyServer started', {
          host: this.config.host,
          port: this.config.port
        })
        resolve()
      })
      this.server!.on('error', reject)
    })
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('AnthropicProxyServer stopped')
          resolve()
        })
      })
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 解析 URL: /{providerId}/v1/messages
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const pathParts = url.pathname.split('/').filter(Boolean)

    if (pathParts.length < 3) {
      res.writeHead(400).end('Invalid URL format')
      return
    }

    const providerId = pathParts[0]
    const endpoint = pathParts.slice(1).join('/') // v1/messages

    if (endpoint !== 'v1/messages') {
      res.writeHead(404).end('Not Found')
      return
    }

    await this.requestHandler.handleMessagesRequest(providerId, req, res)
  }
}
```

### Phase 2: 实现请求转换器

**新文件**: `src/main/services/agents/anthropic-proxy/RequestConverter.ts`

```typescript
import type { AnthropicMessage, AnthropicRequest, OpenAIMessage, OpenAIRequest } from './types'

export class RequestConverter {
  /**
   * 将 Anthropic Messages API 请求转换为 OpenAI Chat Completions API 请求
   */
  convertRequest(anthropicReq: AnthropicRequest, model: string): OpenAIRequest {
    const messages: OpenAIMessage[] = []

    // 1. 处理系统提示词
    if (anthropicReq.system) {
      messages.push({
        role: 'system',
        content: typeof anthropicReq.system === 'string'
          ? anthropicReq.system
          : this.extractSystemContent(anthropicReq.system)
      })
    }

    // 2. 转换消息
    for (const msg of anthropicReq.messages) {
      const converted = this.convertMessage(msg)
      if (converted) {
        messages.push(...converted)
      }
    }

    // 3. 构建请求
    const openaiReq: OpenAIRequest = {
      model,
      messages,
      stream: anthropicReq.stream ?? true,
      max_tokens: anthropicReq.max_tokens,
      temperature: anthropicReq.temperature
    }

    // 4. 转换工具定义
    if (anthropicReq.tools && anthropicReq.tools.length > 0) {
      openaiReq.tools = anthropicReq.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }
      }))
    }

    return openaiReq
  }

  private convertMessage(msg: AnthropicMessage): OpenAIMessage[] | null {
    const messages: OpenAIMessage[] = []

    if (msg.role === 'user') {
      // 处理 user 消息中的 tool_result
      if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(block => block.type === 'tool_result')
        const otherContent = msg.content.filter(block => block.type !== 'tool_result')

        // 添加普通用户消息
        if (otherContent.length > 0) {
          messages.push({
            role: 'user',
            content: this.convertContent(otherContent)
          })
        }

        // 每个 tool_result 转换为单独的 tool 角色消息
        for (const tr of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content)
          })
        }
      } else {
        messages.push({
          role: 'user',
          content: msg.content
        })
      }
    } else if (msg.role === 'assistant') {
      const assistantMsg: OpenAIMessage = {
        role: 'assistant',
        content: this.convertContent(msg.content)
      }

      // 处理 tool_use
      if (msg.content && Array.isArray(msg.content)) {
        const toolUses = msg.content.filter(block => block.type === 'tool_use')
        if (toolUses.length > 0) {
          assistantMsg.tool_calls = toolUses.map(tu => ({
            id: tu.id,
            type: 'function',
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input)
            }
          }))
        }
      }

      messages.push(assistantMsg)
    }

    return messages
  }

  private convertContent(content: string | AnthropicContentBlock[]): string | OpenAIContentPart[] {
    if (typeof content === 'string') {
      return content
    }

    const parts: OpenAIContentPart[] = []
    for (const block of content) {
      if (block.type === 'text') {
        parts.push({ type: 'text', text: block.text })
      } else if (block.type === 'image' && block.source) {
        parts.push(this.convertImageBlock(block))
      }
      // tool_use 和 tool_result 在 convertMessage 中单独处理
    }

    return parts.length === 1 && parts[0].type === 'text'
      ? parts[0].text
      : parts
  }

  private convertImageBlock(block: AnthropicImageBlock): OpenAIImagePart {
    if (block.source.type === 'base64') {
      // Base64 -> Data URL
      return {
        type: 'image_url',
        image_url: {
          url: `data:${block.source.media_type};base64,${block.source.data}`,
          detail: 'auto'
        }
      }
    } else {
      // URL 直接使用
      return {
        type: 'image_url',
        image_url: {
          url: block.source.url,
          detail: 'auto'
        }
      }
    }
  }

  private extractSystemContent(system: AnthropicSystemBlock[]): string {
    return system
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n')
  }
}
```

### Phase 3: 实现响应转换器

**新文件**: `src/main/services/agents/anthropic-proxy/ResponseConverter.ts`

```typescript
import type { OpenAIChunk, AnthropicStreamEvent } from './types'

export class ResponseConverter {
  private messageId: string = ''
  private contentIndex: number = 0
  private toolCallIndex: number = 0
  private inputTokens: number = 0
  private outputTokens: number = 0

  /**
   * 生成 Anthropic 流式事件序列
   */
  async *convertStream(chunks: AsyncIterable<OpenAIChunk>): AsyncGenerator<string> {
    // 1. message_start 事件
    this.messageId = `msg_${Date.now()}`
    yield this.formatEvent('message_start', {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: '',
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    })

    // 2. 处理内容块
    let currentTextBlockStarted = false
    let currentToolBlocks: Map<number, { id: string; name: string; input: string }> = new Map()

    for await (const chunk of chunks) {
      const choice = chunk.choices[0]
      if (!choice) continue

      // 处理文本增量
      if (choice.delta?.content) {
        if (!currentTextBlockStarted) {
          yield this.formatEvent('content_block_start', {
            type: 'content_block_start',
            index: this.contentIndex,
            content_block: { type: 'text', text: '' }
          })
          currentTextBlockStarted = true
        }

        yield this.formatEvent('content_block_delta', {
          type: 'content_block_delta',
          index: this.contentIndex,
          delta: { type: 'text_delta', text: choice.delta.content }
        })
      }

      // 处理工具调用增量
      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index ?? 0

          if (!currentToolBlocks.has(idx)) {
            // 新工具调用 - 发送 content_block_start
            const toolId = tc.id || `toolu_${Date.now()}_${idx}`
            currentToolBlocks.set(idx, { id: toolId, name: '', input: '' })

            yield this.formatEvent('content_block_start', {
              type: 'content_block_start',
              index: this.contentIndex + 1 + idx,
              content_block: {
                type: 'tool_use',
                id: toolId,
                name: tc.function?.name || '',
                input: {}
              }
            })
          }

          const toolBlock = currentToolBlocks.get(idx)!

          // 更新工具名称
          if (tc.function?.name && !toolBlock.name) {
            toolBlock.name = tc.function.name
          }

          // 追加参数增量
          if (tc.function?.arguments) {
            toolBlock.input += tc.function.arguments

            yield this.formatEvent('content_block_delta', {
              type: 'content_block_delta',
              index: this.contentIndex + 1 + idx,
              delta: {
                type: 'input_json_delta',
                partial_json: tc.function.arguments
              }
            })
          }
        }
      }

      // 处理 usage
      if (chunk.usage) {
        this.inputTokens = chunk.usage.prompt_tokens ?? 0
        this.outputTokens = chunk.usage.completion_tokens ?? 0
      }
    }

    // 3. 关闭文本块
    if (currentTextBlockStarted) {
      yield this.formatEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.contentIndex
      })
    }

    // 4. 关闭工具调用块
    for (const [idx] of currentToolBlocks) {
      yield this.formatEvent('content_block_stop', {
        type: 'content_block_stop',
        index: this.contentIndex + 1 + idx
      })
    }

    // 5. message_delta 事件
    yield this.formatEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: {
        output_tokens: this.outputTokens
      }
    })

    // 6. message_stop 事件
    yield this.formatEvent('message_stop', {
      type: 'message_stop'
    })
  }

  private formatEvent(eventType: string, data: object): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
  }
}
```

### Phase 4: 实现请求处理器

**新文件**: `src/main/services/agents/anthropic-proxy/AnthropicRequestHandler.ts`

```typescript
import http from 'node:http'
import { loggerService } from '@logger'
import { validateModelId } from '@main/apiServer/utils'
import { RequestConverter } from './RequestConverter'
import { ResponseConverter } from './ResponseConverter'
import type { Provider } from '@types'

const logger = loggerService.withContext('AnthropicRequestHandler')

export class AnthropicRequestHandler {
  private requestConverter = new RequestConverter()
  private responseConverter = new ResponseConverter()

  async handleMessagesRequest(
    providerId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 1. 读取请求体
    const body = await this.readBody(req)
    const anthropicReq = JSON.parse(body)

    // 2. 获取 provider 配置
    const modelInfo = await validateModelId(anthropicReq.model)
    if (!modelInfo.valid || !modelInfo.provider) {
      res.writeHead(400).end(JSON.stringify({ error: 'Invalid model' }))
      return
    }

    const provider = modelInfo.provider

    // 3. 转换请求
    const openaiReq = this.requestConverter.convertRequest(
      anthropicReq,
      modelInfo.modelId
    )

    logger.debug('Converted request', {
      providerId,
      model: modelInfo.modelId,
      messageCount: openaiReq.messages.length
    })

    // 4. 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    // 5. 调用 OpenAI API
    const openaiResponse = await this.callOpenAIAPI(provider, openaiReq)

    // 6. 转换并流式输出响应
    for await (const event of this.responseConverter.convertStream(openaiResponse)) {
      res.write(event)
    }

    res.end()
  }

  private async callOpenAIAPI(
    provider: Provider,
    request: OpenAIRequest
  ): Promise<AsyncIterable<OpenAIChunk>> {
    const baseURL = provider.apiHost || 'https://api.openai.com/v1'

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
        ...provider.extra_headers
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    // 返回异步迭代器
    return this.parseSSEStream(response.body!)
  }

  private async *parseSSEStream(body: ReadableStream): AsyncIterable<OpenAIChunk> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') break
          yield JSON.parse(data)
        }
      }
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }
}
```

### Phase 5: 集成到应用启动流程

**文件**: `src/main/index.ts` 或 `src/main/services/AppService.ts`

```typescript
import { AnthropicProxyServer } from './services/agents/anthropic-proxy/AnthropicProxyServer'

// 应用启动时
const anthropicProxy = new AnthropicProxyServer({
  port: 8765,  // 选择一个未使用的端口
  host: '127.0.0.1'
})

await anthropicProxy.start()
```

### Phase 6: 修改 ClaudeCodeService

**文件**: `src/main/services/agents/services/claudecode/index.ts`

```typescript
// 在 invoke 方法中，根据 provider 类型设置 ANTHROPIC_BASE_URL

const protocol = this.detectProtocol(modelInfo.provider)

if (protocol === 'openai') {
  // 使用本地代理
  const proxyConfig = getProxyConfig() // 获取代理端口
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${proxyConfig.port}/${modelInfo.provider.id}`
} else {
  // 直接使用 Anthropic API
  env.ANTHROPIC_BASE_URL = withoutTrailingApiVersion(
    modelInfo.provider.anthropicApiHost?.trim() || modelInfo.provider.apiHost
  )
}
```

## 关键文件列表

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/services/agents/anthropic-proxy/AnthropicProxyServer.ts` | **新增** | HTTP 代理服务器 |
| `src/main/services/agents/anthropic-proxy/AnthropicRequestHandler.ts` | **新增** | 请求处理和转发 |
| `src/main/services/agents/anthropic-proxy/RequestConverter.ts` | **新增** | Anthropic -> OpenAI 请求转换 |
| `src/main/services/agents/anthropic-proxy/ResponseConverter.ts` | **新增** | OpenAI -> Anthropic 响应转换 |
| `src/main/services/agents/anthropic-proxy/types.ts` | **新增** | 类型定义 |
| `src/main/services/agents/anthropic-proxy/index.ts` | **新增** | 导出 |
| `src/main/services/agents/services/claudecode/index.ts` | **修改** | 添加协议检测和代理 URL 配置 |
| `src/main/index.ts` 或 `src/main/services/AppService.ts` | **修改** | 启动代理服务 |

## 类型定义

**新文件**: `src/main/services/agents/anthropic-proxy/types.ts`

```typescript
// Anthropic API 类型
export interface AnthropicRequest {
  model: string
  messages: AnthropicMessage[]
  max_tokens: number
  system?: string | AnthropicSystemBlock[]
  tools?: AnthropicTool[]
  stream?: boolean
  temperature?: number
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export type AnthropicSystemBlock =
  | { type: 'text'; text: string }
  | { type: 'text_cache'; text: string; cache_control: { type: 'ephemeral' } }

export interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

// OpenAI API 类型
export interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  max_tokens?: number
  tools?: OpenAITool[]
  stream?: boolean
  temperature?: number
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIContentPart[]
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAIChunk {
  id: string
  choices: Array<{
    index: number
    delta: {
      content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
  }
}

// Anthropic 流式事件类型
export type AnthropicStreamEvent =
  | { type: 'message_start'; message: AnthropicMessageStart }
  | { type: 'content_block_start'; index: number; content_block: AnthropicContentBlockStart }
  | { type: 'content_block_delta'; index: number; delta: AnthropicContentDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }

export interface AnthropicMessageStart {
  id: string
  type: 'message'
  role: 'assistant'
  content: []
  model: string
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

export type AnthropicContentBlockStart =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: {} }

export type AnthropicContentDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }
```

## 功能支持矩阵

| 功能 | 状态 | 说明 |
|------|------|------|
| 基本对话 | ✅ | 请求/响应转换 |
| 流式响应 | ✅ | SSE 事件转换 |
| 工具调用 | ✅ | tool_use <-> tool_calls |
| 图片输入 | ✅ | image block <-> image_url |
| 系统提示词 | ✅ | system 字段转换 |
| MCP 集成 | ✅ | SDK 自动处理 |
| 会话恢复 | ✅ | SDK 自动处理 |
| 权限管理 | ✅ | SDK 自动处理 |
| Extended Thinking | ⚠️ | OpenAI 不支持，需降级处理 |
| Prompt Caching | ⚠️ | OpenAI 不支持，需忽略 |

## 详细转换逻辑

### Image Block 转换

#### Anthropic 格式 (请求)

Anthropic 支持两种图片格式：

```typescript
// 格式 1: Base64 编码
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg",  // 或 "image/png", "image/gif", "image/webp"
    data: "base64_encoded_data_here"
  }
}

// 格式 2: URL
{
  type: "image",
  source: {
    type: "url",
    url: "https://example.com/image.jpg"
  }
}
```

#### OpenAI 格式 (请求)

OpenAI 只支持一种格式：

```typescript
{
  type: "image_url",
  image_url: {
    url: "https://example.com/image.jpg"  // 或 data URL
    detail: "auto" | "low" | "high"  // 可选
  }
}
```

#### 转换规则

| Anthropic | OpenAI |
|-----------|--------|
| `source.type = "base64"` | 转换为 data URL: `data:{media_type};base64,{data}` |
| `source.type = "url"` | 直接使用 URL |

#### 转换代码示例

```typescript
private convertImageBlock(block: AnthropicImageBlock): OpenAIImagePart {
  if (block.source.type === 'base64') {
    // Base64 -> Data URL
    return {
      type: 'image_url',
      image_url: {
        url: `data:${block.source.media_type};base64,${block.source.data}`,
        detail: 'auto'
      }
    }
  } else {
    // URL 直接使用
    return {
      type: 'image_url',
      image_url: {
        url: block.source.url,
        detail: 'auto'
      }
    }
  }
}
```

#### 完整转换示例

**Anthropic 请求:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What's in this image?" },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgoAAAANSUhEUgAA..."
          }
        }
      ]
    }
  ]
}
```

**转换后的 OpenAI 请求:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What's in this image?" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
            "detail": "auto"
          }
        }
      ]
    }
  ]
}
```

### Tool Use / Tool Calls 转换

#### 请求转换: Anthropic tool_use -> OpenAI tool_calls

**Anthropic 助手消息 (包含工具调用):**
```json
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "I'll help you with that." },
    {
      "type": "tool_use",
      "id": "toolu_01ABC123",
      "name": "read_file",
      "input": { "path": "/src/index.ts" }
    }
  ]
}
```

**转换后的 OpenAI 消息:**
```json
{
  "role": "assistant",
  "content": "I'll help you with that.",
  "tool_calls": [
    {
      "id": "toolu_01ABC123",
      "type": "function",
      "function": {
        "name": "read_file",
        "arguments": "{\"path\":\"/src/index.ts\"}"
      }
    }
  ]
}
```

#### 请求转换: Anthropic tool_result -> OpenAI tool role

**Anthropic 用户消息 (包含工具结果):**
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01ABC123",
      "content": "import { hello } from './world'",
      "is_error": false
    }
  ]
}
```

**转换后的 OpenAI 消息:**
```json
{
  "role": "tool",
  "tool_call_id": "toolu_01ABC123",
  "content": "import { hello } from './world'"
}
```

#### 响应转换: OpenAI tool_calls -> Anthropic tool_use

**OpenAI 流式响应 (工具调用增量):**
```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"read_file","arguments":""}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"path\":"}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"/src/index.ts\"}"}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}
```

**转换后的 Anthropic 流式事件:**
```
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_123","name":"read_file","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"path\":"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"/src/index.ts\""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}
```

### 工具定义转换

**Anthropic 工具定义:**
```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read a file from the filesystem",
      "input_schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "File path" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

**转换后的 OpenAI 工具定义:**
```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read a file from the filesystem",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string", "description": "File path" }
          },
          "required": ["path"]
        }
      }
    }
  ]
}
```

### 系统提示词转换

**Anthropic 系统提示词:**
```json
{
  "system": "You are a helpful assistant.\n\nFollow these rules:\n1. Be concise"
}
```

**转换后的 OpenAI 消息:**
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant.\n\nFollow these rules:\n1. Be concise"
    }
    // ... 其他消息
  ]
}
```

### 媒体类型支持

| 格式 | MIME Type | Anthropic | OpenAI |
|------|-----------|-----------|--------|
| JPEG | `image/jpeg` | ✅ | ✅ |
| PNG | `image/png` | ✅ | ✅ |
| GIF | `image/gif` | ✅ | ✅ |
| WebP | `image/webp` | ✅ | ✅ |

### 特殊处理

1. **空内容处理**: 如果 assistant 消息只有 tool_use 没有 text，OpenAI 的 `content` 应设为 `null`
2. **多图片处理**: 单条消息可以包含多个 image block，顺序保持不变
3. **工具调用索引**: OpenAI 使用 `index` 字段追踪多个工具调用，需要正确映射到 Anthropic 的 content block index

## 单元测试覆盖

### 测试文件结构

```
src/main/services/agents/anthropic-proxy/__tests__/
├── RequestConverter.test.ts
├── ResponseConverter.test.ts
└── integration.test.ts
```

### RequestConverter 测试用例

**文件**: `src/main/services/agents/anthropic-proxy/__tests__/RequestConverter.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { RequestConverter } from '../RequestConverter'

describe('RequestConverter', () => {
  const converter = new RequestConverter()

  describe('convertRequest', () => {
    it('should convert basic text message', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [
          { role: 'user' as const, content: 'Hello' }
        ],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.model).toBe('gpt-4')
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello'
      })
    })

    it('should convert system prompt to system message', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        system: 'You are helpful.',
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are helpful.'
      })
    })

    it('should convert image block (base64) to image_url', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'What is this?' },
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/png',
                data: 'iVBORw0KGgoAAAANSUhEUgA...'
              }
            }
          ]
        }],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.messages[0].content).toHaveLength(2)
      expect((result.messages[0].content as any[])[1]).toEqual({
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA...',
          detail: 'auto'
        }
      })
    })

    it('should convert image block (url) to image_url', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{
          role: 'user' as const,
          content: [{
            type: 'image' as const,
            source: {
              type: 'url' as const,
              url: 'https://example.com/image.jpg'
            }
          }]
        }],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect((result.messages[0].content as any[])[0]).toEqual({
        type: 'image_url',
        image_url: {
          url: 'https://example.com/image.jpg',
          detail: 'auto'
        }
      })
    })

    it('should convert tool_use to tool_calls', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'Let me help.' },
            {
              type: 'tool_use' as const,
              id: 'toolu_123',
              name: 'read_file',
              input: { path: '/src/index.ts' }
            }
          ]
        }],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Let me help.',
        tool_calls: [{
          id: 'toolu_123',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"/src/index.ts"}'
          }
        }]
      })
    })

    it('should convert tool_result to tool role message', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: 'toolu_123',
            content: 'file content here',
            is_error: false
          }]
        }],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.messages[0]).toEqual({
        role: 'tool',
        tool_call_id: 'toolu_123',
        content: 'file content here'
      })
    })

    it('should convert tools definition', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        tools: [{
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.tools).toHaveLength(1)
      expect(result.tools![0]).toEqual({
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      })
    })

    it('should handle multiple tool_use in single message', () => {
      const anthropicReq = {
        model: 'claude-3-sonnet',
        messages: [{
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'Let me check both files.' },
            {
              type: 'tool_use' as const,
              id: 'toolu_1',
              name: 'read_file',
              input: { path: '/src/a.ts' }
            },
            {
              type: 'tool_use' as const,
              id: 'toolu_2',
              name: 'read_file',
              input: { path: '/src/b.ts' }
            }
          ]
        }],
        max_tokens: 1024
      }

      const result = converter.convertRequest(anthropicReq, 'gpt-4')

      expect(result.messages[0].tool_calls).toHaveLength(2)
    })
  })
})
```

### ResponseConverter 测试用例

**文件**: `src/main/services/agents/anthropic-proxy/__tests__/ResponseConverter.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { ResponseConverter } from '../ResponseConverter'

describe('ResponseConverter', () => {
  const converter = new ResponseConverter()

  describe('convertStream', () => {
    it('should generate message_start event first', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] }
      ]

      const events: string[] = []
      for await (const event of converter.convertStream(async function* () {
        for (const c of chunks) yield c
      }())) {
        events.push(event)
      }

      expect(events[0]).toContain('event: message_start')
    })

    it('should convert text delta to text_delta event', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] }
      ]

      const events: string[] = []
      for await (const event of converter.convertStream(async function* () {
        for (const c of chunks) yield c
      }())) {
        events.push(event)
      }

      const textDeltas = events.filter(e => e.includes('text_delta'))
      expect(textDeltas).toHaveLength(2)
    })

    it('should convert tool_calls to tool_use events', async () => {
      const chunks = [
        { choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_123',
              function: { name: 'read_file', arguments: '' }
            }]
          }
        }]},
        { choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '{"path":' }
            }]
          }
        }]},
        { choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '"/src/index.ts"}' }
            }]
          }
        }]},
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      ]

      const events: string[] = []
      for await (const event of converter.convertStream(async function* () {
        for (const c of chunks) yield c
      }())) {
        events.push(event)
      }

      const toolStartEvent = events.find(e => e.includes('content_block_start') && e.includes('tool_use'))
      expect(toolStartEvent).toBeDefined()
      expect(toolStartEvent).toContain('read_file')

      const inputDeltas = events.filter(e => e.includes('input_json_delta'))
      expect(inputDeltas).toHaveLength(2)
    })

    it('should handle multiple parallel tool calls', async () => {
      const chunks = [
        { choices: [{
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'read_file', arguments: '' } },
              { index: 1, id: 'call_2', function: { name: 'write_file', arguments: '' } }
            ]
          }
        }]},
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
      ]

      const events: string[] = []
      for await (const event of converter.convertStream(async function* () {
        for (const c of chunks) yield c
      }())) {
        events.push(event)
      }

      const toolStartEvents = events.filter(e => e.includes('content_block_start') && e.includes('tool_use'))
      expect(toolStartEvents).toHaveLength(2)
    })

    it('should generate proper event sequence', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] }
      ]

      const events: string[] = []
      for await (const event of converter.convertStream(async function* () {
        for (const c of chunks) yield c
      }())) {
        events.push(event)
      }

      // 顺序: message_start -> content_block_start -> content_block_delta -> content_block_stop -> message_delta -> message_stop
      const eventTypes = events.map(e => {
        const match = e.match(/event: (\w+)/)
        return match ? match[1] : null
      })

      expect(eventTypes[0]).toBe('message_start')
      expect(eventTypes[1]).toBe('content_block_start')
      expect(eventTypes[eventTypes.length - 2]).toBe('message_delta')
      expect(eventTypes[eventTypes.length - 1]).toBe('message_stop')
    })

    it('should include usage in message_delta', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { usage: { prompt_tokens: 100, completion_tokens: 50 } }
      ]

      const events: string[] = []
      for await (const event of converter.convertStream(async function* () {
        for (const c of chunks) yield c
      }())) {
        events.push(event)
      }

      const deltaEvent = events.find(e => e.includes('message_delta'))
      expect(deltaEvent).toContain('output_tokens')
      expect(deltaEvent).toContain('50')
    })
  })
})
```

### 集成测试

**文件**: `src/main/services/agents/anthropic-proxy/__tests__/integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { AnthropicProxyServer } from '../AnthropicProxyServer'

describe('AnthropicProxyServer Integration', () => {
  let server: AnthropicProxyServer
  const testPort = 19876

  beforeAll(async () => {
    server = new AnthropicProxyServer({ port: testPort, host: '127.0.0.1' })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('should respond to /health endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/health`)
    expect(response.ok).toBe(true)
  })

  it('should handle /{providerId}/v1/messages endpoint', async () => {
    // 注意: 这个测试需要 mock provider 或者使用测试 provider
    const response = await fetch(`http://127.0.0.1:${testPort}/test-provider/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        stream: false
      })
    })

    // 期望 400 因为 test-provider 不存在
    expect(response.status).toBe(400)
  })

  it('should properly stream SSE events', async () => {
    // 这个测试需要更复杂的 mock 设置
    // 可以使用 MSW 或类似的库来 mock OpenAI API
  })
})
```

### 测试运行命令

```bash
# 运行所有测试
pnpm test src/main/services/agents/anthropic-proxy

# 运行单个测试文件
pnpm test RequestConverter.test.ts
```

## 风险评估

- **低风险**: 不修改 SDK，只是增加代理层
- **兼容性**: 需要确保转换覆盖所有边缘情况
- **性能**: 增加一跳代理，延迟略有增加但可接受
