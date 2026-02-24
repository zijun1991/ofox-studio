/**
 * Workspace types for Speedy Mode
 * Workspaces are associated with topics and persist file/folder references
 */

/**
 * Workspace file/folder node
 * Stores reference to file system path (does not copy file content)
 */
export interface WorkspaceNode {
  id: string
  name: string
  type: 'file' | 'folder'
  path: string // File system path reference
  size?: number
  ext?: string // File extension
  children?: WorkspaceNode[] // For folders
  expanded?: boolean // Folder expansion state
  isSystem?: boolean // System nodes (e.g., agent work directory) cannot be removed
  createdAt: number
  updatedAt: number
}

/**
 * Topic-associated workspace
 * Each topic has its own workspace for file references
 */
export interface TopicWorkspace {
  id: string
  topicId: string // Reference to associated topic
  nodes: WorkspaceNode[] // Root-level nodes
  createdAt: number
  updatedAt: number
}

/**
 * Workspace state for Redux store
 */
export interface WorkspaceState {
  workspaces: Record<string, TopicWorkspace> // key: topicId
  loading: boolean
  error: string | null
}

/**
 * Speedy Mode topic configuration
 * Stored in topic.speedyConfig
 */
export interface SpeedyTopicConfig {
  employeeId?: string // Selected model employee ID
}

// Helper functions

/**
 * Generate unique ID for workspace node
 */
export function generateWorkspaceNodeId(): string {
  return `ws_node_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Generate unique ID for topic workspace
 */
export function generateTopicWorkspaceId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Create empty workspace node
 */
export function createWorkspaceNode(
  name: string,
  type: 'file' | 'folder',
  path: string,
  options?: Partial<WorkspaceNode>
): WorkspaceNode {
  const now = Date.now()
  return {
    id: generateWorkspaceNodeId(),
    name,
    type,
    path,
    createdAt: now,
    updatedAt: now,
    ...options
  }
}

/**
 * Create empty topic workspace
 */
export function createTopicWorkspace(topicId: string): TopicWorkspace {
  const now = Date.now()
  return {
    id: generateTopicWorkspaceId(),
    topicId,
    nodes: [],
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Find node by ID in workspace tree
 */
export function findNodeById(nodes: WorkspaceNode[], id: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Remove node by ID from workspace tree
 */
export function removeNodeById(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: node.children ? removeNodeById(node.children, id) : undefined
    }))
}

/**
 * Toggle node expansion by ID
 */
export function toggleNodeExpanded(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  return nodes.map((node) => {
    if (node.id === id && node.type === 'folder') {
      return { ...node, expanded: !node.expanded }
    }
    if (node.children) {
      return { ...node, children: toggleNodeExpanded(node.children, id) }
    }
    return node
  })
}

/**
 * Update node children by ID (for lazy loading)
 */
export function updateNodeChildrenById(nodes: WorkspaceNode[], id: string, children: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.map((node) => {
    if (node.id === id && node.type === 'folder') {
      return { ...node, children, expanded: true }
    }
    if (node.children) {
      return { ...node, children: updateNodeChildrenById(node.children, id, children) }
    }
    return node
  })
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string | undefined): string {
  if (!filename) return ''
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : ''
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
