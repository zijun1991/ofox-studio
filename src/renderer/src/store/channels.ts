import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ChannelEntity, ChannelStatus } from '@renderer/types/channel'

export interface ChannelsState {
  channels: ChannelEntity[]
  /** Runtime-only statuses synced from Main Process */
  statuses: Record<string, ChannelStatus>
}

export const initialState: ChannelsState = {
  channels: [],
  statuses: {}
}

const channelsSlice = createSlice({
  name: 'channels',
  initialState,
  reducers: {
    setChannels: (state, action: PayloadAction<ChannelEntity[]>) => {
      state.channels = action.payload
    },
    addChannel: (state, action: PayloadAction<ChannelEntity>) => {
      state.channels.unshift(action.payload)
    },
    updateChannel: (state, action: PayloadAction<ChannelEntity>) => {
      const idx = state.channels.findIndex((c) => c.id === action.payload.id)
      if (idx !== -1) {
        state.channels[idx] = action.payload
      }
    },
    deleteChannel: (state, action: PayloadAction<string>) => {
      state.channels = state.channels.filter((c) => c.id !== action.payload)
    },
    setChannelEnabled: (state, action: PayloadAction<{ id: string; enabled: boolean }>) => {
      const ch = state.channels.find((c) => c.id === action.payload.id)
      if (ch) {
        ch.enabled = action.payload.enabled
      }
    },
    setChannelStatus: (state, action: PayloadAction<{ id: string; status: ChannelStatus; error?: string }>) => {
      state.statuses[action.payload.id] = action.payload.status
      const ch = state.channels.find((c) => c.id === action.payload.id)
      if (ch) {
        ch.status = action.payload.status
        ch.errorMessage = action.payload.error
      }
    },
    setAllStatuses: (state, action: PayloadAction<Record<string, ChannelStatus>>) => {
      state.statuses = action.payload
    },
    updateChannelMetadata: (
      state,
      action: PayloadAction<{ channelId: string; metadata: Record<string, unknown>; timestamp: string }>
    ) => {
      const ch = state.channels.find((c) => c.id === action.payload.channelId)
      if (ch) {
        ch.lastMessageMetadata = action.payload.metadata
        ch.lastMessageAt = action.payload.timestamp
      }
    }
  },
  selectors: {
    getAllChannels: (state) => state.channels,
    getEnabledChannels: (state) => state.channels.filter((c) => c.enabled),
    getChannelById: (state, id: string) => state.channels.find((c) => c.id === id),
    getChannelsForSession: (state, agentId: string, sessionId: string) =>
      state.channels.filter((c) => c.agentId === agentId && c.sessionId === sessionId),
    getChannelStatus: (state, id: string) => state.statuses[id] ?? ('inactive' as ChannelStatus),
    // New selectors for channel binding checks
    getChannelByAgent: (state, agentId: string) => state.channels.find((c) => c.agentId === agentId),
    getChannelBySession: (state, sessionId: string) => state.channels.find((c) => c.sessionId === sessionId),
    isAgentBound: (state, agentId: string) => state.channels.some((c) => c.agentId === agentId),
    isSessionBound: (state, sessionId: string) => state.channels.some((c) => c.sessionId === sessionId)
  }
})

export const {
  setChannels,
  addChannel,
  updateChannel,
  deleteChannel,
  setChannelEnabled,
  setChannelStatus,
  setAllStatuses,
  updateChannelMetadata
} = channelsSlice.actions

export const {
  getAllChannels,
  getEnabledChannels,
  getChannelById,
  getChannelsForSession,
  getChannelStatus,
  getChannelByAgent,
  getChannelBySession,
  isAgentBound,
  isSessionBound
} = channelsSlice.selectors

export default channelsSlice.reducer
