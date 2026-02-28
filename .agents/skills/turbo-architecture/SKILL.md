---
name: turbo-architecture
description: Reference guide for Turbo Mode (极速模式) data storage and session management architecture. Use when investigating bugs, adding features, or refactoring code related to the Speedy/Turbo conversation list, session CRUD, workspace sync, or the agent_turbo_system pipeline.
---

# Turbo Mode Architecture Reference

## Overview

Turbo Mode (极速模式) uses a system agent (`agent_turbo_system`) to manage lightweight chat sessions. Data flows through a six-layer architecture:

```
UI Components → React Hooks (SWR) → API Client (Axios) → Express Routes → Service Layer → SQLite (Drizzle ORM)
```

### Database

- **Engine**: SQLite via LibSQL client + Drizzle ORM
- **Dev path**: `~/.ofoxclaw/data/agents.db`
- **Prod path**: `{userData}/Data/agents.db`
- **Old path** (auto-migrated): `{userData}/agents.db`

---

## Data Flow

### Complete Request/Response Path

```
┌─────────────────────────────────────────┐
│  UI: SpeedyPage / SpeedySessionsSidebar │
└──────────────┬──────────────────────────┘
               │ React state + events
┌──────────────▼──────────────────────────┐
│  Hooks: useSessions / useSession / ...  │
│  (SWR for caching & revalidation)       │
└──────────────┬──────────────────────────┘
               │ AgentApiClient methods
┌──────────────▼──────────────────────────┐
│  API Client: AgentApiClient (Axios)     │
└──────────────┬──────────────────────────┘
               │ HTTP (localhost:8889)
┌──────────────▼──────────────────────────┐
│  Express: /v1/agents/{agentId}/sessions │
└──────────────┬──────────────────────────┘
               │ service calls
┌──────────────▼──────────────────────────┐
│  Service: SessionService / AgentService │
└──────────────┬──────────────────────────┘
               │ Drizzle ORM queries
┌──────────────▼──────────────────────────┐
│  SQLite: agents.db                      │
└─────────────────────────────────────────┘
```

---

## Key Files Index

### UI Components (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/pages/landing/SpeedyPage.tsx` | Main page; initializes agent, model, and first session |
| `src/renderer/src/pages/landing/components/SpeedySessionsSidebar.tsx` | Session list sidebar with CRUD + permission mode |
| `src/renderer/src/pages/landing/components/SpeedyNavbar.tsx` | Navigation bar |
| `src/renderer/src/pages/landing/components/WorkspacePanel.tsx` | Workspace path management |

### React Hooks (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/hooks/agents/useSessions.ts` | Fetch sessions list via SWR; create/delete helpers |
| `src/renderer/src/hooks/agents/useSession.ts` | Fetch single session + trigger message loading |
| `src/renderer/src/hooks/agents/useCreateDefaultSession.ts` | Create session with agent defaults |
| `src/renderer/src/hooks/agents/useUpdateSession.ts` | Partial session update |
| `src/renderer/src/hooks/agents/useAgentClient.ts` | Initialize AgentApiClient with server config |
| `src/renderer/src/hooks/agents/useTurboWorkspaceSync.ts` | Bidirectional accessible_paths sync |
| `src/renderer/src/hooks/agents/useAgent.ts` | Fetch agent details |
| `src/renderer/src/hooks/agents/useActiveAgent.ts` | Get active agent from Redux |

### API Client (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/api/agent.ts` | HTTP client: `listSessions`, `createSession`, `getSession`, `updateSession`, `deleteSession` |

### Express Routes (Main Process)

| File | Purpose |
|------|---------|
| `src/main/apiServer/routes/agents/index.ts` | Route definitions with Swagger docs |
| `src/main/apiServer/routes/agents/handlers/sessions.ts` | Session CRUD handlers |
| `src/main/apiServer/routes/agents/handlers/agents.ts` | Agent CRUD handlers |
| `src/main/apiServer/server.ts` | API server startup/shutdown |

### Service Layer (Main Process)

| File | Purpose |
|------|---------|
| `src/main/services/agents/services/SessionService.ts` | Session business logic, validation, JSON serialization |
| `src/main/services/agents/services/AgentService.ts` | Agent logic; `ensureTurboAgentExists()`, preset skills init |
| `src/main/services/agents/services/SessionMessageService.ts` | Message persistence and retrieval |
| `src/main/services/agents/BaseService.ts` | Shared service utilities |

### Database (Main Process)

