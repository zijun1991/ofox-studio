---
name: mcp-architecture
description: Reference guide for MCP (Model Context Protocol) server initialization, configuration, management, and tool invocation architecture. Use when investigating bugs, adding features, or refactoring code related to MCP server lifecycle, transport selection, tool discovery/execution, Hub aggregator, OAuth flow, DXT extensions, or MCP settings UI.
---

# MCP Architecture Reference

## Overview

MCP (Model Context Protocol) 是本项目的核心扩展机制，允许 AI 助手通过标准化协议调用外部工具。架构横跨 Main Process（服务端）和 Renderer Process（UI + AI Pipeline），通过 IPC 桥接。

```
Settings UI (Redux) → IPC Bridge → MCPService (Main) → MCP SDK Client → Server (Stdio/SSE/HTTP/InMemory)
                                                                              ↑
AI Pipeline (Renderer) ──── callMCPTool() ──── IPC ──── MCPService.callTool() ─┘
```

### 三种 MCP 模式 (`McpMode`)

| 模式 | 行为 |
|------|------|
| `disabled` | 不加载任何 MCP 工具 |
| `manual` | 用户选择的 MCP 服务器工具直接暴露给 LLM |
| `auto` | 注入 Hub 元服务器，LLM 通过 `list/inspect/invoke/exec` 四个元工具间接使用所有工具 |

---

## Data Flow

### 初始化流程

```
┌─────────────────────────────────────┐
│  App Startup (useAppInit)           │
│  initializeMCPServers()             │
│  → 合并 builtinMCPServers 到 Redux  │
└──────────────┬──────────────────────┘
               │ Redux persist (localStorage)
┌──────────────▼──────────────────────┐
│  Redux Store (mcp slice)            │
│  MCPConfig { servers, isUvInstalled │
│              isBunInstalled }       │
└──────────────┬──────────────────────┘
               │ AI Pipeline 请求工具时
┌──────────────▼──────────────────────┐
│  MCPService.initClient(server)      │
│  → 选择 Transport 类型              │
│  → 创建 MCP SDK Client              │
│  → 连接并缓存                       │
└─────────────────────────────────────┘
```

### 工具调用流程

```
┌──────────────────────────────────────┐
│  AI Pipeline (Renderer)              │
│  LLM 返回 tool_use / function_call  │
└──────────────┬───────────────────────┘
               │ callMCPTool()
┌──────────────▼───────────────────────┐
│  window.api.mcp.callTool() (Preload) │
└──────────────┬───────────────────────┘
               │ IPC (Mcp_CallTool)
┌──────────────▼───────────────────────┐
│  MCPService.callTool()               │
│  1. initClient() (如未连接)          │
│  2. client.callTool() via MCP SDK    │
│  3. AbortController 超时管理         │
│  4. Progress 事件推送到 Renderer     │
└──────────────┬───────────────────────┘
               │ MCPCallToolResponse
┌──────────────▼───────────────────────┐
│  AI Pipeline 将结果注入下一轮对话     │
└──────────────────────────────────────┘
```

---

## Key Files Index

### MCPService 核心 (Main Process)

| File | Purpose |
|------|---------|
| `src/main/services/MCPService.ts` | 核心单例服务：客户端生命周期、工具调用、Transport 选择、缓存管理 |
| `src/main/services/mcp/ServerLogBuffer.ts` | 每服务器日志环形缓冲区（200 条） |
| `src/main/services/mcp/oauth/provider.ts` | OAuth 客户端 Provider |
| `src/main/services/mcp/oauth/callback.ts` | OAuth 回调 HTTP 服务器 |
| `src/main/services/mcp/oauth/storage.ts` | OAuth Token 持久化存储 |
| `src/main/services/DxtService.ts` | DXT (Desktop Extension) 包上传、解压、配置解析 |
| `src/main/services/CacheService.ts` | 通用缓存服务（工具列表等 5 分钟 TTL） |

### 内置 MCP 服务器 (Main Process)

