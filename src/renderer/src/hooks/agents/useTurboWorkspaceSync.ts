/**
 * useTurboWorkspaceSync - Hook for bidirectional sync of accessible_paths
 * between Speedy Mode workspace panel and Agent default configuration.
 *
 * Features:
 * - Adding/removing paths in Speedy Mode workspace panel → syncs to Agent config
 * - Modifying paths in Agent settings → syncs to current active Session
 * - Prevents infinite sync loops with isSyncing ref
 */
import { loggerService } from '@logger'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useAgent } from './useAgent'
import { useSession } from './useSession'
import { useUpdateAgent } from './useUpdateAgent'
import { useUpdateSession } from './useUpdateSession'

const logger = loggerService.withContext('useTurboWorkspaceSync')

// Speedy Mode uses the system agent (agent_turbo_system) from the Agent system
// This ID must match the TURBO_AGENT_ID constant in AgentService.ts
const TURBO_AGENT_ID = 'agent_turbo_system'

export interface UseTurboWorkspaceSyncResult {
  /** Current accessible paths (from session or agent as fallback) */
  accessiblePaths: string[]
  /** Add a path with bidirectional sync */
  addPath: (path: string) => Promise<void>
  /** Remove a path with bidirectional sync */
  removePath: (path: string) => Promise<void>
  /** Whether a sync operation is in progress */
  isSyncing: boolean
}

/**
 * Hook for bidirectional sync of accessible_paths between
 * Speedy Mode workspace panel and Agent default configuration.
 */
export const useTurboWorkspaceSync = (): UseTurboWorkspaceSyncResult => {
  const { t } = useTranslation()
  const { chat } = useRuntime()
  const { activeSessionIdMap } = chat
  const activeSessionId = activeSessionIdMap[TURBO_AGENT_ID]

  // Get Agent data
  const { agent } = useAgent(TURBO_AGENT_ID)

  // Get current session
  const { session } = useSession(TURBO_AGENT_ID, activeSessionId)

  // Get update functions
  const { updateSession } = useUpdateSession(TURBO_AGENT_ID)
  const { updateAgent } = useUpdateAgent()

  // Sync state tracking
  const isSyncingRef = useRef(false)
  const lastSyncedPathsRef = useRef<string>('')

  // Get current accessible paths (prefer session, fallback to agent)
  const accessiblePaths = session?.accessible_paths || agent?.accessible_paths || []

  // Agent → Session sync
  // When agent's accessible_paths changes (e.g., from settings page),
  // sync to the current active session
  useEffect(() => {
    // Skip if syncing is in progress or required data is missing
    if (isSyncingRef.current || !session || !agent) {
      return
    }

    // Skip if paths are already the same
    const sessionPaths = JSON.stringify(session.accessible_paths || [])
    const agentPaths = JSON.stringify(agent.accessible_paths || [])

    if (sessionPaths === agentPaths) {
      return
    }

    // Skip if this is the same sync we just did (prevent redundant syncs)
    if (agentPaths === lastSyncedPathsRef.current) {
      return
    }

    logger.debug('Syncing agent accessible_paths to session', {
      agentPaths: agent.accessible_paths,
      sessionPaths: session.accessible_paths
    })

    isSyncingRef.current = true
    lastSyncedPathsRef.current = agentPaths

    updateSession(
      {
        id: session.id,
        accessible_paths: agent.accessible_paths
      },
      { showSuccessToast: false }
    )
      .then(() => {
        logger.debug('Successfully synced agent accessible_paths to session')
      })
      .catch((error) => {
        logger.error('Failed to sync agent accessible_paths to session:', error as Error)
      })
      .finally(() => {
        isSyncingRef.current = false
      })
  }, [agent?.accessible_paths, session, updateSession])

  // Add path with bidirectional sync
  const addPath = useCallback(
    async (path: string) => {
      if (!session) {
        logger.warn('Cannot add path: no active session')
        return
      }

      if (accessiblePaths.includes(path)) {
        window.toast.warning(t('agent.session.accessible_paths.duplicate'))
        return
      }

      isSyncingRef.current = true
      const newPaths = [...accessiblePaths, path]
      lastSyncedPathsRef.current = JSON.stringify(newPaths)

      try {
        // Update both session and agent in parallel
        await Promise.all([
          updateSession(
            {
              id: session.id,
              accessible_paths: newPaths
            },
            { showSuccessToast: false }
          ),
          updateAgent(
            {
              id: TURBO_AGENT_ID,
              accessible_paths: newPaths
            },
            { showSuccessToast: false }
          )
        ])

        window.toast.success(t('common.add_success'))
        logger.debug('Successfully added path to both session and agent', { path })
      } catch (error) {
        logger.error('Failed to add path:', error as Error)
        window.toast.error(t('common.add_failed'))
      } finally {
        isSyncingRef.current = false
      }
    },
    [session, accessiblePaths, updateSession, updateAgent, t]
  )

  // Remove path with bidirectional sync
  const removePath = useCallback(
    async (path: string) => {
      if (!session) {
        logger.warn('Cannot remove path: no active session')
        return
      }

      const newPaths = accessiblePaths.filter((p) => p !== path)

      if (newPaths.length === 0) {
        window.toast.error(t('agent.session.accessible_paths.error.at_least_one'))
        return
      }

      isSyncingRef.current = true
      lastSyncedPathsRef.current = JSON.stringify(newPaths)

      try {
        // Update both session and agent in parallel
        await Promise.all([
          updateSession(
            {
              id: session.id,
              accessible_paths: newPaths
            },
            { showSuccessToast: false }
          ),
          updateAgent(
            {
              id: TURBO_AGENT_ID,
              accessible_paths: newPaths
            },
            { showSuccessToast: false }
          )
        ])

        window.toast.success(t('common.delete_success'))
        logger.debug('Successfully removed path from both session and agent', { path })
      } catch (error) {
        logger.error('Failed to remove path:', error as Error)
        window.toast.error(t('common.delete_failed'))
      } finally {
        isSyncingRef.current = false
      }
    },
    [session, accessiblePaths, updateSession, updateAgent, t]
  )

  return {
    accessiblePaths,
    addPath,
    removePath,
    isSyncing: isSyncingRef.current
  }
}