| File | Purpose |
|------|---------|
| `src/main/services/agents/database/DatabaseManager.ts` | Singleton DB init, migration, recovery |
| `src/main/services/agents/database/schema/sessions.schema.ts` | `sessionsTable` schema |
| `src/main/services/agents/database/schema/messages.schema.ts` | `sessionMessagesTable` schema |
| `src/main/services/agents/database/schema/agents.schema.ts` | `agentsTable` schema |
| `src/main/services/agents/database/schema/index.ts` | Schema barrel exports |
| `src/main/services/agents/database/MigrationService.ts` | Schema migrations |
| `src/main/services/agents/drizzle.config.ts` | Drizzle kit config with DB path resolution |

### Redux Store (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/store/runtime.ts` | `activeSessionIdMap`, `activeTopicOrSession`, `sessionWaiting` |

---

## Database Schema

### sessions

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `agent_type` | text NOT NULL | e.g. `"claude-code"` |
| `agent_id` | text NOT NULL | FK → agents.id (cascade delete) |
| `name` | text NOT NULL | |
| `description` | text | |
| `accessible_paths` | text | JSON array of directory paths |
| `instructions` | text | |
| `model` | text NOT NULL | Main model ID |
| `plan_model` | text | Optional planning model |
| `small_model` | text | Optional fast model |
| `mcps` | text | JSON array of MCP tool IDs |
| `allowed_tools` | text | JSON array |
| `slash_commands` | text | JSON array |
| `configuration` | text | JSON (`permission_mode`, `max_turns`, ...) |
| `created_at` | text NOT NULL | ISO 8601 |
| `updated_at` | text NOT NULL | ISO 8601 |

Indexes: `idx_sessions_created_at`, `idx_sessions_agent_id`, `idx_sessions_model`

### session_messages

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | Auto-increment |
| `session_id` | text NOT NULL | FK → sessions.id (cascade delete) |
| `role` | text NOT NULL | `user` / `agent` / `system` / `tool` |
| `content` | text NOT NULL | JSON structured |
| `agent_session_id` | text | For resuming sessions |
| `metadata` | text | JSON optional |
| `created_at` | text NOT NULL | ISO 8601 |
| `updated_at` | text NOT NULL | ISO 8601 |

Indexes: `idx_session_messages_session_id`, `idx_session_messages_created_at`, `idx_session_messages_updated_at`

### agents

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | e.g. `agent_turbo_system` |
| `type` | text NOT NULL | e.g. `"claude-code"` |
| `name` | text NOT NULL | |
| `description` | text | |
| `accessible_paths` | text | JSON array |
| `instructions` | text | |
| `model` | text NOT NULL | |
| `plan_model` | text | |
| `small_model` | text | |
| `mcps` | text | JSON array |
| `allowed_tools` | text | JSON array |
| `configuration` | text | JSON |
| `is_system` | integer | Boolean; cannot be deleted |
| `created_at` | text NOT NULL | ISO 8601 |
| `updated_at` | text NOT NULL | ISO 8601 |

---

## API Endpoints

### Session CRUD

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| POST | `/v1/agents/{agentId}/sessions` | `createSession` | Create session |
| GET | `/v1/agents/{agentId}/sessions` | `listSessions` | List sessions (paginated) |
| GET | `/v1/agents/{agentId}/sessions/{sessionId}` | `getSession` | Get session + messages |
| PUT | `/v1/agents/{agentId}/sessions/{sessionId}` | `updateSession` | Full replace |
| PATCH | `/v1/agents/{agentId}/sessions/{sessionId}` | `patchSession` | Partial update |
| DELETE | `/v1/agents/{agentId}/sessions/{sessionId}` | `deleteSession` | Delete (auto-creates default if last) |
| GET | `/v1/agents/sessions` | `listAllSessions` | List all sessions across agents |

**Query params** (list): `limit` (default 20, max 100), `offset` (default 0), `status` (optional)

---

## Architecture Patterns

### Caching (SWR)

- `useSessions()` caches by SWR key `/v1/agents/{agentId}/sessions`
- `useSession()` caches by SWR key `/v1/agents/{agentId}/sessions/{sessionId}`
- Optimistic updates via `mutate()` to avoid full re-fetches

### Cascade Delete

- `agents.id` → `sessions.agent_id`: cascade delete all sessions when agent removed
- `sessions.id` → `session_messages.session_id`: cascade delete all messages when session removed

### Last Session Protection

- Deleting the last session auto-creates a new default session
- Prevents empty UI state
- Implemented in `deleteSession` handler and `SpeedySessionsSidebar`

### Corrupted DB Recovery

- `DatabaseManager` detects empty/corrupted DB files (size === 0) and recreates them
- Auto-migration from old DB path to new location

### Bidirectional Workspace Sync

- `useTurboWorkspaceSync()` keeps session `accessible_paths` in sync with agent defaults
- Uses `isSyncingRef` to prevent infinite update loops
- Agent config changes → auto-sync to active session
- Workspace panel changes → update both session and agent via `Promise.all()`