| File | Purpose |
|------|---------|
| `src/main/mcpServers/factory.ts` | `createInMemoryMCPServer()` 工厂分发 |
| `src/main/mcpServers/memory.ts` | 知识图谱记忆服务 |
| `src/main/mcpServers/sequentialthinking.ts` | 顺序思维推理 |
| `src/main/mcpServers/brave-search.ts` | Brave 搜索 |
| `src/main/mcpServers/fetch.ts` | Web 抓取 |
| `src/main/mcpServers/filesystem/` | 文件系统操作 |
| `src/main/mcpServers/dify-knowledge.ts` | Dify 知识库 |
| `src/main/mcpServers/python.ts` | Python 执行 |
| `src/main/mcpServers/didi-mcp.ts` | DiDi API |
| `src/main/mcpServers/browser/` | 浏览器控制 |
| `src/main/mcpServers/scheduler.ts` | 定时任务调度 |

### Hub 元服务器 (Main Process)

| File | Purpose |
|------|---------|
| `src/main/mcpServers/hub/index.ts` | Hub Server：聚合所有 MCP 工具，暴露 `list/inspect/invoke/exec` 元工具 |
| `src/main/mcpServers/hub/mcp-bridge.ts` | 桥接 MCPService 方法，维护 ToolNameMapping |
| `src/main/mcpServers/hub/runtime.ts` | Worker 线程沙箱执行用户 JS 代码（60 秒超时） |
| `src/main/mcpServers/hub/toolname.ts` | 工具名称解析（JS camelCase ↔ `serverId__toolName`） |
| `src/main/mcpServers/hub/format.ts` | 工具列表文本 / JSDoc 格式化 |
| `src/main/mcpServers/hub/worker.ts` | Worker 线程源码 |

### Redux Store (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/store/mcp.ts` | `mcpSlice`：服务器列表 CRUD、内置服务器定义、`initializeMCPServers()` |

### React Hooks (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/hooks/useMCPServers.ts` | `useMCPServers()` / `useMCPServer(id)` hooks + IPC 事件监听 |
| `src/renderer/src/hooks/useMCPServerTrust.tsx` | 不受信任服务器（protocol 安装）的确认弹窗 |

### AI Pipeline 集成 (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/aiCore/utils/mcp.ts` | `setupToolsConfig()` / `convertMcpToolsToAiSdkTools()`：转换为 AI SDK ToolSet |
| `src/renderer/src/aiCore/prepareParams/parameterBuilder.ts` | `buildStreamTextParams()` 中注入 MCP 工具 |
| `src/renderer/src/aiCore/legacy/middleware/core/McpToolChunkMiddleware.ts` | 旧管线工具执行中间件（递归深度 ≤ 20） |

### 工具转换工具集 (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/utils/mcp-tools.ts` | 多 Provider 格式转换（OpenAI / Anthropic / Gemini / Bedrock）、XML 解析、自动批准逻辑 |

### 权限与工具控制 (Renderer + Main)

| File | Purpose |
|------|---------|
| `src/renderer/src/pages/settings/AgentSettings/components/ToolsSettings.tsx` | Agent 工具设置：MCP switch + 工具自动批准勾选 |
| `src/renderer/src/pages/settings/AgentSettings/components/PermissionModeSettings.tsx` | 权限模式选择，触发 `allowed_tools` 重算 |
| `src/renderer/src/pages/settings/AgentSettings/shared.tsx` | `computeModeDefaults()` 根据权限模式计算 allowed_tools |
| `src/main/services/agents/BaseService.ts` | `listMcpTools()` 工具发现 + `normalizeAllowedTools()` ID 归一化 |
| `src/main/services/agents/services/claudecode/index.ts` | SDK 集成：`allowedTools` 传递 + `canUseTool` 权限检查 |
| `src/main/services/agents/services/claudecode/tools.ts` | 内置工具定义（`builtinTools`） |

