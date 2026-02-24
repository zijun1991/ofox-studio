/**
 * WorkspacePanel - Agent working directory management for Speedy Mode
 *
 * Features:
 * - Display accessible_paths from session
 * - Drag and drop to add new directories
 * - Tree view with lazy loading for subdirectories
 * - Remove directories (updates session.accessible_paths)
 * - Filter files and directories with keyboard navigation
 */
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { WorkspaceNode } from '@renderer/types/workspace'
import { getFileExtension } from '@renderer/types/workspace'
import { Modal, Spin, Tooltip } from 'antd'
import { debounce } from 'lodash'
import { FileText, Folder, FolderPlus, Plus, SlidersHorizontal, X } from 'lucide-react'
import type { FC } from 'react'
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import WorkspaceTreeNode from './WorkspaceTreeNode'

interface WorkspacePanelProps {
  paths: string[]
  onAddPath: (path: string) => Promise<void>
  onRemovePath: (path: string) => Promise<void>
}

// Node state for tracking expansion and children
interface NodeState {
  expanded: boolean
  children: WorkspaceNode[]
  isLoading: boolean
}

// Filter result type
interface FilterResult {
  node: WorkspaceNode
  absolutePath: string
}

const MAX_FILTER_RESULTS = 50
const EXCLUDE_PATTERNS_STORAGE_KEY = 'ofox-workspace-exclude-patterns'
const DEFAULT_EXCLUDE_PATTERNS = ['node_modules', 'dist', '.git']

