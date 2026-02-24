/**
 * SpeedyPage - Main page for Speedy Mode
 *
 * A simplified chat interface with:
 * - Sessions sidebar (using Agent system)
 * - Chat content area
 * - Workspace panel for file management
 *
 * Note: Speedy Mode uses the system agent (agent_turbo_system) from the Agent system.
 */
import { loggerService } from '@logger'
import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import { QuickPanelProvider } from '@renderer/components/QuickPanel/provider'
import { useAgent } from '@renderer/hooks/agents/useAgent'
import { useAgentClient } from '@renderer/hooks/agents/useAgentClient'
import { useAgentSessionInitializer } from '@renderer/hooks/agents/useAgentSessionInitializer'
import { useCreateDefaultSession } from '@renderer/hooks/agents/useCreateDefaultSession'
import { useCyclePermissionMode } from '@renderer/hooks/agents/useCyclePermissionMode'
import { useSession } from '@renderer/hooks/agents/useSession'
import { useSessions } from '@renderer/hooks/agents/useSessions'
import { useTurboWorkspaceSync } from '@renderer/hooks/agents/useTurboWorkspaceSync'
import { useModelEmployee } from '@renderer/hooks/useModelEmployee'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useNavbarPosition } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import AgentSessionInputbar from '@renderer/pages/home/Inputbar/AgentSessionInputbar'
import AgentSessionMessages from '@renderer/pages/home/Messages/AgentSessionMessages'
import { useAppDispatch } from '@renderer/store'
import { setActiveSessionIdAction, setActiveTopicOrSessionAction } from '@renderer/store/runtime'
import { EducationLevel } from '@renderer/types/modelEmployee'
import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import SpeedyNavbar from './components/SpeedyNavbar'
import SpeedySessionsSidebar from './components/SpeedySessionsSidebar'
import WorkspacePanel from './components/WorkspacePanel'

const logger = loggerService.withContext('SpeedyPage')

// Speedy Mode uses the system agent (agent_turbo_system) from the Agent system
// This ID must match the TURBO_AGENT_ID constant in AgentService.ts
const TURBO_AGENT_ID = 'agent_turbo_system'