### Settings UI (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/pages/settings/MCPSettings/index.tsx` | MCP 设置主页（服务器列表 / 内置 / 市场 / Provider） |
| `src/renderer/src/pages/settings/MCPSettings/McpSettings.tsx` | 单服务器设置表单（连接参数 / 工具 / Prompts / Resources） |
| `src/renderer/src/pages/settings/MCPSettings/AddMcpServerModal.tsx` | JSON 导入 / DXT 上传添加服务器 |
| `src/renderer/src/pages/settings/MCPSettings/EditMcpJsonPopup.tsx` | 批量 JSON 编辑器 |
| `src/renderer/src/pages/settings/MCPSettings/McpServerCard.tsx` | 服务器卡片组件 |
| `src/renderer/src/pages/settings/MCPSettings/McpServersList.tsx` | 用户服务器列表 |
| `src/renderer/src/pages/settings/MCPSettings/BuiltinMCPServerList.tsx` | 内置服务器列表 |
| `src/renderer/src/pages/settings/MCPSettings/McpMarketList.tsx` | 市场浏览器 |
| `src/renderer/src/pages/settings/MCPSettings/NpxSearch.tsx` | NPX 包搜索 |
| `src/renderer/src/pages/settings/MCPSettings/McpTool.tsx` | 工具开关 / 自动批准 |
| `src/renderer/src/pages/settings/MCPSettings/SyncServersPopup.tsx` | 服务器同步 UI |
| `src/renderer/src/pages/settings/MCPSettings/ProtocolInstallWarning.tsx` | 协议安装信任警告 |
| `src/renderer/src/pages/settings/MCPSettings/providers/config.ts` | Provider 注册表 |
| `src/renderer/src/pages/settings/AssistantSettings/AssistantMCPSettings.tsx` | 助手级 MCP 配置 |

### IPC 注册 (Main Process)

| File | Purpose |
|------|---------|
| `src/main/ipc.ts` (≈lines 819-833) | MCP IPC handler 注册 |
| `src/preload/index.ts` (≈lines 397-429) | `window.api.mcp.*` 桥接 |

### Type 定义

| File | Purpose |
|------|---------|
| `src/renderer/src/types/mcp.ts` | Zod schemas：`McpServerTypeSchema`、`McpServerConfigSchema`、`McpConfigSchema`、验证函数 |
| `src/renderer/src/types/tool.ts` | `MCPTool` 接口 |
| `src/renderer/src/types/index.ts` | `MCPServer`、`McpMode`、`MCPCallToolResponse` 等核心类型 |
| `packages/shared/IpcChannel.ts` | MCP IPC Channel 枚举 |
| `packages/shared/mcp.ts` | 工具名称构建函数 |

### API Server (Main Process)

| File | Purpose |
|------|---------|
| `src/main/apiServer/routes/mcp.ts` | REST API：`GET /v1/mcps`、`GET /v1/mcps/:server_id`、`ALL /v1/mcps/:server_id/mcp` |
| `src/main/apiServer/services/mcp.ts` | `MCPApiService`：REST → MCPService 桥接 + StreamableHTTP 代理 |
| `src/main/apiServer/utils/mcp.ts` | `getMCPServersFromRedux()`：从 Redux 获取配置（5 分钟缓存） |

### Input Bar 集成 (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/pages/home/Inputbar/tools/mcpToolsTool.tsx` | MCP 工具选择入口注册 |
| `src/renderer/src/pages/home/Inputbar/tools/components/MCPToolsButton.tsx` | MCP 工具选择按钮 |

### Protocol 安装 (Main Process)

| File | Purpose |
|------|---------|
| `src/main/services/urlschema/mcp-install.ts` | URL scheme 安装：`ofoxclaw://mcp/install?servers={base64(JSON)}` |

---

## Transport 选择逻辑

`MCPService.initClient()` 根据服务器配置选择 Transport：