// Context for tree nodes
interface WorkspaceContextValue {
  removeNode: (path: string) => void
  getNodeState: (nodeId: string) => NodeState | undefined
  toggleExpand: (nodeId: string) => void
  loadChildren: (nodeId: string, path: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspaceContext() {
  const context = use(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspaceContext must be used within WorkspacePanel')
  }
  return context
}

const WorkspacePanel: FC<WorkspacePanelProps> = ({ paths, onAddPath, onRemovePath }) => {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  // Filter states
  const [filterText, setFilterText] = useState('')
  const [isFiltering, setIsFiltering] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [filteredResults, setFilteredResults] = useState<FilterResult[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const expandedStateBackup = useRef<Record<string, boolean>>({})
  const filterInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Exclude patterns state with localStorage persistence
  const [isExcludeModalVisible, setIsExcludeModalVisible] = useState(false)
  const [excludePatterns, setExcludePatterns] = useState<string[]>(() => {
    const stored = localStorage.getItem(EXCLUDE_PATTERNS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_EXCLUDE_PATTERNS
  })

  // Local state for node expansion and children
  const [nodesState, setNodesState] = useState<Record<string, NodeState>>({})

  // Load directory children via IPC
  const loadDirectoryChildren = useCallback(async (dirPath: string): Promise<WorkspaceNode[]> => {
    try {
      // listDirectory returns string[] (array of file paths)
      const entryPaths = await window.api.file.listDirectory(dirPath, { recursive: false })
      if (!entryPaths || entryPaths.length === 0) {
        return []
      }

      // Check which entries are directories
      const dirChecks = await Promise.all(entryPaths.map((path: string) => window.api.file.isDirectory(path)))

      return entryPaths.map((entryPath: string, index: number) => {
        const now = Date.now()
        const parts = entryPath.split(/[/\\]/)
        const name = parts[parts.length - 1] || entryPath
        const isDir = dirChecks[index]

        return {
          id: `${entryPath}_${now}`,
          name,
          type: isDir ? ('folder' as const) : ('file' as const),
          path: entryPath,
          size: undefined,
          ext: isDir ? undefined : getFileExtension(name),
          children: undefined,
          expanded: false,
          createdAt: now,
          updatedAt: now
        }
      })
    } catch (error) {
      console.error('Failed to load directory children:', { dirPath, error })
      return []
    }
  }, [])

  // Get node state
  const getNodeState = useCallback(
    (nodeId: string) => {
      return nodesState[nodeId]
    },
    [nodesState]
  )

  // Toggle node expansion
  const toggleExpand = useCallback((nodeId: string) => {
    setNodesState((prev) => {
      const existing = prev[nodeId]
      return {
        ...prev,
        [nodeId]: {
          expanded: !existing?.expanded,
          children: existing?.children || [],
          isLoading: false
        }
      }
    })
  }, [])

  // Load children for a node
  const loadChildren = useCallback(
    async (nodeId: string, path: string) => {
      // Set loading state
      setNodesState((prev) => {
        const existing = prev[nodeId]
        return {
          ...prev,
          [nodeId]: {
            expanded: existing?.expanded ?? true,
            children: existing?.children || [],
            isLoading: true
          }
        }
      })

      try {
        const children = await loadDirectoryChildren(path)
        setNodesState((prev) => {
          return {
            ...prev,
            [nodeId]: {
              expanded: true,
              children,
              isLoading: false
            }
          }
        })
      } catch (error) {
        console.error('Failed to load children:', { nodeId, path, error })
        setNodesState((prev) => {
          const existing = prev[nodeId]
          return {
            ...prev,
            [nodeId]: {
              expanded: existing?.expanded ?? true,
              children: [],
              isLoading: false
            }
          }
        })
      }
    },
    [loadDirectoryChildren]
  )

  // Remove a path
  const removeNode = useCallback(
    (path: string) => {
      onRemovePath(path)
      // Clean up local state
      setNodesState((prev) => {
        const newState = { ...prev }
        delete newState[path]
        return newState
      })
    },
    [onRemovePath]
  )

  // Context value
  const contextValue = useMemo(
    () => ({
      removeNode,
      getNodeState,
      toggleExpand,
      loadChildren
    }),
    [removeNode, getNodeState, toggleExpand, loadChildren]
  )

  // Convert paths to root nodes
  const rootNodes = useMemo(() => {
    return paths.map((path) => {
      const parts = path.split(/[/\\]/)
      const name = parts[parts.length - 1] || path
      return {
        id: path,
        name,
        type: 'folder' as const,
        path,
        expanded: nodesState[path]?.expanded ?? false,
        children: nodesState[path]?.children,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  }, [paths, nodesState])

  // Check if a path should be excluded based on patterns
  const shouldExclude = useCallback((path: string, patterns: string[]): boolean => {
    return patterns.some((pattern) => path.includes(pattern))
  }, [])

  // Stream all nodes using BFS for filtering with early termination and abort support
  const streamAllNodes = useCallback(
    async (
      nodes: WorkspaceNode[],
      text: string,
      options: {
        signal: AbortSignal
        onResult: (result: FilterResult) => void
      }
    ): Promise<void> => {
      const { signal, onResult } = options
      const lowerText = text.toLowerCase()
      // BFS queue: stores nodes to be processed
      const queue: WorkspaceNode[] = [...nodes]
      let resultCount = 0

      while (queue.length > 0) {
        // Check if aborted
        if (signal.aborted) break

        // Early termination check
        if (resultCount >= MAX_FILTER_RESULTS) break

        const node = queue.shift()!

        // Skip excluded paths
        if (shouldExclude(node.path, excludePatterns)) continue

        // Check if node name matches filter text
        if (node.name.toLowerCase().includes(lowerText)) {
          onResult({ node, absolutePath: node.path })
          resultCount++
        }

        // If folder, load children and add to queue for BFS
        if (node.type === 'folder') {
          let children: WorkspaceNode[] | undefined

          // Priority 1: Use node's own children if loaded
          if (node.children && node.children.length > 0) {
            children = node.children
          }
          // Priority 2: Use cached children from nodesState
          else if (nodesState[node.id]?.children) {
            children = nodesState[node.id]!.children
          }
          // Priority 3: Load from filesystem for unloaded directories
          else {
            children = await loadDirectoryChildren(node.path)
          }

          if (children && children.length > 0) {
            // Add children to queue for BFS (process after all current level nodes)
            queue.push(...children)
          }
        }
      }
    },
    [excludePatterns, loadDirectoryChildren, nodesState, shouldExclude]
  )

  // Cancel current search
  const cancelCurrentSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Debounced filter function with streaming support
  const debouncedFilter = useMemo(
    () =>
      debounce(async (text: string) => {
        // Cancel any ongoing search first
        cancelCurrentSearch()

        if (!text.trim()) {
          // Restore expanded states before exiting filter mode
          if (isFiltering) {
            setNodesState((prev) => {
              const newState = { ...prev }
              Object.keys(expandedStateBackup.current).forEach((nodeId) => {
                if (newState[nodeId]) {
                  newState[nodeId] = {
                    ...newState[nodeId]!,
                    expanded: expandedStateBackup.current[nodeId]!
                  }
                }
              })
              return newState
            })
          }
          setIsFiltering(false)
          setFilteredResults([])
          setIsSearching(false)
          return
        }

        // Backup expanded states before entering filter mode
        if (!isFiltering) {
          const backup: Record<string, boolean> = {}
          Object.keys(nodesState).forEach((nodeId) => {
            backup[nodeId] = nodesState[nodeId]!.expanded
          })
          expandedStateBackup.current = backup
        }

        // Create new abort controller for this search
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        // Reset states for new search
        setFilteredResults([])
        setHighlightedIndex(0)
        setIsFiltering(true)
        setIsSearching(true)

        // Stream search results
        await streamAllNodes(rootNodes, text, {
          signal: abortController.signal,
          onResult: (result) => {
            setFilteredResults((prev) => [...prev, result])
          }
        })

        // Only mark as not searching if this search wasn't aborted
        if (!abortController.signal.aborted) {
          setIsSearching(false)
        }
      }, 300),
    [cancelCurrentSearch, isFiltering, nodesState, rootNodes, streamAllNodes]
  )

  // Handle filter input change
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value
      setFilterText(text)
      if (!text.trim()) {
        // Cancel any pending debounced filter when input is cleared
        debouncedFilter.cancel()
        // Immediately clear filter state
        debouncedFilter('')
      } else {
        debouncedFilter(text)
      }
    },
    [debouncedFilter]
  )

  // Clear filter
  const handleClearFilter = useCallback(() => {
    // Cancel any ongoing search
    cancelCurrentSearch()
    setFilterText('')
    setIsSearching(false)
    debouncedFilter('')
    filterInputRef.current?.focus()
  }, [cancelCurrentSearch, debouncedFilter])

  // Add exclude pattern
  const handleAddExcludePattern = useCallback(
    (pattern: string) => {
      const trimmed = pattern.trim()
      if (!trimmed || excludePatterns.includes(trimmed)) return
      const newPatterns = [...excludePatterns, trimmed]
      setExcludePatterns(newPatterns)
      localStorage.setItem(EXCLUDE_PATTERNS_STORAGE_KEY, JSON.stringify(newPatterns))
    },
    [excludePatterns]
  )

  // Remove exclude pattern
  const handleRemoveExcludePattern = useCallback(
    (pattern: string) => {
      const newPatterns = excludePatterns.filter((p) => p !== pattern)
      setExcludePatterns(newPatterns)
      localStorage.setItem(EXCLUDE_PATTERNS_STORAGE_KEY, JSON.stringify(newPatterns))
    },
    [excludePatterns]
  )

  // Insert path to message
  const handleInsertPath = useCallback(
    (path: string) => {
      // Cancel any ongoing search
      cancelCurrentSearch()
      // Emit event to insert path into message input
      EventEmitter.emit(EVENT_NAMES.WORKSPACE_NODE_DOUBLE_CLICK, { path })
      setFilterText('')
      setIsFiltering(false)
      setIsSearching(false)
      setFilteredResults([])
      debouncedFilter.cancel()
    },
    [cancelCurrentSearch, debouncedFilter]
  )

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isFiltering || filteredResults.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev >= filteredResults.length - 1 ? 0 : prev + 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev <= 0 ? filteredResults.length - 1 : prev - 1))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredResults[highlightedIndex]) {
            handleInsertPath(filteredResults[highlightedIndex]!.absolutePath)
          }
          break
      }
    },
    [isFiltering, filteredResults, highlightedIndex, handleInsertPath]
  )

  // Get file icon based on type
  const getFileIcon = useCallback((node: WorkspaceNode) => {
    if (node.type === 'folder') {
      return <Folder size={16} color="var(--color-primary)" />
    }
    return <FileText size={16} color="var(--color-text-secondary)" />
  }, [])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      setIsAdding(true)
      try {
        for (const file of files) {
          const filePath = window.api.file.getPathForFile(file)
          const isDir = await window.api.file.isDirectory(filePath)
          if (isDir && !paths.includes(filePath)) {
            await onAddPath(filePath)
          }
        }
      } catch (error) {
        console.error('Failed to add path:', error)
      } finally {
        setIsAdding(false)
      }
    },
    [paths, onAddPath]
  )

  // Click to select folder
  const handleSelectFolder = useCallback(async () => {
    if (isAdding) return

    const folderPath = await window.api.file.selectFolder({
      title: t('workspace.select_folder')
    })

    if (folderPath && !paths.includes(folderPath)) {
      setIsAdding(true)
      try {
        await onAddPath(folderPath)
      } finally {
        setIsAdding(false)
      }
    }
  }, [isAdding, paths, onAddPath, t])

  const isEmpty = paths.length === 0

  return (
    <WorkspaceContext value={contextValue}>
      <Container onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} $isDragging={isDragging}>
        <Header>
          <TitleContainer>
            <Title>{t('workspace.title')}</Title>
          </TitleContainer>
          <AddButton onClick={handleSelectFolder} title={t('workspace.add_folder')}>
            <Plus size={14} />
          </AddButton>
        </Header>

        {/* Filter Input */}
        {!isEmpty && (
          <FilterContainer>
            <FilterInputWrapper>
              <FilterInput
                ref={filterInputRef}
                type="text"
                placeholder={t('workspace.filter_placeholder', { defaultValue: '搜索文件或文件夹...' })}
                value={filterText}
                onChange={handleFilterChange}
                onKeyDown={handleKeyDown}
              />
              {filterText && (
                <ClearButton onClick={handleClearFilter} title={t('common.clear')}>
                  <X size={14} />
                </ClearButton>
              )}
            </FilterInputWrapper>
            <ExcludeConfigButton
              onClick={() => setIsExcludeModalVisible(true)}
              title={t('workspace.exclude_config_title', { defaultValue: '排除规则配置' })}>
              <SlidersHorizontal size={14} />
            </ExcludeConfigButton>
          </FilterContainer>
        )}

        <DropZone $show={isDragging}>
          <DropIcon>
            <FolderPlus size={32} />
          </DropIcon>
          <DropText>{t('workspace.drop_hint')}</DropText>
        </DropZone>

        {/* Filter Results */}
        {isFiltering && !isDragging && !isAdding && (
          <>
            {/* Searching status bar - fixed at top */}
            {isSearching && (
              <SearchingBar>
                <Spin size="small" />
                <span>{t('workspace.searching', { defaultValue: '搜索中...' })}</span>
              </SearchingBar>
            )}
            <FilterResultsContainer>
              {filteredResults.length === 0 && !isSearching ? (
                <EmptyFilterResult>{t('workspace.no_results', { defaultValue: '未找到匹配的结果' })}</EmptyFilterResult>
              ) : (
                filteredResults.map((result, index) => (
                  <Tooltip key={`${result.node.id}_${index}`} title={result.absolutePath} placement="right">
                    <FilterResultItem
                      $highlighted={index === highlightedIndex}
                      onClick={() => setHighlightedIndex(index)}
                      onDoubleClick={() => handleInsertPath(result.absolutePath)}>
                      <FilterResultFirstRow>
                        {getFileIcon(result.node)}
                        <span>{result.node.name}</span>
                      </FilterResultFirstRow>
                      <FilterResultSecondRow>{result.absolutePath}</FilterResultSecondRow>
                    </FilterResultItem>
                  </Tooltip>
                ))
              )}
              {/* Result limit hint */}
              {filteredResults.length >= MAX_FILTER_RESULTS && (
                <ResultLimitHint>
                  {t('workspace.filter_limit_hint', { defaultValue: '已显示前50个结果，请细化搜索条件' })}
                </ResultLimitHint>
              )}
            </FilterResultsContainer>
          </>
        )}

        {/* Tree View */}
        <TreeContainer $show={!isDragging && !isAdding && !isFiltering}>
          {isEmpty ? (
            <EmptyState onClick={handleSelectFolder}>
              <EmptyIcon>
                <FolderPlus size={32} />
              </EmptyIcon>
              <EmptyText>{t('workspace.empty_hint_click')}</EmptyText>
              <EmptyHint>{t('workspace.empty_hint_sub')}</EmptyHint>
            </EmptyState>
          ) : (
            rootNodes.map((node) => <WorkspaceTreeNode key={node.id} node={node} depth={0} isRoot />)
          )}
        </TreeContainer>

        {/* Help Footer - Fixed at bottom */}
        <HelpFooter>
          <HelpFooterTitle>{t('workspace.help_title')}</HelpFooterTitle>
          <HelpFooterContent>{t('workspace.help_footer')}</HelpFooterContent>
        </HelpFooter>

        {/* Exclude Patterns Modal */}
        <ExcludePatternsModal
          visible={isExcludeModalVisible}
          onClose={() => setIsExcludeModalVisible(false)}
          patterns={excludePatterns}
          onAddPattern={handleAddExcludePattern}
          onRemovePattern={handleRemoveExcludePattern}
        />
      </Container>
    </WorkspaceContext>
  )
}

