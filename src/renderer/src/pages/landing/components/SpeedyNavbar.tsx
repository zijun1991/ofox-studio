/**
 * SpeedyNavbar - Chat area navbar for Speedy Mode
 *
 * Replaces the breadcrumb navigation in Expert Mode's ChatNavbar
 * with a Model Employee selector.
 *
 * Uses NavbarHeader container to match Expert Mode's ChatNavbar layout.
 */
import { loggerService } from '@logger'
import { HStack } from '@renderer/components/Layout'
import NavbarIcon from '@renderer/components/NavbarIcon'
import { ReasoningTag, ToolsCallingTag, VisionTag, WebSearchTag } from '@renderer/components/Tags/Model'
import { useAgentClient } from '@renderer/hooks/agents/useAgentClient'
import { useUpdateSession } from '@renderer/hooks/agents/useUpdateSession'
import { useModelEmployee } from '@renderer/hooks/useModelEmployee'
import type { ModelType } from '@renderer/types/index'
import type { EducationLevel, ModelEmployee } from '@renderer/types/modelEmployee'
import { Select, Tooltip } from 'antd'
import { BookOpen, Crown, FolderOpen, GraduationCap, Trophy } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styled, { createGlobalStyle } from 'styled-components'

const logger = loggerService.withContext('SpeedyNavbar')

interface SpeedyNavbarProps {
  selectedEmployeeId: string | null
  onEmployeeChange: (employeeId: string) => void
  agentId: string
  activeSessionId?: string
  onToggleWorkspace?: () => void
}

const EDUCATION_LEVEL_CONFIG: Record<EducationLevel, { labelKey: string; icon: ReactNode }> = {
  high_school: { labelKey: 'modelEmployee.educationLevel.high_school', icon: <GraduationCap size={14} /> },
  undergraduate: { labelKey: 'modelEmployee.educationLevel.undergraduate', icon: <BookOpen size={14} /> },
  master: { labelKey: 'modelEmployee.educationLevel.master', icon: <Trophy size={14} /> },
  phd: { labelKey: 'modelEmployee.educationLevel.phd', icon: <Crown size={14} /> }
}

/**
 * 渲染能力标签
 * @param type 能力类型
 * @param size 标签大小
 * @param showLabel 是否显示文字标签
 */
const renderCapabilityTag = (type: ModelType, size: number = 10, showLabel: boolean = false) => {
  switch (type) {
    case 'vision':
      return <VisionTag key={type} size={size} showTooltip={false} showLabel={showLabel} />
    case 'reasoning':
      return <ReasoningTag key={type} size={size} showTooltip={false} showLabel={showLabel} />
    case 'function_calling':
      return <ToolsCallingTag key={type} size={size} showTooltip={false} showLabel={showLabel} />
    case 'web_search':
      return <WebSearchTag key={type} size={size} showTooltip={false} showLabel={showLabel} />
    default:
      return null
  }
}

/**
 * 渲染员工能力标签行
 * @param employee 员工对象
 * @param size 标签大小
 * @param showLabel 是否显示文字标签
 */
const renderEmployeeCapabilityTags = (employee: ModelEmployee, size: number = 10, showLabel: boolean = false) => {
  if (!employee.model.capabilities || employee.model.capabilities.length === 0) {
    return null
  }
  return (
    <CapabilityTagsRow>
      {employee.model.capabilities.map((cap) => renderCapabilityTag(cap.type, size, showLabel))}
    </CapabilityTagsRow>
  )
}

