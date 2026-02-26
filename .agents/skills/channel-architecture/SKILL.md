---
name: channel-architecture
description: Reference guide for the Channel mechanism (external message connector) architecture. Use when investigating bugs, adding features, or refactoring code related to channel connectors (Webhook, Email, Telegram), channel-agent binding, inbound/outbound message flow, or channel lifecycle management.
---

# Channel Architecture Reference

## Overview

The Channel mechanism bridges external message sources (Webhook, Email, Telegram) into Agent Sessions. Each channel binds 1:1 to a specific Agent + Session pair and runs a dedicated connector in the Main Process. Messages flow inbound through connectors, get processed by the LLM via `sessionMessageService`, and flow outbound back through the same connector.

Supported channel types:

| Type | Transport | Connector |
|------|-----------|-----------|
| `webhook` | HTTP POST (sync request/response) | `WebhookConnector` |
| `email` | IMAP polling + SMTP send | `EmailConnector` |
| `telegram` | Telegram Bot API long-polling | `TelegramConnector` |

---

## Data Flow

### Inbound (External Source -> Agent)

```
┌──────────────────────────────────────┐
│  External Source                     │
│  (HTTP POST / Email / Telegram Bot)  │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│  Connector (Webhook/Email/Telegram)  │
│  start() registers onMessage cb      │
└──────────────┬───────────────────────┘
               │ ChannelInboundMessage
┌──────────────▼───────────────────────┐
│  ChannelManager.handleInbound()      │
│  1. Save metadata to channel         │
│  2. Emit inbound event to UI         │
│  3. Save user message to DB          │
│  4. Call sessionMessageService       │
│  5. Consume LLM stream               │
│  6. Extract text (filter ignored)    │
│  7. Save assistant message to DB     │
│  8. Emit outbound event to UI        │
└──────────────┬───────────────────────┘
               │ ChannelOutboundMessage
┌──────────────▼───────────────────────┐
│  ChannelManager.handleOutbound()     │
│  → connector.sendResponse()          │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│  External Target                     │
│  (HTTP response / SMTP / Bot API)    │
└──────────────────────────────────────┘
```

### Scheduler-Triggered Flow

```
┌─────────────────────────────────────────┐
│  Scheduler (cron trigger)               │
└──────────────┬──────────────────────────┘
               │ POST /internal/sessions/:agentId/:sessionId/messages
┌──────────────▼──────────────────────────┐
│  Internal API Route                     │
│  1. Override permission_mode            │
│  2. Save user message                   │
│  3. Call sessionMessageService          │
│  4. SSE stream response                 │
│  5. Save assistant message              │
│  6. Check getChannelForSession()        │
│  7. buildFallbackMetadata() if bound    │
│  8. handleOutbound() to channel         │
└─────────────────────────────────────────┘
```

---

## Key Files Index

### Connectors (Main Process)

| File | Purpose |
|------|---------|
| `src/main/services/channels/connectors/BaseChannelConnector.ts` | Abstract base class with lifecycle methods |
| `src/main/services/channels/connectors/WebhookConnector.ts` | HTTP sync request/response connector |
| `src/main/services/channels/connectors/EmailConnector.ts` | IMAP polling + SMTP send connector |
| `src/main/services/channels/connectors/TelegramConnector.ts` | Telegram Bot API long-polling connector |

### Channel Manager (Main Process)

| File | Purpose |
|------|---------|
| `src/main/services/channels/ChannelManager.ts` | Core manager: inbound/outbound handling, connector lifecycle |
| `src/main/services/channels/index.ts` | Barrel export for channelManager singleton |

### API Routes (Main Process)

| File | Purpose |
|------|---------|
| `src/main/apiServer/routes/channels.ts` | `POST /v1/channels/:channelId/webhook` — Webhook HTTP entry |
| `src/main/apiServer/routes/internal.ts` | `POST /internal/sessions/:agentId/:sessionId/messages` — Scheduler entry |

### IPC Bridge (Preload)

| File | Purpose |
|------|---------|
| `src/main/ipc.ts` (lines 1185-1191) | Channel IPC handlers registration |
| `src/preload/index.ts` (lines 697-715) | `window.api.channels.*` bridge |
| `packages/shared/IpcChannel.ts` (lines 433-441) | Channel IPC enum values |

### Redux Store (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/store/channels.ts` | Channel state, actions, and selectors |