```
server config
    │
    ├── isBuiltinMCPServer && !mcpAutoInstall
    │   └── InMemoryTransport (factory.ts 创建 Server)
    │
    ├── type === 'sse' && baseUrl
    │   └── SSEClientTransport
    │
    ├── type === 'streamableHttp' || name === 'nowledgeMem'
    │   └── StreamableHTTPClientTransport
    │
    └── command (stdio 类)
        └── StdioClientTransport
            ├── command 为 npx/uvx/uv → 解析 registry 镜像
            ├── DXT 路径 → DxtService 解析配置
            └── 继承 login shell 环境变量
```

### Stdio 命令处理细节

- **bun fallback**：若 `isBunInstalled` 且命令为 npx，自动替换为 `bunx`
- **Registry 注入**：NPM registry（`--registry`）和 UV index（`--index-url`）从设置或默认源注入
- **环境变量**：合并 login shell env + server.env + `PATH` 扩展
- **DXT 支持**：有 `dxtPath` 时通过 `DxtService.resolveConfig()` 获取最终命令和环境

---

## Type 定义

### 核心类型

```typescript
// McpMode — 助手级 MCP 模式
type McpMode = 'disabled' | 'auto' | 'manual'

// McpServerType — 传输类型
type McpServerType = 'stdio' | 'sse' | 'streamableHttp' | 'inMemory'

// MCPServerInstallSource — 安装来源
type MCPServerInstallSource = 'builtin' | 'manual' | 'protocol' | 'unknown'

// MCPServer — 服务器配置
interface MCPServer {
  id: string
  name: string
  type?: McpServerType
  description?: string
  baseUrl?: string              // SSE / StreamableHTTP
  command?: string              // Stdio
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  registryUrl?: string          // NPM/UV registry mirror
  timeout?: number
  longRunning?: boolean
  isActive: boolean
  disabledTools?: string[]
  disabledAutoApproveTools?: string[]
  autoApprove?: string[]
  dxtPath?: string              // DXT extension path
  installSource?: MCPServerInstallSource
  isTrusted?: boolean
  // ... more fields
}

// MCPTool — 工具定义
interface MCPTool {
  id: string                    // buildFunctionCallToolName(serverName, toolName)
  serverId: string
  serverName: string
  name: string
  description?: string
  inputSchema: JSONSchema
  outputSchema?: JSONSchema
  isBuiltIn?: boolean
  type: 'mcp'
}

// MCPCallToolResponse — 工具调用结果
interface MCPCallToolResponse {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError?: boolean
}

// MCPConfig — Redux 状态
interface MCPConfig {
  servers: MCPServer[]
  isUvInstalled: boolean
  isBunInstalled: boolean
}
```

### 工具名称构建

```typescript
// packages/shared/mcp.ts
buildFunctionCallToolName(serverName, toolName)  // → "mcp__{server}__{tool}" (max 63 chars)
generateMcpToolFunctionName(serverName, toolName) // → "server_tool"
```

---

## IPC Channels

```typescript
// packages/shared/IpcChannel.ts
Mcp_AddServer          = 'mcp:add-server'          // main → renderer (推送新服务器)
Mcp_RemoveServer       = 'mcp:remove-server'
Mcp_RestartServer      = 'mcp:restart-server'
Mcp_StopServer         = 'mcp:stop-server'
Mcp_ListTools          = 'mcp:list-tools'
Mcp_CallTool           = 'mcp:call-tool'
Mcp_ListPrompts        = 'mcp:list-prompts'
Mcp_GetPrompt          = 'mcp:get-prompt'
Mcp_ListResources      = 'mcp:list-resources'
Mcp_GetResource        = 'mcp:get-resource'
Mcp_GetInstallInfo     = 'mcp:get-install-info'
Mcp_ServersChanged     = 'mcp:servers-changed'      // main → renderer
Mcp_ServersUpdated     = 'mcp:servers-updated'
Mcp_CheckConnectivity  = 'mcp:check-connectivity'
Mcp_UploadDxt          = 'mcp:upload-dxt'
Mcp_AbortTool          = 'mcp:abort-tool'
Mcp_GetServerVersion   = 'mcp:get-server-version'
Mcp_Progress           = 'mcp:progress'             // main → renderer (工具进度)
Mcp_GetServerLogs      = 'mcp:get-server-logs'
Mcp_ServerLog          = 'mcp:server-log'            // main → renderer (实时日志)
```