const SpeedyNavbar: FC<SpeedyNavbarProps> = ({
  selectedEmployeeId,
  onEmployeeChange,
  agentId,
  activeSessionId,
  onToggleWorkspace
}) => {
  const { t } = useTranslation()
  const { employeesByLevel, educationLevelOrder, getEmployeeById } = useModelEmployee()
  const client = useAgentClient()
  const { updateModel } = useUpdateSession(agentId)

  // Get selected employee for display
  const selectedEmployee = selectedEmployeeId ? getEmployeeById(selectedEmployeeId) : null

  // Build select options grouped by education level
  const selectOptions = educationLevelOrder.map((level) => {
    const config = EDUCATION_LEVEL_CONFIG[level]
    const levelEmployees = employeesByLevel[level] || []
    return {
      label: (
        <LevelLabel>
          <LevelIcon>{config.icon}</LevelIcon>
          <LevelName>{t(config.labelKey)}</LevelName>
        </LevelLabel>
      ),
      options: levelEmployees.map((emp) => ({
        label: (
          <EmployeeOption>
            <EmployeeName>{emp.name}</EmployeeName>
            {emp.description && <EmployeeDescription>{emp.description}</EmployeeDescription>}
            {emp.model.capabilities && emp.model.capabilities.length > 0 && (
              <CapabilityTagsRow>
                {emp.model.capabilities.map((cap) => renderCapabilityTag(cap.type, 10, true))}
              </CapabilityTagsRow>
            )}
          </EmployeeOption>
        ),
        value: emp.id
      }))
    }
  })

  // Custom render for selected value
  const renderSelectedValue = () => {
    if (!selectedEmployee) {
      return <SelectedValue>{t('speedy.select_employee')}</SelectedValue>
    }

    const levelConfig = EDUCATION_LEVEL_CONFIG[selectedEmployee.educationLevel]
    const levelLabel = t(levelConfig.labelKey)

    return (
      <SelectedValue>
        <SelectedType>{levelLabel}</SelectedType>
        <SelectedDivider>|</SelectedDivider>
        <SelectedEmployeeName>{selectedEmployee.name}</SelectedEmployeeName>
        <SelectedDivider>|</SelectedDivider>
        {renderEmployeeCapabilityTags(selectedEmployee, 10, true)}
      </SelectedValue>
    )
  }

  const handleEmployeeSelectChange = useCallback(
    async (value: unknown) => {
      if (typeof value === 'string') {
        const employee = getEmployeeById(value)
        if (employee && employee.model) {
          try {
            const modelId = `${employee.model.provider}:${employee.model.id}`

            // 更新 Agent 的 model
            await client.updateAgent({ id: agentId, model: modelId })
            logger.info(`Updated Agent model to: ${modelId}`)

            // 使用 useUpdateSession 的 updateModel 更新 Session（会触发 SWR 缓存更新）
            if (activeSessionId) {
              await updateModel(activeSessionId, modelId, { showSuccessToast: false })
              logger.info(`Updated Session model to: ${modelId}`)
            }
          } catch (error) {
            logger.error('Failed to update model:', error as Error)
            window.toast.error(t('common.error'))
            return
          }
        }
        onEmployeeChange(value)
      }
    },
    [agentId, activeSessionId, client, getEmployeeById, onEmployeeChange, t, updateModel]
  )

  return (
    <TopBarContainer>
      <EmployeeDropdownStyle />
      <div className="left-content">
        <EmployeeSelector
          value={selectedEmployeeId}
          onChange={handleEmployeeSelectChange}
          options={selectOptions}
          placeholder={t('speedy.select_employee')}
          popupMatchSelectWidth={320}
          labelRender={renderSelectedValue}
          className="no-drag"
          popupClassName="speedy-employee-dropdown"
          style={{
            position: 'relative',
            top: '-2px'
          }}
        />
      </div>
      <HStack className="right-content" alignItems="center" justifyContent="flex-end" gap={8}>
        <Tooltip title={t('speedy.workspace')} mouseEnterDelay={0.8}>
          <NavbarIcon className="no-drag" onClick={onToggleWorkspace}>
            <FolderOpen size={18} />
          </NavbarIcon>
        </Tooltip>
      </HStack>
    </TopBarContainer>
  )
}

const TopBarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 16px;
  -webkit-app-region: drag;
  background: transparent;
  position: relative;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

  .left-content {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .right-content {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .no-drag {
    -webkit-app-region: no-drag;
  }
`

const EmployeeSelector = styled(Select)`
  position: relative;

  .ant-select-selector {
    background: var(--color-background-soft) !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 4px 12px !important;
    height: 36px !important;
  }

  .ant-select-selection-item {
    color: var(--color-text);
    display: flex;
    align-items: center;
  }

  .ant-select-arrow {
    color: var(--color-text-secondary);
    top: 18px;
  }
`

const LevelLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
`

const LevelIcon = styled.span`
  display: inline-flex;
  align-items: center;
`

const LevelName = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
`

const EmployeeOption = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const EmployeeName = styled.span`
  font-size: 13px;
  color: var(--color-text);
`

const EmployeeDescription = styled.span`
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const CapabilityTagsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`

const SelectedValue = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const SelectedType = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--speedy-brand, #B07353) 0%, var(--speedy-brand-dark, #956044) 100%);
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  height: 18px;
  line-height: 1;
`

const SelectedDivider = styled.span`
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0 2px;
`

const SelectedEmployeeName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  flex-shrink: 0;
`

const EmployeeDropdownStyle = createGlobalStyle`
  .speedy-employee-dropdown {
    .ant-select-group {
      padding: 8px 12px 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    .ant-select-item-option {
      border-radius: 6px;
      margin: 2px 4px;
      padding: 8px;
    }

    .ant-select-item-option-grouped {
      padding-left: 8px;
    }
  }
`

export default SpeedyNavbar