### JSON Serialization

- Complex fields (`accessible_paths`, `mcps`, `configuration`) stored as JSON text in SQLite
- Auto-serialized before DB writes, deserialized after reads (service layer)

### Model Validation

- All session models (`model`, `plan_model`, `small_model`) validated against agent type before persistence
- Custom error type: `AgentModelValidationError`

---

## Turbo Agent Default Configuration

### Default Working Directory

- **Default path**: `~/Documents/Ofox Claw` (via `path.join(os.homedir(), 'Documents', 'Ofox Claw')`)
- **Defined in**: `src/main/services/agents/services/AgentService.ts:79-81`
- **Storage field**: `agents.accessible_paths` (JSON array, first element is the primary working directory)
- **Auto-created**: The directory is ensured to exist via `this.ensurePathsExist([defaultPath])`

### Agent Defaults

| Property | Value |
|----------|-------|
| **id** | `agent_turbo_system` |
| **type** | `claude-code` |
| **name** | `极速模式` |
| **description** | `快速响应的极速助手，适用于简单任务` |
| **instructions** | `You are a fast and efficient assistant.` |
| **model** | `''` (user configures) |
| **is_system** | `true` (cannot be deleted) |
| **default MCPs** | `scheduler`, `python`, `fetch` |

### Preset Skills

- **Source**: `resources/preset-skills` (dev) / `app/resources/preset-skills` (packaged)
- **Target**: `{accessible_paths[0]}/.claude/skills/`
- **Plugin cache**: `{accessible_paths[0]}/.claude/plugins.json`
- **Initialization**: Uses `accessible_paths[0]` as the working directory for skill installation
- **Logic in**: `AgentService.initializePresetSkills()` (`AgentService.ts:114-191`)

### Working Directory Sync

The working directory (`accessible_paths`) follows a bidirectional sync pattern managed by `useTurboWorkspaceSync` hook:

- **Session inherits from agent**: When a session is created, it copies the agent's `accessible_paths`
- **Agent → Session sync**: When agent's `accessible_paths` changes, it auto-syncs to the active session
- **UI → Both sync**: When user modifies paths via WorkspacePanel (drag-and-drop or remove), both session and agent are updated via `Promise.all()`
- **Loop prevention**: Uses `isSyncingRef` to prevent infinite update loops
- **Path resolution**: `const accessiblePaths = session?.accessible_paths || agent?.accessible_paths || []`

---

## Constants

| Constant | Value | Locations |
|----------|-------|-----------|
| `TURBO_AGENT_ID` | `'agent_turbo_system'` | `AgentService.ts`, `SpeedyPage.tsx`, `useTurboWorkspaceSync.ts` |
| Default working dir | `~/Documents/Ofox Claw` | `AgentService.ts:79` |
| API server port | `8889` | Config default |
| API version prefix | `/v1` | `agent.ts` |

---

## Initialization Sequence

1. **Main process startup** (`src/main/index.ts:227-233`)
   - `DatabaseManager.getInstance()` → init LibSQL + Drizzle, run migrations
   - `AgentService.ensureTurboAgentExists()` → create/migrate system agent, init preset skills
     - If agent **does not exist**: creates with default path `~/Documents/Ofox Claw`, default MCPs (`scheduler`, `python`, `fetch`), and installs preset skills
     - If agent **exists**: ensures default MCPs are present (migration), initializes preset skills from `existing.accessible_paths[0]`
   - `ApiServer.start()` → Express on port 8889

2. **Renderer init** (`useAppInit`)
   - Initialize MemoryService, Ofox providers, MCP servers

3. **SpeedyPage mount**
   - `useAgent(TURBO_AGENT_ID)` → fetch turbo agent
   - `useSessions(TURBO_AGENT_ID)` → fetch session list
   - Auto-set model if missing → `client.updateAgent()`
   - Auto-create first session if list empty
   - Auto-select first session → `dispatch(setActiveSessionIdAction())`
   - Load messages via `useSession()` → `loadTopicMessagesThunk()`

4. **Workspace sync** (`useTurboWorkspaceSync`)
   - Read current `accessible_paths`
   - Watch for agent config changes → auto-sync to session

---

## Redux State Shape (relevant fields)

```typescript
// src/renderer/src/store/runtime.ts
interface ChatState {
  activeSessionIdMap: Record<string, string | null> // agentId → sessionId
  activeTopicOrSession: 'topic' | 'session'
  sessionWaiting: Record<string, boolean>           // sessionId → pending flag
}
```

## Permission Modes

Stored in `session.configuration.permission_mode`:

- `'default'` — Normal mode
- `'acceptEdits'` — Auto-accept edits
- `'bypassPermissions'` — Bypass permission checks
- `'plan'` — Planning mode