// Exclude Patterns Modal Component
interface ExcludePatternsModalProps {
  visible: boolean
  onClose: () => void
  patterns: string[]
  onAddPattern: (pattern: string) => void
  onRemovePattern: (pattern: string) => void
}

const ExcludePatternsModal: FC<ExcludePatternsModalProps> = ({
  visible,
  onClose,
  patterns,
  onAddPattern,
  onRemovePattern
}) => {
  const { t } = useTranslation()
  const [newPattern, setNewPattern] = useState('')

  const handleAdd = () => {
    if (newPattern.trim()) {
      onAddPattern(newPattern.trim())
      setNewPattern('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <Modal
      title={t('workspace.exclude_config_title', { defaultValue: '排除规则配置' })}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={400}>
      <ExcludeModalContent>
        <ExcludeDescription>
          {t('workspace.exclude_description', { defaultValue: '以下目录将在筛选时被排除' })}
        </ExcludeDescription>
        <ExcludeInputRow>
          <ExcludeInput
            type="text"
            placeholder={t('workspace.exclude_placeholder', { defaultValue: '输入目录名称，如: build' })}
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <ExcludeAddButton onClick={handleAdd} disabled={!newPattern.trim()}>
            {t('common.add', { defaultValue: '添加' })}
          </ExcludeAddButton>
        </ExcludeInputRow>
        <ExcludePatternList>
          {patterns.length === 0 ? (
            <ExcludeEmpty>{t('workspace.exclude_empty', { defaultValue: '暂无排除规则' })}</ExcludeEmpty>
          ) : (
            patterns.map((pattern) => (
              <ExcludePatternItem key={pattern}>
                <span>{pattern}</span>
                <ExcludeRemoveButton onClick={() => onRemovePattern(pattern)} title={t('common.delete')}>
                  <X size={14} />
                </ExcludeRemoveButton>
              </ExcludePatternItem>
            ))
          )}
        </ExcludePatternList>
      </ExcludeModalContent>
    </Modal>
  )
}

const Container = styled.div<{ $isDragging: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
  position: relative;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  border-radius: 0;

  ${(props) =>
    props.$isDragging &&
    `
    border-color: var(--color-primary);
    border-style: dashed;
  `}
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 0.5px solid var(--color-border);
`

const TitleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const Title = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`

const HelpFooter = styled.div`
  padding: 8px 12px;
  background: var(--color-background-secondary);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
`

const HelpFooterTitle = styled.div`
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text);
  margin-bottom: 2px;
`

const HelpFooterContent = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  line-height: 1.4;
`

const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: var(--color-list-item-hover);
    color: var(--color-text-2);
  }
`

const FilterContainer = styled.div`
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 8px;
`

const FilterInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
`

const FilterInput = styled.input`
  width: 100%;
  padding: 6px 28px 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-3);
  }
`

const ClearButton = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;

  &:hover {
    background: var(--color-list-item-hover);
    color: var(--color-text);
  }
`

const ExcludeConfigButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-2);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  flex-shrink: 0;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const FilterResultsContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
`

const SearchingBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-2);
  flex-shrink: 0;

  .ant-spin {
    color: var(--color-primary);
  }
`

