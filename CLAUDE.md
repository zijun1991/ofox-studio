# AI Assistant Guide

This file provides guidance to AI coding assistants when working with code in this repository. Adherence to these guidelines is crucial for maintaining code quality and consistency.

## Guiding Principles (MUST FOLLOW)

- **Keep it clear**: Write code that is easy to read, maintain, and explain.
- **Match the house style**: Reuse existing patterns, naming, and conventions.
- **Search smart**: Prefer `ast-grep` for semantic queries; fall back to `rg`/`grep` when needed.
- **Log centrally**: Route all logging through `loggerService` with the right context—no `console.log`.
- **Research via subagent**: Lean on `subagent` for external docs, APIs, news, and references.
- **Always propose before executing**: Before making any changes, clearly explain your planned approach and wait for explicit user approval to ensure alignment and prevent unwanted modifications.
- **Lint, test, and format before completion**: Coding tasks are only complete after running `pnpm lint`, `pnpm test`, and `pnpm format` successfully.
- **Write conventional commits**: Commit small, focused changes using Conventional Commit messages (e.g., `feat:`, `fix:`, `refactor:`, `docs:`).
- **i18n via CRUD tool**: NEVER directly read or write locale JSON files. Always use `pnpm i18n:crud` commands (`add`, `set`, `get`, `delete`, `list`, `search`) to operate on translation resources.

## Pull Request Workflow (CRITICAL)

When creating a Pull Request, you MUST use the `gh-create-pr` skill.
If the skill is unavailable, directly read `.agents/skills/gh-create-pr/SKILL.md` and follow it manually.

## Development Commands

- **Install**: `pnpm install` - Install all project dependencies
- **Development**: `pnpm dev` - Runs Electron app in development mode with hot reload
- **Debug**: `pnpm debug` - Starts with debugging enabled, use `chrome://inspect` to attach debugger
- **Build Check**: `pnpm build:check` - **REQUIRED** before commits (lint + test + typecheck)
  - If having i18n sort issues, run `pnpm i18n:sync` first to sync template
  - If having formatting issues, run `pnpm format` first
- **i18n CRUD**: `pnpm i18n:crud <command>` - **MUST use this for all i18n operations** instead of directly reading/writing locale JSON files. See `i18n-workflow` skill for details.
- **Test**: `pnpm test` - Run all tests (Vitest) across main and renderer processes
- **Single Test**:
  - `pnpm test:main` - Run tests for main process only
  - `pnpm test:renderer` - Run tests for renderer process only
- **Lint**: `pnpm lint` - Fix linting issues and run TypeScript type checking
- **Format**: `pnpm format` - Auto-format code using Biome

## Project Architecture

### Electron Structure

- **Main Process** (`src/main/`): Node.js backend with services (MCP, Knowledge, Storage, etc.)
- **Renderer Process** (`src/renderer/`): React UI with Redux state management
- **Preload Scripts** (`src/preload/`): Secure IPC bridge

### Key Components

- **AI Core** (`src/renderer/src/aiCore/`): Middleware pipeline for multiple AI providers.
- **Services** (`src/main/services/`): MCPService, KnowledgeService, WindowService, etc.
- **Build System**: Electron-Vite with experimental rolldown-vite, pnpm workspaces.
- **State Management**: Redux Toolkit (`src/renderer/src/store/`) for predictable state.

### Turbo Agent 工作目录与配置目录

极速模式（Speedy/Turbo Mode）的 Turbo Agent 有两个关键目录概念，**目前耦合在同一个路径** `~/Documents/Ofox Claw`（即 `accessible_paths[0]`）：

**默认路径定义**: `src/main/services/agents/services/AgentService.ts:101`
```typescript
const defaultPath = path.join(os.homedir(), 'Documents', 'Ofox Claw')
```

#### 1. 工作目录 (cwd)
- Claude Code SDK 执行时的当前工作目录，用户的工作文件产出在此
- 取自 `session.accessible_paths[0]`
- 设置位置: `src/main/services/agents/services/claudecode/index.ts:139`

#### 2. 配置目录 (.claude/)
- 存储 `.claude/skills/`、`.claude/commands/`、`.claude/plugins/`、`.claude/plugins.json`
- 由 `initializePresetSkills(workdir)` 安装 preset skills 到 `{workdir}/.claude/skills/`
- 由 `PluginService.getClaudeBasePath(workdir)` 定位: `{workdir}/.claude`
- `workdir` 来源: `PluginService.getWorkdirOrThrow()` → `agent.accessible_paths[0]`

#### 3. 全局 Claude 配置 (CLAUDE_CONFIG_DIR)
- 独立于上述两个目录，固定为 `app.getPath('userData')/.claude`
- 设置位置: `claudecode/index.ts:210` 通过环境变量 `CLAUDE_CONFIG_DIR` 传递给 SDK

#### 关键文件
| 职责 | 文件 |
|------|------|
| 默认路径定义 & Agent 创建 | `src/main/services/agents/services/AgentService.ts` |
| Preset skills 安装 | 同上 `initializePresetSkills()` |
| Claude SDK cwd & env | `src/main/services/agents/services/claudecode/index.ts` |
| 插件管理 (.claude/) | `src/main/services/agents/plugins/PluginService.ts` |
| 路径验证 & 目录创建 | `src/main/services/agents/BaseService.ts` `ensurePathsExist()` |
| UI 工作区同步 | `src/renderer/src/hooks/agents/useTurboWorkspaceSync.ts` |

> **注意**: 若未来要拆分工作目录和配置目录（例如 cwd 改为 `workspace/` 子目录），需要让 `initializePresetSkills` 和 `PluginService` 使用独立的配置根路径，而非直接依赖 `accessible_paths[0]`。

### Logging

```typescript
import { loggerService } from "@logger";
const logger = loggerService.withContext("moduleName");
// Renderer: loggerService.initWindowSource('windowName') first
logger.info("message", CONTEXT);
```