const SpeedyPage: FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { isLeftNavbar } = useNavbarPosition()

  // Initialize Agent Session (auto-loads session when agent is activated)
  useAgentSessionInitializer()

  // Get the Turbo Agent
  const { agent, isLoading: agentLoading, error: agentError } = useAgent(TURBO_AGENT_ID)

  // Get Agent client for updating agent
  const client = useAgentClient()

  // Get sessions for the Turbo Agent
  const { sessions, isLoading: sessionsLoading, error: sessionsError } = useSessions(TURBO_AGENT_ID)

  // Create default session hook
  const { createDefaultSession, creatingSession } = useCreateDefaultSession(TURBO_AGENT_ID)

  // Get runtime state
  const { chat } = useRuntime()
  const { activeSessionIdMap } = chat
  const activeSessionId = activeSessionIdMap[TURBO_AGENT_ID]

  // Get current session (hooks triggers message loading via loadTopicMessagesThunk internally)
  useSession(TURBO_AGENT_ID, activeSessionId)

  // Workspace path management with bidirectional sync to Agent config
  const { accessiblePaths, addPath: handleAddPath, removePath: handleRemovePath } = useTurboWorkspaceSync()

  // Permission mode cycle shortcut
  const { cyclePermissionMode } = useCyclePermissionMode()
  useShortcut(
    'cycle_permission_mode',
    () => {
      cyclePermissionMode(true)
    },
    {
      preventDefault: true,
      enableOnFormTags: false
    }
  )

  // Get model employees
  const { getEmployeesByEducationLevel, getEmployeeByModel } = useModelEmployee()

  // Get default employee with fallback logic: high_school -> undergraduate -> master -> phd
  const getDefaultEmployee = useCallback(() => {
    const levels = [EducationLevel.HIGH_SCHOOL, EducationLevel.UNDERGRADUATE, EducationLevel.MASTER, EducationLevel.PHD]
    for (const level of levels) {
      const employees = getEmployeesByEducationLevel(level)
      if (employees.length > 0) {
        return employees[0]
      }
    }
    return null
  }, [getEmployeesByEducationLevel])

  const defaultEmployee = getDefaultEmployee()
  const hasEmployee = !!defaultEmployee

  // Selected employee ID (for model switching) - default to the first available employee
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(defaultEmployee?.id || null)

  // Track if Agent model has been initialized
  const [modelInitialized, setModelInitialized] = useState(false)

  // Update selectedEmployeeId when defaultEmployee changes (e.g., on initial load)
  useEffect(() => {
    if (defaultEmployee && !selectedEmployeeId) {
      setSelectedEmployeeId(defaultEmployee.id)
    }
  }, [defaultEmployee, selectedEmployeeId])

  // Sync selectedEmployeeId with Agent's current model when returning to Speedy mode
  // Only sync when agent.model changes, not when selectedEmployeeId changes
  useEffect(() => {
    if (agent?.model) {
      const employee = getEmployeeByModel(agent.model)
      if (employee && employee.id !== selectedEmployeeId) {
        setSelectedEmployeeId(employee.id)
      }
    }
  }, [agent?.model, getEmployeeByModel])

  // Initialize Agent's model from default employee if not set
  useEffect(() => {
    const initAgentModel = async () => {
      // If Agent already has model, mark as initialized
      if (agent?.model) {
        setModelInitialized(true)
        return
      }

      // If Agent has no model but we have a default employee, set the model
      if (agent && !agent.model && defaultEmployee?.model) {
        const modelId = `${defaultEmployee.model.provider}:${defaultEmployee.model.id}`
        logger.info(`Initializing Agent model from default employee: ${modelId}`)
        try {
          await client.updateAgent({ id: TURBO_AGENT_ID, model: modelId })
          setModelInitialized(true)
        } catch (error) {
          logger.error('Failed to initialize Agent model:', error as Error)
        }
      }
    }

    // Only run when agent is loaded and defaultEmployee is determined
    if (agent && defaultEmployee !== undefined) {
      initAgentModel()
    }
  }, [agent, defaultEmployee, client])

  // Auto-create first session if no sessions exist (only after model is initialized)
  useEffect(() => {
    if (!sessionsLoading && sessions.length === 0 && !creatingSession && modelInitialized && agent?.model) {
      logger.info('No sessions found, creating default session for Speedy Mode')
      createDefaultSession()
    }
  }, [sessionsLoading, sessions.length, creatingSession, modelInitialized, agent, createDefaultSession])

  // Handle session selection
  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      dispatch(setActiveSessionIdAction({ agentId: TURBO_AGENT_ID, sessionId }))
      dispatch(setActiveTopicOrSessionAction('session'))
    },
    [dispatch]
  )

  // Handle employee change
  const handleEmployeeChange = useCallback((employeeId: string) => {
    setSelectedEmployeeId(employeeId)
    // Note: The actual model update is handled in SpeedyNavbar
  }, [])

  // Handle navigate to model employee settings
  const handleConfigureEmployees = useCallback(() => {
    navigate('/settings/model-employees')
  }, [navigate])

  // Log loading states for debugging
  useEffect(() => {
    if (agentLoading) {
      logger.debug('Loading Turbo Agent...')
    }
    if (agentError) {
      logger.error('Error loading Turbo Agent:', agentError)
    }
    if (sessionsError) {
      logger.error('Error loading sessions:', sessionsError)
    }
  }, [agentLoading, agentError, sessionsError])

  return (
    <Container>
      {isLeftNavbar && (
        <Navbar>
          <NavbarCenter />
        </Navbar>
      )}
      <MainContent id={isLeftNavbar ? 'content-container' : undefined}>
        <LeftSidebar>
          <SpeedySessionsSidebar
            agentId={TURBO_AGENT_ID}
            activeSessionId={activeSessionId}
            onSessionSelect={handleSessionSelect}
          />
        </LeftSidebar>
        <ChatArea>
          {hasEmployee ? (
            <QuickPanelProvider>
              <SpeedyNavbar
                selectedEmployeeId={selectedEmployeeId}
                onEmployeeChange={handleEmployeeChange}
                agentId={TURBO_AGENT_ID}
                activeSessionId={activeSessionId ?? undefined}
              />
              {activeSessionId && agent ? (
                <ChatContent>
                  <MessagesContainer>
                    <AgentSessionMessages agentId={TURBO_AGENT_ID} sessionId={activeSessionId} />
                  </MessagesContainer>
                  <AgentSessionInputbar agentId={TURBO_AGENT_ID} sessionId={activeSessionId} />
                </ChatContent>
              ) : (
                <ChatPlaceholder>
                  <PlaceholderText>{t('speedy.chat_placeholder')}</PlaceholderText>
                </ChatPlaceholder>
              )}
            </QuickPanelProvider>
          ) : (
            <NoEmployeePanel>
              <NoEmployeeIcon>🤖</NoEmployeeIcon>
              <NoEmployeeTitle>{t('speedy.no_employee_title')}</NoEmployeeTitle>
              <NoEmployeeDescription>{t('speedy.no_employee_description')}</NoEmployeeDescription>
              <ConfigureButton onClick={handleConfigureEmployees}>{t('speedy.configure_employees')}</ConfigureButton>
            </NoEmployeePanel>
          )}
        </ChatArea>
        <RightPanel>
          {hasEmployee && (
            <WorkspacePanel paths={accessiblePaths} onAddPath={handleAddPath} onRemovePath={handleRemovePath} />
          )}
        </RightPanel>
      </MainContent>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width));
  }
  [navbar-position='top'] & {
    max-width: 100vw;
  }
`

const MainContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  overflow: hidden;

  [navbar-position='top'] & {
    max-width: calc(100vw - 12px);
  }
`

const LeftSidebar = styled.div`
  width: var(--assistants-width, 275px);
  min-width: 200px;
  max-width: 400px;
  border-right: 0.5px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  [navbar-position='left'] & {
    background-color: var(--color-background);
  }
`

const ChatArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-background);
`

const RightPanel = styled.div`
  width: var(--workspace-width, 280px);
  min-width: 200px;
  max-width: 400px;
  border-left: 0.5px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const ChatPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`

const PlaceholderText = styled.div`
  color: var(--color-text-secondary);
  font-size: 14px;
`

const ChatContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
`

const NoEmployeePanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: var(--color-background);
`

const NoEmployeeIcon = styled.div`
  font-size: 64px;
  margin-bottom: 24px;
`

const NoEmployeeTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px 0;
  text-align: center;
`

const NoEmployeeDescription = styled.p`
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
  text-align: center;
  max-width: 400px;
`

const ConfigureButton = styled.button`
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  background: var(--color-primary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }
`

export default SpeedyPage
