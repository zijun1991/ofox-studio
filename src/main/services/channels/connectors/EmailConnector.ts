import { loggerService } from '@logger'
import type { ChannelInboundMessage, ChannelOutboundMessage, EmailChannelConfig } from '@types'
import type { ImapFlow } from 'imapflow'
import type { Transporter } from 'nodemailer'

import { BaseChannelConnector, type ConnectorStatus } from './BaseChannelConnector'

const logger = loggerService.withContext('EmailConnector')

interface EmailMetadata {
  from: string
  to: string
  subject: string
  messageId: string
  inReplyTo?: string
  references?: string
}

export class EmailConnector extends BaseChannelConnector {
  private imapClient: ImapFlow | null = null
  private smtpTransport: Transporter | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private onMessage: ((msg: ChannelInboundMessage) => Promise<void>) | null = null
  private lastSeenUid = 0

  private get emailConfig(): EmailChannelConfig | undefined {
    return this.channel.emailConfig
  }

  private get customProxyUrl(): string | undefined {
    if (this.channel.proxyConfig?.mode === 'custom' && this.channel.proxyConfig.url) {
      return this.channel.proxyConfig.url
    }
    return undefined
  }

  async start(onMessage: (msg: ChannelInboundMessage) => Promise<void>): Promise<void> {
    this.onMessage = onMessage
    const config = this.emailConfig
    if (!config) {
      throw new Error('Email configuration is missing')
    }

    try {
      const proxyUrl = this.customProxyUrl
      if (proxyUrl) {
        logger.info('Using custom proxy for Email', {
          channelId: this.channel.id,
          proxyUrl
        })
      }

      // Initialize IMAP client
      const { ImapFlow: ImapFlowClass } = await import('imapflow')
      this.imapClient = new ImapFlowClass({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapTls,
        auth: {
          user: config.imapUser,
          pass: config.imapPassword
        },
        logger: false,
        ...(proxyUrl && { proxy: proxyUrl })
      })

      await this.imapClient.connect()

      // Initialize SMTP transport
      const nodemailer = await import('nodemailer')
      this.smtpTransport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpTls,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword
        },
        ...(proxyUrl && { proxy: proxyUrl })
      })

      // Get current max UID to only process new messages
      const lock = await this.imapClient.getMailboxLock(config.imapFolder || 'INBOX')
      try {
        const status = this.imapClient.mailbox
        if (status) {
          this.lastSeenUid = (status as any).uidNext ? (status as any).uidNext - 1 : 0
        }
      } finally {
        lock.release()
      }

      // Start polling
      const pollInterval = (config.pollIntervalSec || 60) * 1000
      this.pollTimer = setInterval(() => this.pollForNewEmails(), pollInterval)

      this._status = 'connected'
      logger.info('Email connector started', { channelId: this.channel.id })
    } catch (error) {
      this._status = 'error'
      this._errorMessage = error instanceof Error ? error.message : 'Connection failed'
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    if (this.imapClient) {
      try {
        await this.imapClient.logout()
      } catch {
        // Ignore logout errors
      }
      this.imapClient = null
    }

    if (this.smtpTransport) {
      this.smtpTransport.close()
      this.smtpTransport = null
    }

    this.onMessage = null
    this._status = 'disconnected'
    logger.info('Email connector stopped', { channelId: this.channel.id })
  }

  async sendResponse(msg: ChannelOutboundMessage): Promise<void> {
    if (!this.smtpTransport) {
      throw new Error('SMTP transport is not initialized')
    }

    const config = this.emailConfig
    if (!config) {
      throw new Error('Email configuration is missing')
    }

    const emailMeta = msg.metadata as unknown as EmailMetadata | undefined

    const mailOptions: Record<string, unknown> = {
      from: config.fromAddress
        ? `"${config.fromName || ''}" <${config.fromAddress}>`
        : `"${config.fromName || ''}" <${config.smtpUser}>`,
      to: emailMeta?.from || '',
      subject: emailMeta?.subject ? `Re: ${emailMeta.subject.replace(/^Re:\s*/i, '')}` : 'Response',
      text: msg.content,
      // Email threading headers
      ...(emailMeta?.messageId && {
        inReplyTo: emailMeta.messageId,
        references: [emailMeta.references, emailMeta.messageId].filter(Boolean).join(' ')
      })
    }

    await this.smtpTransport.sendMail(mailOptions)
    logger.info('Email response sent', { channelId: msg.channelId, to: mailOptions.to })
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = this.emailConfig
    if (!config) {
      return { success: false, message: 'Email configuration is missing' }
    }

    try {
      const proxyUrl = this.customProxyUrl

      // Test IMAP
      const { ImapFlow: ImapFlowClass } = await import('imapflow')
      const imapClient = new ImapFlowClass({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapTls,
        auth: {
          user: config.imapUser,
          pass: config.imapPassword
        },
        logger: false,
        ...(proxyUrl && { proxy: proxyUrl })
      })

      await imapClient.connect()
      await imapClient.logout()

      // Test SMTP
      const nodemailer = await import('nodemailer')
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpTls,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword
        },
        ...(proxyUrl && { proxy: proxyUrl })
      })

      await transport.verify()
      transport.close()

      return { success: true, message: 'IMAP and SMTP connections successful' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      }
    }
  }

  getStatus(): ConnectorStatus {
    return this._status
  }

  private async pollForNewEmails(): Promise<void> {
    if (!this.imapClient || !this.onMessage) return

    const config = this.emailConfig
    if (!config) return

    try {
      const lock = await this.imapClient.getMailboxLock(config.imapFolder || 'INBOX')
      try {
        // Search for new messages since last seen UID
        const searchCriteria = this.lastSeenUid > 0 ? { uid: `${this.lastSeenUid + 1}:*` } : { seen: false }

        for await (const message of this.imapClient.fetch(searchCriteria, {
          source: true,
          envelope: true,
          uid: true
        })) {
          if (message.uid <= this.lastSeenUid) continue
          this.lastSeenUid = message.uid

          const envelope = message.envelope
          if (!envelope) continue

          const content = message.source?.toString() || ''

          // Extract plain text body (simplified)
          const textBody = this.extractTextBody(content)

          const metadata: EmailMetadata = {
            from: envelope.from?.[0]?.address || '',
            to: envelope.to?.[0]?.address || '',
            subject: envelope.subject || '',
            messageId: envelope.messageId || '',
            inReplyTo: envelope.inReplyTo || undefined
          }

          const inbound: ChannelInboundMessage = {
            channelId: this.channel.id,
            channelType: 'email',
            content: textBody,
            metadata: metadata as unknown as Record<string, unknown>,
            receivedAt: new Date().toISOString()
          }

          await this.onMessage(inbound)
        }
      } finally {
        lock.release()
      }
    } catch (error) {
      logger.error('Error polling for new emails', { channelId: this.channel.id, error })
      this._status = 'error'
      this._errorMessage = error instanceof Error ? error.message : 'Poll failed'
    }
  }

  private extractTextBody(rawSource: string): string {
    // Simple extraction: look for plain text content after headers
    const parts = rawSource.split(/\r?\n\r?\n/)
    if (parts.length > 1) {
      return parts.slice(1).join('\n\n').trim()
    }
    return rawSource
  }
}
