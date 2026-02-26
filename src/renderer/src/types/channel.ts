/**
 * Channel types for the Channels mechanism
 * Channels automate message I/O between external services and Agent Sessions
 */
import * as z from 'zod'

// ---- Channel type discriminator ----
export const ChannelTypeSchema = z.enum(['webhook', 'email', 'telegram'])
export type ChannelType = z.infer<typeof ChannelTypeSchema>

// ---- Channel status ----
export const ChannelStatusSchema = z.enum(['active', 'inactive', 'error'])
export type ChannelStatus = z.infer<typeof ChannelStatusSchema>

// ---- Webhook-specific config ----
export const WebhookChannelConfigSchema = z.object({
  /** Secret for HMAC signature verification on incoming webhooks */
  secret: z.string().optional(),
  /** Allowed source IPs (empty = allow all) */
  allowedIps: z.array(z.string()).optional(),
  /** Custom response headers */
  responseHeaders: z.record(z.string(), z.string()).optional()
})
export type WebhookChannelConfig = z.infer<typeof WebhookChannelConfigSchema>

// ---- Email-specific config ----
export const EmailChannelConfigSchema = z.object({
  // Inbound (IMAP)
  imapHost: z.string(),
  imapPort: z.number().default(993),
  imapUser: z.string(),
  imapPassword: z.string(),
  imapTls: z.boolean().default(true),
  /** Folder to watch */
  imapFolder: z.string().default('INBOX'),
  /** Poll interval in seconds */
  pollIntervalSec: z.number().min(10).default(60),
  // Outbound (SMTP)
  smtpHost: z.string(),
  smtpPort: z.number().default(587),
  smtpUser: z.string(),
  smtpPassword: z.string(),
  smtpTls: z.boolean().default(true),
  /** Sender display name */
  fromName: z.string().optional(),
  /** Sender email address (defaults to smtpUser) */
  fromAddress: z.string().optional()
})
export type EmailChannelConfig = z.infer<typeof EmailChannelConfigSchema>

// ---- Telegram-specific config ----
export const TelegramChannelConfigSchema = z.object({
  /** Bot token from @BotFather */
  botToken: z.string(),
  /** Polling interval in seconds */
  pollIntervalSec: z.number().min(1).default(2),
  /** Only accept messages from these chat IDs (empty = accept all) */
  allowedChatIds: z.array(z.number()).optional(),
  /** Parse mode for outbound messages */
  parseMode: z.enum(['Markdown', 'MarkdownV2', 'HTML', '']).default('Markdown')
})
export type TelegramChannelConfig = z.infer<typeof TelegramChannelConfigSchema>

// ---- Proxy Configuration ----
export const ProxyModeSchema = z.enum(['global', 'custom'])
export type ProxyMode = z.infer<typeof ProxyModeSchema>

export const ChannelProxyConfigSchema = z.object({
  /** Proxy mode: 'global' follows global proxy settings, 'custom' uses custom proxy URL */
  mode: ProxyModeSchema.default('global'),
  /** Custom proxy URL (only used when mode is 'custom') */
  /** Examples: socks5://127.0.0.1:1080, http://192.168.0.42:7890 */
  url: z.string().optional()
})
export type ChannelProxyConfig = z.infer<typeof ChannelProxyConfigSchema>

// ---- Channel entity ----
export const ChannelEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ChannelTypeSchema,
  status: ChannelStatusSchema,
  enabled: z.boolean().default(false),

  // Binding to Agent Session
  agentId: z.string(),
  sessionId: z.string(),

  // Connector-specific configuration
  webhookConfig: WebhookChannelConfigSchema.optional(),
  emailConfig: EmailChannelConfigSchema.optional(),
  telegramConfig: TelegramChannelConfigSchema.optional(),

  // Proxy configuration (for Telegram and Email channels)
  proxyConfig: ChannelProxyConfigSchema.optional(),

  // Metadata
  lastMessageAt: z.string().optional(),
  /** Last inbound message metadata (chatId, messageId, etc.) for outbound routing */
  lastMessageMetadata: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type ChannelEntity = z.infer<typeof ChannelEntitySchema>

// ---- Channel message types ----
export interface ChannelInboundMessage {
  channelId: string
  channelType: ChannelType
  content: string
  /** Source-specific metadata (email from/subject, webhook headers, etc.) */
  metadata: Record<string, unknown>
  receivedAt: string
}

export interface ChannelOutboundMessage {
  channelId: string
  channelType: ChannelType
  content: string
  /** Routing info for response delivery (reply-to email, etc.) */
  metadata: Record<string, unknown>
  sentAt: string
}

// ---- Channel status event (for IPC push) ----
export interface ChannelStatusEvent {
  channelId: string
  status: ChannelStatus
  error?: string
}

// ---- Channel message event (for IPC push) ----
export interface ChannelMessageEvent {
  channelId: string
  sessionId: string
  direction: 'inbound' | 'outbound'
  content: string
  timestamp: string
}

// ---- Utility functions ----

/**
 * Generate a unique name for a channel-bound agent
 * Format: <channel_type>:<channel_name>:<YYYYMMDD>_<random6digits>
 */
export function generateChannelBoundAgentName(channelType: ChannelType, channelName: string): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
  const randomDigits = Math.floor(100000 + Math.random() * 900000) // 6 random digits
  return `${channelType}:${channelName}:${dateStr}_${randomDigits}`
}

// ---- Channel binding context for AgentModal ----
export interface ChannelBindingContext {
  channelType: ChannelType
  channelName: string
  channelId: string
  fixedName: string
  fixedPermissionMode: 'bypassPermissions'
}