### UI Components (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/pages/channels/ChannelsPage.tsx` | Standalone channels page |
| `src/renderer/src/pages/settings/ChannelSettings/index.tsx` | Channel settings list |
| `src/renderer/src/pages/settings/ChannelSettings/ChannelDetail.tsx` | Channel detail configuration |
| `src/renderer/src/pages/settings/ChannelSettings/AddChannelModal.tsx` | Add channel modal |

### Types (Shared)

| File | Purpose |
|------|---------|
| `src/renderer/src/types/channel.ts` | All channel type definitions and Zod schemas |

### Initialization (Renderer)

| File | Purpose |
|------|---------|
| `src/renderer/src/hooks/useAppInit.ts` (lines 141-185) | Channel sync + IPC event listeners |

---

## Type Definitions

### Core Entity

```typescript
interface ChannelEntity {
  id: string
  name: string
  type: ChannelType                        // 'webhook' | 'email' | 'telegram'
  status: ChannelStatus                    // 'active' | 'inactive' | 'error'
  enabled: boolean
  agentId: string                          // Bound agent ID
  sessionId: string                        // Bound session ID
  webhookConfig?: WebhookChannelConfig
  emailConfig?: EmailChannelConfig
  telegramConfig?: TelegramChannelConfig
  proxyConfig?: ChannelProxyConfig
  lastMessageAt?: string
  lastMessageMetadata?: Record<string, unknown>  // Routing info from last inbound
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
```

### Channel Types

```typescript
type ChannelType = 'webhook' | 'email' | 'telegram'
type ChannelStatus = 'active' | 'inactive' | 'error'
type ProxyMode = 'global' | 'custom'
```

### Config Types (Zod-validated)

```typescript
// WebhookChannelConfig
{ secret?: string; allowedIps?: string[]; responseHeaders?: Record<string, string> }

// EmailChannelConfig
{ imapHost, imapPort, imapUser, imapPass, imapTls,
  smtpHost, smtpPort, smtpUser, smtpPass, smtpTls,
  pollIntervalSec, fromName?, fromAddress? }

// TelegramChannelConfig
{ botToken, pollIntervalSec?, allowedChatIds?, parseMode? }

// ChannelProxyConfig
{ mode: ProxyMode; customProxyUrl?: string }
```

### Message Types

```typescript
interface ChannelInboundMessage {
  channelId: string
  channelType: ChannelType
  content: string
  metadata: Record<string, unknown>   // Source-specific routing info
  receivedAt: string
}

interface ChannelOutboundMessage {
  channelId: string
  channelType: ChannelType
  content: string
  metadata: Record<string, unknown>   // Routing info for delivery
  sentAt: string
}
```

### Event Types

```typescript
interface ChannelStatusEvent {
  channelId: string
  status: ChannelStatus
  error?: string
}

interface ChannelMessageEvent {
  channelId: string
  sessionId: string
  direction: 'inbound' | 'outbound'
  content: string
  timestamp: string
}
```

### Binding Context

```typescript
interface ChannelBindingContext {
  channelType: ChannelType
  channelName: string
  channelId: string
  fixedName: string                           // Auto-generated name
  fixedPermissionMode: 'bypassPermissions'    // Always bypass for channels
}

// Name generation format: channel_{type}:{name}:{YYYYMMdd}_{randomDigits}
```

---

## Connector Architecture

### BaseChannelConnector (Abstract)

```typescript
abstract class BaseChannelConnector {
  protected channel: ChannelEntity
  protected _status: ConnectorStatus     // 'connected' | 'disconnected' | 'error'
  protected _errorMessage?: string

  abstract start(onMessage: (msg: ChannelInboundMessage) => Promise<void>): Promise<void>
  abstract stop(): Promise<void>
  abstract sendResponse(msg: ChannelOutboundMessage): Promise<void>
  abstract testConnection(): Promise<{ success: boolean; message: string }>

  getStatus(): ConnectorStatus
  getErrorMessage(): string | undefined
  updateChannel(channel: ChannelEntity): void
}
```

### WebhookConnector

- **Transport**: Synchronous HTTP request/response
- **start()**: Sets status to `connected` (passive — waits for HTTP requests)
- **stop()**: Rejects all pending requests, sets `disconnected`
- **handleWebhookRequest(req, res)**: Core HTTP handler
  1. Verify HMAC-SHA256 signature (optional, timing-safe comparison)
  2. Generate UUID as `requestId`
  3. Create Promise, store in `pendingRequests` map (with 5min timeout)
  4. Call `onMessage()` with inbound message
  5. Wait for `sendResponse()` to resolve the Promise
  6. Return JSON `{ content: responseContent }`