---

## 内置 MCP 服务器 (12 个)

定义在 `src/renderer/src/store/mcp.ts` 的 `builtinMCPServers` 数组：

| Name | 默认激活 | 备注 |
|------|---------|------|
| `@cherry/mcp-auto-install` | No | NPX 自动安装器 |
| `@cherry/memory` | Yes | 知识图谱记忆（需 MEMORY_FILE_PATH） |
| `@cherry/sequential-thinking` | Yes | 顺序思维推理 |
| `@cherry/brave-search` | No | 需 BRAVE_API_KEY |
| `@cherry/fetch` | Yes | Web 抓取 |
| `@cherry/filesystem` | No | 需路径配置 |
| `@cherry/dify-knowledge` | No | 需 DIFY_KEY |
| `@cherry/python` | No | Python 执行 |
| `@cherry/didi-mcp` | No | 需 DIDI_API_KEY |
| `@cherry/browser` | No | 浏览器控制 |
| `@cherry/nowledge-mem` | No | Nowledge 记忆服务 |
| `@cherry/scheduler` | Yes | 定时任务调度 |

**Hub 服务器** (`@cherry/hub`) 单独定义，auto 模式下程序自动注入，不出现在用户列表中。

---

## Hub 元服务器

Hub 是 auto 模式的核心，聚合所有活跃 MCP 服务器的工具，对 LLM 暴露四个元工具：

| 元工具 | 功能 |
|--------|------|
| `list` | 分页列出所有可用工具（名称 + 简述） |
| `inspect` | 返回单个工具的 JSDoc 签名 |
| `invoke` | 按名称调用单个工具 |
| `exec` | 执行 JS 代码，可调用 `mcp.callTool()` 进行多工具编排 |

`exec` 在 Worker 线程中沙箱执行，60 秒超时，支持 AbortController 取消。

---

## MCPService 内部状态

```typescript
class McpService {
  clients: Map<string, Client>                    // configHash → SDK Client
  pendingClients: Map<string, Promise<Client>>    // 并发初始化去重
  activeToolCalls: Map<string, AbortController>   // callId → abort controller
  serverLogs: ServerLogBuffer                     // 每服务器日志（200 条环形缓冲）
}
```

### 缓存策略

- **工具列表**：`listTools()` 结果缓存 5 分钟（`CacheService`）
- **Redux 服务器配置**：`getMCPServersFromRedux()` 缓存 5 分钟
- **Client 连接**：基于 `configHash` 复用已有连接

### 超时策略

- 默认工具调用超时：60 秒
- `longRunning` 服务器：超时时间从 server.timeout 或更长
- Webhook connector：5 分钟请求超时

---

## OAuth 流程

用于需要 OAuth 认证的 SSE / StreamableHTTP 服务器：

1. `initClient()` 检测到需要 OAuth
2. 创建 `McpOAuthClientProvider` + `CallBackServer`（本地 HTTP 回调）
3. 打开浏览器进行 OAuth 授权
4. 回调服务器接收 token，存储到 `OAuthStorage`
5. Transport 携带 token 连接 MCP 服务器

---

## Protocol 安装

支持 URL scheme 安装 MCP 服务器：

```
ofoxclaw://mcp/install?servers={base64(JSON)}
```

- 安装的服务器标记为 `installSource: 'protocol'`，`isTrusted: false`
- 用户需通过 `useMCPServerTrust` 弹窗确认后才能激活
- 弹窗展示将要执行的命令，防止恶意 MCP 服务器注入

---