const FilterResultItem = styled.div<{ $highlighted: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  background: ${(props) => (props.$highlighted ? 'var(--color-primary-mute)' : 'transparent')};
  border-left: ${(props) => (props.$highlighted ? '3px solid var(--color-primary)' : '3px solid transparent')};
  transition: background 0.15s, border-left-color 0.15s;
  max-width: 1000px;

  &:hover {
    background: ${(props) => (props.$highlighted ? 'var(--color-primary-mute)' : 'var(--color-list-item-hover)')};
  }
`

const FilterResultFirstRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text);
  margin-bottom: 2px;
  overflow: hidden;

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const FilterResultSecondRow = styled.div`
  font-size: 10px;
  color: var(--color-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 24px;
`

const EmptyFilterResult = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-3);
  font-size: 13px;
`

const ResultLimitHint = styled.div`
  padding: 12px 16px;
  text-align: center;
  color: var(--color-text-3);
  font-size: 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background-soft);
`

const DropZone = styled.div<{ $show: boolean }>`
  display: ${(props) => (props.$show ? 'flex' : 'none')};
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 48px;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(var(--color-primary-rgb), 0.1);
  z-index: 10;
  gap: 12px;
`

const DropIcon = styled.div`
  color: var(--color-primary);
`

const DropText = styled.div`
  font-size: 14px;
  color: var(--color-primary);
  font-weight: 500;
`

const TreeContainer = styled.div<{ $show: boolean }>`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: ${(props) => (props.$show ? 'block' : 'none')};
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  margin: 8px;
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  min-height: 120px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--color-primary);
    background: rgba(var(--color-primary-rgb), 0.05);
  }
`

const EmptyIcon = styled.div`
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
  opacity: 0.6;
`

const EmptyText = styled.div`
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
  line-height: 1.5;
`

const EmptyHint = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 4px;
`

// Exclude Patterns Modal Styles
const ExcludeModalContent = styled.div`
  padding: 8px 0;
`

const ExcludeDescription = styled.div`
  font-size: 13px;
  color: var(--color-text-2);
  margin-bottom: 16px;
`

const ExcludeInputRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`

const ExcludeInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-3);
  }
`

const ExcludeAddButton = styled.button<{ disabled: boolean }>`
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: ${(props) => (props.disabled ? 'var(--color-background-soft)' : 'var(--color-primary)')};
  color: ${(props) => (props.disabled ? 'var(--color-text-3)' : 'white')};
  font-size: 13px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  transition: all 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`

const ExcludePatternList = styled.div`
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 8px;
`

const ExcludePatternItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-text);

  &:hover {
    background: var(--color-background-soft);
  }

  span {
    font-family: monospace;
    background: var(--color-background-soft);
    padding: 2px 6px;
    border-radius: 3px;
  }
`

const ExcludeRemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: var(--color-list-item-hover);
    color: var(--color-error);
  }
`

const ExcludeEmpty = styled.div`
  text-align: center;
  padding: 24px;
  color: var(--color-text-3);
  font-size: 13px;
`

export default WorkspacePanel