- **sendResponse(msg)**: Resolves pending request by `metadata.requestId`
- **REQUEST_TIMEOUT_MS**: `5 * 60 * 1000` (5 minutes)

### TelegramConnector

- **Transport**: Long-polling via Telegram Bot API
- **start()**: Validates bot token via `getMe`, starts polling loop
- **stop()**: Clears poll timer, aborts active requests, closes proxy dispatcher
- **pollForUpdates()**: `getUpdates(offset=lastUpdateId+1, timeout=30, allowed_updates=['message'])`
  - Filters non-text messages
  - Filters by `allowedChatIds` (optional)
  - Builds inbound message with `TelegramMetadata` (chatId, messageId, fromId, fromUsername)
- **sendResponse(msg)**: Calls `sendMessage` API with `parse_mode` and `reply_to_message_id`
  - On parse_mode failure, retries without it
- **Proxy**: Supports `global` and `custom` proxy via ProxyManager dispatcher
- **Error handling**: Network errors don't set error status (allows auto-retry)

### EmailConnector

- **Transport**: IMAP polling + SMTP send
- **start()**: Connects IMAP (ImapFlow) and SMTP (nodemailer), initializes `lastSeenUid`, starts poll timer
- **stop()**: Disconnects IMAP/SMTP, clears poll timer
- **pollForNewEmails()**: Acquires mailbox lock, searches by UID range, extracts envelope + text body
- **sendResponse(msg)**: Sends email via SMTP with threading headers (`In-Reply-To`, `References`)
  - Auto-prepends "Re:" to subject
  - Supports custom `fromName` and `fromAddress`
- **Email metadata**: `{ from, to, subject, messageId, inReplyTo?, references? }`

---

## IPC Channels

### IPC Enum Values (`IpcChannel`)

```typescript
Channel_SyncConfig     = 'channel:sync-config'
Channel_Start          = 'channel:start'
Channel_Stop           = 'channel:stop'
Channel_TestConnection = 'channel:test-connection'
Channel_GetStatuses    = 'channel:get-statuses'
Channel_StatusChanged  = 'channel:status-changed'    // Push event (main → renderer)
Channel_MessageEvent   = 'channel:message-event'     // Push event (main → renderer)
Channel_StreamChunk    = 'channel:stream-chunk'       // Push event (main → renderer)
```

### Preload API (`window.api.channels`)

```typescript
channels: {
  syncConfig: (channels) => invoke(Channel_SyncConfig, channels)
  start: (channelId) => invoke(Channel_Start, channelId)
  stop: (channelId) => invoke(Channel_Stop, channelId)
  testConnection: (channel) => invoke(Channel_TestConnection, channel)
  getStatuses: () => invoke(Channel_GetStatuses)
  onStatusChanged: (callback) => on(Channel_StatusChanged, callback)
  onMessageEvent: (callback) => on(Channel_MessageEvent, callback)
}
```

### Main Process Handlers

```typescript
Channel_SyncConfig     → channelManager.syncChannels(channels)
Channel_Start          → channelManager.startChannel(channelId)
Channel_Stop           → channelManager.stopChannel(channelId)
Channel_TestConnection → channelManager.testConnection(channel)
Channel_GetStatuses    → channelManager.getChannelStatuses()
```

---

## Channel-Agent Binding

- Each channel binds to exactly one `agentId` + `sessionId` pair (1:1 relationship)
- Binding is configured at channel creation and stored in `ChannelEntity`
- Sessions bound to channels use `permissionMode: 'bypassPermissions'` (auto-execution, no user prompts)
- Agent names for channel-bound sessions follow: `channel_{type}:{name}:{YYYYMMdd}_{randomDigits}`
- Selectors: `getChannelsForSession(state, agentId, sessionId)`, `isAgentBound(state, agentId)`, `isSessionBound(state, sessionId)`

---

## Storage & Persistence

### Channel Configuration

- Stored in **Redux store** (`src/renderer/src/store/channels.ts`)
- Persisted via **localStorage** (Redux persist)
- **Not** stored in SQLite — channels are renderer-side state synced to main process via IPC

### Channel Messages

- User and assistant messages are persisted to **SQLite** via `agentMessageRepository` / `sessionMessageService`
- Stored in `session_messages` table linked by `session_id`
- Standard message persistence — same as Turbo Mode sessions

### Runtime State

- Connector status (`connected`/`disconnected`/`error`) is tracked per-connector in Main Process
- Status map exposed via `getChannelStatuses()` and pushed to renderer via `Channel_StatusChanged` events
- `lastMessageMetadata` on ChannelEntity preserves routing info for outbound delivery