## REST API 端点

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/mcps` | 列出所有活跃 MCP 服务器 |
| `GET` | `/v1/mcps/:server_id` | 获取服务器信息 + 工具列表 |
| `ALL` | `/v1/mcps/:server_id/mcp` | StreamableHTTP 代理（透传到 MCP 服务器） |

---

## AI Pipeline 集成

### 新管线 (AI SDK)

`src/renderer/src/aiCore/utils/mcp.ts` 中 `convertMcpToolsToAiSdkTools()` 将 `MCPTool[]` 转为 AI SDK `ToolSet`：

- 每个工具的 `execute` 函数：
  1. 检查自动批准 (`isToolAutoApproved`)
  2. 未自动批准则 `requestToolConfirmation()` 等待用户确认
  3. 调用 `callMCPTool()` → IPC → MCPService
  4. `toModelOutput()` 将多模态结果转为文本

### 旧管线 (Legacy Middleware)

`McpToolChunkMiddleware` 处理完整工具执行生命周期：

- 拦截 `MCP_TOOL_CREATED` chunk
- 管理 `PENDING → IN_PROGRESS → COMPLETE` 状态流转
- 支持递归工具调用（最大深度 20）
- 构建包含工具结果的新 params 发起后续 LLM 调用

### 多 Provider 工具格式转换

`src/renderer/src/utils/mcp-tools.ts` 提供：

- `mcpToolsToOpenAIChatTools()` / `mcpToolsToOpenAIResponseTools()`
- `mcpToolsToAnthropicTools()`
- `mcpToolsToGeminiTools()`
- `mcpToolsToAwsBedrockTools()`
- 对应的 response 转换函数

---

## MCP 与权限模式的关系（三层解耦）

MCP 服务器的可用性涉及三个完全独立的控制层，互不影响：

```
┌───────────────────────────────────────────────────────────────────┐
│  Layer 1: 全局 isActive                                          │
│  存储: Redux state.mcp.servers[].isActive                        │
│  控制: MCP 设置页手动开关                                          │
│  含义: MCP 服务器进程是否启动                                      │
│  影响: isActive=false → Agent 设置中该服务器 switch 变灰不可操作    │
├───────────────────────────────────────────────────────────────────┤
│  Layer 2: Agent/Session mcps 绑定                                 │
│  存储: SQLite agents.mcps / sessions.mcps (JSON 数组)             │
│  控制: Agent 设置 → 工具 tab → MCP 服务器 switch                  │
│  含义: 该 Agent 可以使用哪些 MCP 服务器                            │
│  影响: 决定 listMcpTools() 返回哪些工具                            │
├───────────────────────────────────────────────────────────────────┤
│  Layer 3: allowed_tools 自动批准                                  │
│  存储: SQLite agents.allowed_tools / sessions.allowed_tools       │
│  控制: 权限模式 (permission_mode) + 工具 tab 手动勾选              │
│  含义: 哪些工具执行时不需要用户确认（自动批准白名单）                 │
│  影响: 工具仍然可用，只是决定是否需要弹窗确认                       │
└───────────────────────────────────────────────────────────────────┘
```

### `allowed_tools` 详解

`allowed_tools` 是一个 `string[]`，同时包含内置工具 ID 和 MCP 工具 ID：

- 内置工具 ID：`"Read"`, `"Bash"`, `"Edit"`, `"Glob"`, `"Grep"` 等
- MCP 工具 ID：`"mcp__<serverName>__<camelCaseToolName>"` 格式（如 `mcp__fetch__getPage`）

**它是自动批准白名单，不是可用工具限制列表。** 不在 `allowed_tools` 中的工具仍然可用，只是执行前需要用户手动确认。

相关文件：
- 类型定义：`src/renderer/src/types/agent.ts` (AgentBaseSchema)
- SDK 传递：`src/main/services/agents/services/claudecode/index.ts:344` → `options.allowedTools`
- 权限检查：同文件 `canUseTool` handler，检查 `autoAllowTools` Set
- 旧 ID 归一化：`src/main/services/agents/BaseService.ts` → `normalizeAllowedTools()`

### 权限模式对 `allowed_tools` 的影响

`computeModeDefaults()` 函数（`src/renderer/src/pages/settings/AgentSettings/shared.tsx:47-69`）：

| 权限模式 | allowed_tools 内容 |
|----------|-------------------|
| `default` / `plan` | 仅 `requirePermissions=false` 的工具（MCP 工具全部需要确认） |
| `acceptEdits` | 上述 + 文件编辑类工具（`Edit`, `Write`, `Bash(mkdir:*)` 等） |
| `bypassPermissions` | **所有工具**（包括全部 MCP 工具）自动批准 |

关键：MCP 工具在 `BaseService.listMcpTools()` 中创建时 `requirePermissions` 始终为 `true`，因此在 `default`/`plan` 模式下 MCP 工具总是需要用户确认。

### Agent 设置中 MCP Switch 的行为

`ToolsSettings.tsx` 中的 MCP 服务器开关：

```
switch checked  ← agentBase.mcps 数组中是否包含该服务器 ID
switch disabled ← 全局 isActive === false 时变灰
switch toggle   → handleToggleMcp() → update({ mcps: next })
                → PATCH /v1/agents/:id 或 /v1/agents/:id/sessions/:id
                → 更新数据库 mcps 字段
