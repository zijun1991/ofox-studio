/**
 * Workspace management hook for Speedy Mode
 * Provides workspace CRUD operations with IndexedDB persistence
 */

import { loggerService } from '@logger'
import { db } from '@renderer/databases'
import {
  addNodesToWorkspace,
  clearWorkspace,
  removeNodeFromWorkspace,
  setWorkspace,
  toggleNodeExpandedAction,
  updateNodeChildrenAction
} from '@renderer/store/workspace'
import type { TopicWorkspace, WorkspaceNode } from '@renderer/types/workspace'
import { createTopicWorkspace, getFileExtension } from '@renderer/types/workspace'
import { useCallback, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

const logger = loggerService.withContext('useWorkspace')

interface UseWorkspaceOptions {
  topicId: string
  autoLoad?: boolean
}

interface UseWorkspaceReturn {
  workspace: TopicWorkspace | null
  loading: boolean
  error: string | null
  addFiles: (files: File[]) => Promise<void>
  addNodes: (nodes: WorkspaceNode[]) => void
  removeNode: (nodeId: string) => void
  toggleExpand: (nodeId: string) => void
  updateNodeChildren: (nodeId: string, children: WorkspaceNode[]) => void
  clear: () => void
  reload: () => Promise<void>
}

/**
 * Hook for managing workspace associated with a topic
 */
export function useWorkspace({ topicId, autoLoad = true }: UseWorkspaceOptions): UseWorkspaceReturn {
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get workspace from Redux store
  const workspace = useSelector((state: any) => state.workspace?.workspaces?.[topicId] || null)

  // Load workspace from IndexedDB
  const loadWorkspace = useCallback(async () => {
    if (!topicId) return

    setLoading(true)
    setError(null)

    try {
      const ws = await db.workspaces.get(topicId)
      if (ws) {
        dispatch(setWorkspace(ws))
      } else {
        // Create new empty workspace
        const newWs = createTopicWorkspace(topicId)
        await db.workspaces.add(newWs)
        dispatch(setWorkspace(newWs))
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load workspace'
      logger.error('Failed to load workspace:', { topicId, error: errorMsg })
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [topicId, dispatch])

  // Auto-load workspace on mount
  useEffect(() => {
    if (autoLoad && topicId) {
      loadWorkspace()
    }
  }, [autoLoad, topicId, loadWorkspace])

  // Save workspace to IndexedDB
  const saveWorkspace = useCallback(
    async (ws: TopicWorkspace) => {
      try {
        await db.workspaces.put(ws)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save workspace'
        logger.error('Failed to save workspace:', { topicId, error: errorMsg })
        setError(errorMsg)
      }
    },
    [topicId]
  )

  // Add files from drag/drop
  const addFiles = useCallback(
    async (files: File[]) => {
      if (!topicId || files.length === 0) return

      // Build nodes from files
      const nodes: WorkspaceNode[] = await Promise.all(
        files.map(async (file) => {
          const filePath = window.api.file.getPathForFile(file)
          const isDir = await window.api.file.isDirectory(filePath)
          const node = buildNodeFromFile(file, filePath, isDir)

          // If it's a directory, load children
          if (isDir) {
            try {
              const children = await loadDirectoryChildren(filePath)
              node.children = children
              node.expanded = false
            } catch (err) {
              logger.warn('Failed to load directory children:', {
                path: filePath,
                error: err
              })
            }
          }
          return node
        })
      )

      // Add to Redux store
      dispatch(addNodesToWorkspace({ topicId, nodes }))

      // Save to IndexedDB
      if (workspace) {
        await saveWorkspace({
          ...workspace,
          nodes: [...workspace.nodes, ...nodes],
          updatedAt: Date.now()
        })
      }
    },
    [topicId, workspace, dispatch, saveWorkspace]
  )

  // Add pre-built nodes
  const addNodes = useCallback(
    (nodes: WorkspaceNode[]) => {
      if (!topicId) return
      dispatch(addNodesToWorkspace({ topicId, nodes }))
    },
    [topicId, dispatch]
  )

  // Remove a node
  const removeNode = useCallback(
    async (nodeId: string) => {
      if (!topicId) return

      dispatch(removeNodeFromWorkspace({ topicId, nodeId }))

      // Save to IndexedDB
      if (workspace) {
        await saveWorkspace({
          ...workspace,
          updatedAt: Date.now()
        })
      }
    },
    [topicId, workspace, dispatch, saveWorkspace]
  )

  // Toggle node expansion
  const toggleExpand = useCallback(
    (nodeId: string) => {
      if (!topicId) return
      dispatch(toggleNodeExpandedAction({ topicId, nodeId }))
    },
    [topicId, dispatch]
  )

  // Update node children (for lazy loading)
  const updateNodeChildren = useCallback(
    (nodeId: string, children: WorkspaceNode[]) => {
      if (!topicId) return
      dispatch(updateNodeChildrenAction({ topicId, nodeId, children }))
    },
    [topicId, dispatch]
  )

  // Clear all nodes
  const clear = useCallback(async () => {
    if (!topicId) return

    dispatch(clearWorkspace(topicId))

    // Save to IndexedDB
    if (workspace) {
      await saveWorkspace({
        ...workspace,
        nodes: [],
        updatedAt: Date.now()
      })
    }
  }, [topicId, workspace, dispatch, saveWorkspace])

  return {
    workspace,
    loading,
    error,
    addFiles,
    addNodes,
    removeNode,
    toggleExpand,
    updateNodeChildren,
    clear,
    reload: loadWorkspace
  }
}

/**
 * Build workspace node from File object
 */
function buildNodeFromFile(file: File, filePath: string, isDirectory: boolean): WorkspaceNode {
  const now = Date.now()

  return {
    id: `ws_node_${now}_${Math.random().toString(36).substring(2, 9)}`,
    name: file.name,
    type: isDirectory ? 'folder' : 'file',
    path: filePath,
    size: file.size,
    ext: isDirectory ? undefined : getFileExtension(file.name),
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Load directory children via IPC
 */
async function loadDirectoryChildren(dirPath: string): Promise<WorkspaceNode[]> {
  try {
    // Use listDirectory IPC to read directory contents
    const entries = await window.api.file.listDirectory(dirPath, { recursive: false })

    if (!entries || entries.length === 0) {
      return []
    }

    const children: WorkspaceNode[] = []
    for (const entry of entries) {
      const now = Date.now()
      const isDir = entry.isDirectory || false

      const node: WorkspaceNode = {
        id: `ws_node_${now}_${Math.random().toString(36).substring(2, 9)}`,
        name: entry.name,
        type: isDir ? 'folder' : 'file',
        path: entry.path,
        size: entry.size,
        ext: isDir ? undefined : getFileExtension(entry.name),
        createdAt: now,
        updatedAt: now
      }

      // Recursively load children for subdirectories
      if (isDir) {
        try {
          node.children = await loadDirectoryChildren(entry.path)
          node.expanded = false
        } catch (err) {
          logger.warn('Failed to load subdirectory children:', { path: entry.path, error: err })
          node.children = []
          node.expanded = false
        }
      }

      children.push(node)
    }

    return children
  } catch (error) {
    logger.error('Failed to load directory children:', { dirPath, error })
    return []
  }
}

/**
 * Delete workspace when topic is deleted
 */
export async function deleteWorkspaceForTopic(topicId: string): Promise<void> {
  try {
    await db.workspaces.delete(topicId)
    logger.info('Workspace deleted for topic:', { topicId })
  } catch (error) {
    logger.error('Failed to delete workspace for topic:', { topicId, error })
  }
}