---

## Initialization Sequence

1. **Renderer init** (`useAppInit`)
   - Read channels from Redux store (rehydrated from localStorage)
   - Call `window.api.channels.syncConfig(channels)` → IPC to Main Process
   - Register `onStatusChanged` listener → updates Redux `statuses`
   - Register `onMessageEvent` listener → dispatches `channel-message-received` window event

2. **Main Process** (`channelManager.syncChannels`)
   - Receive channel configs from renderer
   - Stop connectors for removed/disabled channels
   - Create connectors for new/enabled channels
   - Start enabled channels → `connector.start(handleInbound)`

3. **Channel start** (`channelManager.startChannel`)
   - Create connector based on `channel.type` (webhook/email/telegram)
   - Call `connector.start()` with inbound message callback
   - Emit `Channel_StatusChanged` event to renderer

4. **Steady state**
   - Webhook: Passive — waits for HTTP POST to `/v1/channels/:id/webhook`
   - Email: Poll timer checks IMAP for new emails
   - Telegram: Long-polling loop via `getUpdates`

---

## Scheduler Integration

When a scheduler triggers a message for a channel-bound session:

1. Scheduler calls `POST /internal/sessions/:agentId/:sessionId/messages` (localhost only)
2. Internal API overrides `permission_mode` to `bypassPermissions`
3. LLM processes the message and generates a response
4. Internal API checks `channelManager.getChannelForSession(sessionId)`
5. If channel is bound, calls `channelManager.buildFallbackMetadata(channel)`:
   - Uses `channel.lastMessageMetadata` if available (route to last sender)
   - Sets `messageId: 0` (don't reply to specific message)
6. Calls `channelManager.handleOutbound()` to deliver the response

---

## Architecture Patterns

### Connector Pattern

- Abstract base class defines the lifecycle contract (`start` / `stop` / `sendResponse` / `testConnection`)
- ChannelManager creates connectors dynamically based on `channel.type`
- Each connector manages its own transport and polling mechanism

### Sync Pattern

- Renderer owns channel config (Redux + localStorage)
- Main Process receives config via `syncChannels()` IPC call
- Status flows back via push events (`Channel_StatusChanged`)
- This ensures Main Process connectors always reflect current UI state

### Metadata Preservation

- Each inbound message's `metadata` is saved to `channel.lastMessageMetadata`
- Outbound messages use this metadata for routing (e.g., Telegram `chatId`, Email `from` address)
- Scheduler uses `buildFallbackMetadata()` when no recent inbound metadata exists

### Stream Chunk Filtering

- `IGNORED_CHUNK_TYPES` set filters non-text chunks during LLM stream processing
- Ignored types include: `reasoning`, `thinking`, `tool-call`, `tool-result`, etc.
- Only `text-start` / `text-delta` / `text-end` events contribute to response text
- `processedTextBlockIds` set prevents duplicate text collection
- On `finish-step`, response text is overwritten to capture only the last turn

### Proxy Support

- Email and Telegram connectors support proxy via `ChannelProxyConfig`
- `global` mode: Uses system proxy settings
- `custom` mode: Creates a dedicated dispatcher via ProxyManager
- Webhook connector does not need proxy (it's a server endpoint)

### Webhook Signature Verification

- Optional HMAC-SHA256 signature verification
- Signature header: configurable via webhook config
- Uses timing-safe comparison to prevent timing attacks

---

## Constants

| Constant | Value | Location |
|----------|-------|----------|
| `REQUEST_TIMEOUT_MS` | `300000` (5 min) | `WebhookConnector` |
| Telegram poll timeout | `30` seconds | `TelegramConnector.pollForUpdates()` |
| Webhook route | `POST /v1/channels/:channelId/webhook` | `routes/channels.ts` |
| Internal route | `POST /internal/sessions/:agentId/:sessionId/messages` | `routes/internal.ts` |
| Internal IP whitelist | `127.0.0.1`, `::1`, `::ffff:127.0.0.1` | `routes/internal.ts` |
| Channel permission mode | `'bypassPermissions'` | `ChannelBindingContext` |

---

## Redux State Shape

```typescript
// src/renderer/src/store/channels.ts
interface ChannelsState {
  channels: ChannelEntity[]                    // All channel configs
  statuses: Record<string, ChannelStatus>      // Runtime status map
}

// Key selectors:
// getAllChannels, getEnabledChannels, getChannelById,
// getChannelsForSession, getChannelByAgent, getChannelBySession,
// isAgentBound, isSessionBound
```