```

**不会修改全局 `isActive` 状态，也不会受权限模式影响。**

### 强制注入的默认 MCP

在 Claude Code Agent 集成中（`src/main/services/agents/services/claudecode/index.ts:382-396`），以下三个 MCP 服务器**始终被强制注入**，即使用户在 Agent 设置中关掉了它们：

- `scheduler`
- `python`
- `fetch`

### MCP 工具发现流程

`BaseService.listMcpTools()`（`src/main/services/agents/BaseService.ts:50-92`）：

1. 以 `builtinTools` 作为基础列表
2. 遍历 agent 的 `mcps` 数组
3. 对每个 MCP 服务器，调用 `mcpService.listTools()` 获取工具
4. 为每个工具生成 ID：`buildFunctionCallToolName(server.name, tool.name)`
5. 设置 `requirePermissions: true`、`type: 'mcp'`
6. 合并内置工具和 MCP 工具返回

---

## Architecture Patterns

### 懒初始化

MCPService 不在启动时连接所有服务器，而是在首次 `listTools()` 或 `callTool()` 时按需 `initClient()`。`pendingClients` Map 实现并发去重。

### Config Hash 复用

Client 以服务器配置的 hash 值为 key 缓存。配置变更时旧 client 自动失效。

### 双向事件推送

- Main → Renderer：`Mcp_ServersChanged`（配置变更）、`Mcp_Progress`（工具进度）、`Mcp_ServerLog`（实时日志）
- Renderer → Main：`Mcp_AddServer`（协议安装）触发后 Main 推送回 Renderer

### 信任机制

- `installSource: 'builtin' | 'manual'` → 默认信任
- `installSource: 'protocol'` → `isTrusted: false`，需用户确认
- 确认弹窗展示完整命令避免供应链攻击

### Agent 集成

- Agent 的 `mcps` 字段（JSON 数组）存储绑定的 MCP 服务器名称
- Turbo 系统代理默认 MCP：`scheduler`、`python`、`fetch`（且在 SDK 层强制注入）
- `McpToolAdapter`（`packages/ofox-agent/src/tools/McpToolAdapter.ts`）将 MCPTool 转为 Agent 系统的 `ToolDefinition`
- Agent 设置中的 MCP switch 修改的是 `agent.mcps` 数组，不影响全局 `isActive`

---

## Constants

| Constant | Value | Location |
|----------|-------|----------|
| Tool list cache TTL | 5 min | `MCPService` (CacheService) |
| Redux config cache TTL | 5 min | `apiServer/utils/mcp.ts` |
| Default tool timeout | 60s | `MCPService.callTool()` |
| Hub exec timeout | 60s | `hub/runtime.ts` |
| Server log buffer size | 200 entries | `ServerLogBuffer` |
| Max recursive tool depth | 20 | `McpToolChunkMiddleware` |
| Tool name max length | 63 chars | `buildFunctionCallToolName()` |
| Hub server ID | `'hub'` | `store/mcp.ts` |
