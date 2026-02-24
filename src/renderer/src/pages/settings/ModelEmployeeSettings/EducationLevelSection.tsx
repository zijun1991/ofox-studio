import { PlusOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { useTheme } from '@renderer/context/ThemeProvider'
import type { EducationLevel, ModelEmployee } from '@renderer/types/modelEmployee'
import { Button, Empty, Tag } from 'antd'
import type { FC } from 'react'
import { useState } from 'react'
import styled from 'styled-components'

import { SettingDivider, SettingGroup, SettingRow, SettingTitle } from '..'
import EmployeeCard from './EmployeeCard'

interface EducationLevelSectionProps {
  level: EducationLevel
  icon: string
  color: string
  label: string
  employees: ModelEmployee[]
  onAddEmployee: () => void
  onEditEmployee: (employee: ModelEmployee) => void
  onDeleteEmployee: (employee: ModelEmployee) => void
}

const EducationLevelSection: FC<EducationLevelSectionProps> = ({
  icon,
  color,
  label,
  employees,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee
}) => {
  const { theme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <SettingGroup theme={theme}>
      <SettingRow style={{ cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
        <HStack gap={8} alignItems="center">
          <span>{icon}</span>
          <SettingTitle style={{ fontWeight: 'normal' }}>{label}</SettingTitle>
          <Tag color={color}>{employees.length}</Tag>
        </HStack>
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            onAddEmployee()
          }}
        />
      </SettingRow>

      {!collapsed && (
        <>
          <SettingDivider />
          {employees.length === 0 ? (
            <EmptyContainer>
              <Empty description="暂无员工" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </EmptyContainer>
          ) : (
            <EmployeeList>
              {employees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  onEdit={() => onEditEmployee(employee)}
                  onDelete={() => onDeleteEmployee(employee)}
                />
              ))}
            </EmployeeList>
          )}
        </>
      )}
    </SettingGroup>
  )
}

const EmptyContainer = styled.div`
  padding: 20px 0;
`

const EmployeeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export default EducationLevelSection
