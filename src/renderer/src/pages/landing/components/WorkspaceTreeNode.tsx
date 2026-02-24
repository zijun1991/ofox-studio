/**
 * WorkspaceTreeNode - Tree node for workspace directory display
 *
 * Features:
 * - File/folder icons
 * - Folder expand/collapse with lazy loading
 * - Delete button (for root nodes)
 * - Indentation for hierarchy
 * - Loading state for lazy loading
 */
import { loggerService } from '@logger'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { WorkspaceNode } from '@renderer/types/workspace'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2, X } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useState } from 'react'
import styled from 'styled-components'

import { useWorkspaceContext } from './WorkspacePanel'

const logger = loggerService.withContext('WorkspaceTreeNode')

interface WorkspaceTreeNodeProps {
  node: WorkspaceNode
  depth: number
  isRoot?: boolean
}

const WorkspaceTreeNode: FC<WorkspaceTreeNodeProps> = ({ node, depth, isRoot = false }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)
  const { removeNode, getNodeState, toggleExpand, loadChildren } = useWorkspaceContext()

  const isFolder = node.type === 'folder'
  const nodeState = getNodeState(node.id)
  const isExpanded = nodeState?.expanded ?? node.expanded ?? false
  const children = nodeState?.children ?? node.children
  const isLoading = nodeState?.isLoading || localLoading
  const hasChildren = isFolder && children !== undefined
  const childrenCount = children?.length || 0

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Only root nodes can be removed
      if (isRoot && node.path) {
        removeNode(node.path)
      }
    },
    [isRoot, node.path, removeNode]
  )

  const handleToggleExpand = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()

      if (!isFolder) return

      // If children not loaded yet, load them
      if (children === undefined && node.path) {
        setLocalLoading(true)
        try {
          await loadChildren(node.id, node.path)
        } catch (error) {
          logger.error('Failed to load children:', { path: node.path, error })
        } finally {
          setLocalLoading(false)
        }
      } else {
        // Just toggle expand
        toggleExpand(node.id)
      }
    },
    [isFolder, children, node, loadChildren, toggleExpand]
  )

  const handleDoubleClick = useCallback(() => {
    if (node.path) {
      EventEmitter.emit(EVENT_NAMES.WORKSPACE_NODE_DOUBLE_CLICK, { path: node.path })
    }
  }, [node.path])

  return (
    <>
      <NodeContainer onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} $depth={depth}>
        <NodeContent $isRoot={isRoot} onDoubleClick={handleDoubleClick}>
          {/* Expand/collapse icon for folders */}
          {isFolder ? (
            <ExpandIcon onClick={handleToggleExpand} $isLoading={isLoading}>
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </ExpandIcon>
          ) : (
            <ExpandIcon $spacer />
          )}

          {/* File/folder icon */}
          <NodeIcon>
            {isFolder ? (
              isExpanded ? (
                <FolderOpen size={16} className="text-yellow-500" />
              ) : (
                <Folder size={16} className="text-yellow-500" />
              )
            ) : (
              <FileText size={16} color="var(--color-text-secondary)" />
            )}
          </NodeIcon>

          {/* Node name */}
          <NodeName title={node.path || node.name}>{node.name}</NodeName>

          {/* Remove button - only for root nodes */}
          {isHovered && isRoot && (
            <RemoveBtn onClick={handleRemove}>
              <X size={12} />
            </RemoveBtn>
          )}
        </NodeContent>
      </NodeContainer>

      {/* Render children if expanded */}
      {isFolder && isExpanded && hasChildren && childrenCount > 0 && (
        <>
          {children!.map((child) => (
            <WorkspaceTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </>
      )}

      {/* Show empty folder message if expanded but no children */}
      {isFolder && isExpanded && hasChildren && childrenCount === 0 && !isLoading && (
        <EmptyFolderMessage $depth={depth + 1}>Empty folder</EmptyFolderMessage>
      )}
    </>
  )
}

const NodeContainer = styled.div<{ $depth: number }>`
  display: flex;
  flex-direction: column;
  padding-left: ${(props) => props.$depth * 16}px;
`

const NodeContent = styled.div<{ $isRoot?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: var(--color-background-soft);
  }
`

const ExpandIcon = styled.div<{ $spacer?: boolean; $isLoading?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: ${(props) => (props.$isLoading ? 'var(--color-primary)' : 'var(--color-text-secondary)')};
  cursor: ${(props) => (props.$spacer || props.$isLoading ? 'default' : 'pointer')};

  ${(props) =>
    props.$spacer &&
    `
    pointer-events: none;
    opacity: 0.3;
  `}
`

const NodeIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
`

const NodeName = styled.div`
  flex: 1;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.15s;

  &:hover {
    background: var(--color-background-soft);
    color: var(--color-error);
  }
`

const EmptyFolderMessage = styled.div<{ $depth: number }>`
  padding: 6px 8px 6px ${(props) => props.$depth * 16 + 44}px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-style: italic;
`

export default WorkspaceTreeNode
