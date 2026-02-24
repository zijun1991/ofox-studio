/**
 * Workspace Redux Store for Speedy Mode
 * Manages topic-associated workspaces with file/folder references
 */

import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import type { TopicWorkspace, WorkspaceNode, WorkspaceState } from '@renderer/types/workspace'
import {
  createTopicWorkspace,
  removeNodeById,
  toggleNodeExpanded as toggleNodeExpandedUtil,
  updateNodeChildrenById as updateNodeChildrenByIdUtil
} from '@renderer/types/workspace'

const initialState: WorkspaceState = {
  workspaces: {},
  loading: false,
  error: null
}

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    // Set loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },

    // Set error state
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },

    // Load or set a workspace
    setWorkspace: (state, action: PayloadAction<TopicWorkspace>) => {
      state.workspaces[action.payload.topicId] = action.payload
    },

    // Load multiple workspaces
    setWorkspaces: (state, action: PayloadAction<TopicWorkspace[]>) => {
      action.payload.forEach((ws) => {
        state.workspaces[ws.topicId] = ws
      })
    },

    // Add nodes to a workspace
    addNodesToWorkspace: (state, action: PayloadAction<{ topicId: string; nodes: WorkspaceNode[] }>) => {
      const { topicId, nodes } = action.payload
      const ws = state.workspaces[topicId]
      if (ws) {
        ws.nodes = [...ws.nodes, ...nodes]
        ws.updatedAt = Date.now()
      } else {
        // Create new workspace if doesn't exist
        const newWs = createTopicWorkspace(topicId)
        newWs.nodes = nodes
        state.workspaces[topicId] = newWs
      }
    },

    // Remove a node from workspace
    removeNodeFromWorkspace: (state, action: PayloadAction<{ topicId: string; nodeId: string }>) => {
      const { topicId, nodeId } = action.payload
      const ws = state.workspaces[topicId]
      if (ws) {
        ws.nodes = removeNodeById(ws.nodes, nodeId)
        ws.updatedAt = Date.now()
      }
    },

    // Toggle node expansion
    toggleNodeExpandedAction: (state, action: PayloadAction<{ topicId: string; nodeId: string }>) => {
      const { topicId, nodeId } = action.payload
      const ws = state.workspaces[topicId]
      if (ws) {
        ws.nodes = toggleNodeExpandedUtil(ws.nodes, nodeId)
      }
    },

    // Update node children (for lazy loading)
    updateNodeChildrenAction: (
      state,
      action: PayloadAction<{ topicId: string; nodeId: string; children: WorkspaceNode[] }>
    ) => {
      const { topicId, nodeId, children } = action.payload
      const ws = state.workspaces[topicId]
      if (ws) {
        ws.nodes = updateNodeChildrenByIdUtil(ws.nodes, nodeId, children)
        ws.updatedAt = Date.now()
      }
    },

    // Clear all nodes from a workspace
    clearWorkspace: (state, action: PayloadAction<string>) => {
      const topicId = action.payload
      const ws = state.workspaces[topicId]
      if (ws) {
        ws.nodes = []
        ws.updatedAt = Date.now()
      }
    },

    // Delete a workspace (when topic is deleted)
    deleteWorkspace: (state, action: PayloadAction<string>) => {
      const topicId = action.payload
      delete state.workspaces[topicId]
    },

    // Update workspace in database (thunk would handle this)
    updateWorkspaceTimestamp: (state, action: PayloadAction<string>) => {
      const topicId = action.payload
      const ws = state.workspaces[topicId]
      if (ws) {
        ws.updatedAt = Date.now()
      }
    }
  }
})

export const {
  setLoading,
  setError,
  setWorkspace,
  setWorkspaces,
  addNodesToWorkspace,
  removeNodeFromWorkspace,
  toggleNodeExpandedAction,
  updateNodeChildrenAction,
  clearWorkspace,
  deleteWorkspace,
  updateWorkspaceTimestamp
} = workspaceSlice.actions

export default workspaceSlice.reducer
