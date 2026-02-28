import { DownloadOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useModelEmployee } from '@renderer/hooks/useModelEmployee'
import type { EducationLevel, Model, ModelEmployee } from '@renderer/types/modelEmployee'
import { EducationLevel as EL } from '@renderer/types/modelEmployee'
import { Button, Modal } from 'antd'
import { BookOpen, Crown, GraduationCap, Trophy } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingTitle } from '..'
import EducationLevelSection from './EducationLevelSection'
import EmployeeEditModal from './EmployeeEditModal'

// Education level labels with icons and colors
const EDUCATION_LEVEL_CONFIG: Record<EducationLevel, { labelKey: string; icon: ReactNode; color: string }> = {
  [EL.HIGH_SCHOOL]: { labelKey: 'high_school', icon: <GraduationCap size={14} />, color: '#52c41a' },
  [EL.UNDERGRADUATE]: { labelKey: 'undergraduate', icon: <BookOpen size={14} />, color: '#1890ff' },
  [EL.MASTER]: { labelKey: 'master', icon: <Trophy size={14} />, color: '#722ed1' },
  [EL.PHD]: { labelKey: 'phd', icon: <Crown size={14} />, color: '#fa8c16' }
}

const ModelEmployeeSettings: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const {
    employeesByLevel,
    educationLevelOrder,
    exportConfig,
    importConfigData,
    reset,
    createEmployee,
    editEmployee,
    deleteEmployee,
    isNameExists
  } = useModelEmployee()

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<ModelEmployee | null>(null)
  const [defaultEducationLevel, setDefaultEducationLevel] = useState<EducationLevel>(EL.HIGH_SCHOOL)

  // Open modal for creating new employee
  const handleAddEmployee = (level: EducationLevel) => {
    setEditingEmployee(null)
    setDefaultEducationLevel(level)
    setEditModalOpen(true)
  }

  // Open modal for editing existing employee
  const handleEditEmployee = (employee: ModelEmployee) => {
    setEditingEmployee(employee)
    setEditModalOpen(true)
  }

  // Handle delete employee
  const handleDeleteEmployee = (employee: ModelEmployee) => {
    Modal.confirm({
      title: t('settings.model_employee.employee.delete'),
      content: t('settings.model_employee.employee.delete_confirm', { name: employee.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      centered: true,
      onOk() {
        deleteEmployee(employee.id)
      }
    })
  }

  // Handle save employee (create or update)
  const handleSaveEmployee = (
    name: string,
    description: string,
    soul: string | undefined,
    model: Model,
    educationLevel: EducationLevel
  ) => {
    if (editingEmployee) {
      // Update existing
      const success = editEmployee(editingEmployee.id, { name, description, soul, model, educationLevel })
      if (!success) {
        window.toast.error(t('settings.model_employee.employee.name_duplicate'))
        return false
      }
    } else {
      // Create new
      const success = createEmployee(name, description, soul, model, educationLevel)
      if (!success) {
        window.toast.error(t('settings.model_employee.employee.name_duplicate'))
        return false
      }
    }
    setEditModalOpen(false)
    return true
  }

  // Handle export
  const handleExport = async () => {
    const data = exportConfig()
    const json = JSON.stringify(data, null, 2)
    const fileName = `model-employee-config-${Date.now()}.json`

    await window.api.file.save(fileName, json, {
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    window.toast.success(t('settings.model_employee.export.success'))
  }

  // Handle import
  const handleImport = async () => {
    const selected = await window.api.file.select({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (selected && selected.length > 0) {
      try {
        const content = await window.api.fs.readText(selected[0].path)
        const data = JSON.parse(content)

        // Validate required fields
        if (!data.employees || !Array.isArray(data.employees)) {
          throw new Error('Invalid format: missing employees array')
        }
        if (!data.educationLevelOrder || !Array.isArray(data.educationLevelOrder)) {
          throw new Error('Invalid format: missing educationLevelOrder array')
        }

        importConfigData(data)
        window.toast.success(t('settings.model_employee.import.success'))
      } catch (error) {
        console.error('Import error:', error)
        window.toast.error(t('settings.model_employee.import.error'))
      }
    }
  }

  // Handle reset
  const handleReset = () => {
    Modal.confirm({
      title: t('settings.model_employee.reset'),
      content: t('settings.model_employee.reset_confirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      centered: true,
      okButtonProps: { danger: true },
      onOk() {
        reset()
      }
    })
  }

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>
          <span>{t('settings.model_employee.title')}</span>
          <HStack gap={8}>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
              {t('settings.model_employee.export.button')}
            </Button>
            <Button size="small" icon={<UploadOutlined />} onClick={handleImport}>
              {t('settings.model_employee.import.button')}
            </Button>
            <Button size="small" danger icon={<ReloadOutlined />} onClick={handleReset}>
              {t('settings.model_employee.reset')}
            </Button>
          </HStack>
        </SettingTitle>
        <SettingDivider />
        <SettingDescription>{t('settings.model_employee.description')}</SettingDescription>
      </SettingGroup>

      {educationLevelOrder.map((level) => {
        const config = EDUCATION_LEVEL_CONFIG[level]
        const employees = employeesByLevel[level]

        return (
          <EducationLevelSection
            key={level}
            level={level}
            icon={config.icon}
            color={config.color}
            label={t(`settings.model_employee.education_level.${config.labelKey}`)}
            employees={employees}
            onAddEmployee={() => handleAddEmployee(level)}
            onEditEmployee={handleEditEmployee}
            onDeleteEmployee={handleDeleteEmployee}
          />
        )
      })}

      <EmployeeEditModal
        open={editModalOpen}
        employee={editingEmployee}
        defaultEducationLevel={defaultEducationLevel}
        isNameExists={isNameExists}
        onSave={handleSaveEmployee}
        onClose={() => setEditModalOpen(false)}
      />
    </SettingContainer>
  )
}

const SettingDescription = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
`

export default ModelEmployeeSettings
