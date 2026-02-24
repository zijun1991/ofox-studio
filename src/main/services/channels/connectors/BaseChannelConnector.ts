import type { ChannelEntity, ChannelInboundMessage, ChannelOutboundMessage } from '@types'

export type ConnectorStatus = 'connected' | 'disconnected' | 'error'

export abstract class BaseChannelConnector {
  protected channel: ChannelEntity
  protected _status: ConnectorStatus = 'disconnected'
  protected _errorMessage?: string

  constructor(channel: ChannelEntity) {
    this.channel = channel
  }

  /** Start listening for inbound messages */
  abstract start(onMessage: (msg: ChannelInboundMessage) => Promise<void>): Promise<void>

  /** Stop listening and clean up resources */
  abstract stop(): Promise<void>

  /** Send the LLM response back through the channel */
  abstract sendResponse(msg: ChannelOutboundMessage): Promise<void>

  /** Test connectivity / validate config */
  abstract testConnection(): Promise<{ success: boolean; message: string }>

  getStatus(): ConnectorStatus {
    return this._status
  }

  getErrorMessage(): string | undefined {
    return this._errorMessage
  }

  updateChannel(channel: ChannelEntity): void {
    this.channel = channel
  }
}
