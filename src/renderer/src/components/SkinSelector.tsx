/**
 * 皮肤选择器组件
 */
import { HStack } from '@renderer/components/Layout'
import { BUILT_IN_SKINS, DEFAULT_SKIN_ID } from '@renderer/config/skinPresets'
import useUserTheme from '@renderer/hooks/useUserTheme'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { UserTheme } from '@renderer/store/settings'
import { addCustomSkin, deleteCustomSkin } from '@renderer/store/skins'
import type { SkinExportFormat, SkinPreset } from '@renderer/types/skin'
import { Button, Modal, Popconfirm, Tooltip } from 'antd'
import { Check, Download, Plus, Trash, Upload } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import BackgroundEditor from './BackgroundEditor'

const SkinGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
`

const SkinCard = styled.div<{ $isActive?: boolean; $background?: string }>`
  width: 72px;
  height: 72px;
  border-radius: 12px;
  cursor: pointer;
  border: 2px solid ${(props) => (props.$isActive ? 'var(--color-primary)' : 'transparent')};
  background: ${(props) => props.$background || 'var(--color-background)'};
  position: relative;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: var(--color-primary);
    opacity: 0.9;
  }
`

const SkinName = styled.div`
  font-size: 11px;
  color: var(--color-text);
  text-align: center;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 72px;
`

const CheckIcon = styled.div`
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`

const DeleteButton = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  display: none;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;

  ${SkinCard}:hover & {
    display: flex;
  }
`

interface SkinSelectorProps {
  onSelectSkin?: (skin: SkinPreset) => void
}

const SkinSelector: FC<SkinSelectorProps> = ({ onSelectSkin }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { userTheme, setUserTheme } = useUserTheme()
  const customSkins = useAppSelector((state) => state.skins.customSkins)

  const [customModalOpen, setCustomModalOpen] = useState(false)
  const [customSkinName, setCustomSkinName] = useState('')
  const [customPrimaryColor, setCustomPrimaryColor] = useState(userTheme.colorPrimary)
  const [customBackground, setCustomBackground] = useState(userTheme.background)

  // 所有可用皮肤
  const allSkins = useMemo(() => [...BUILT_IN_SKINS, ...customSkins], [customSkins])

  // 当前激活的皮肤 ID
  const activeSkinId = userTheme.activeSkinId || DEFAULT_SKIN_ID

  // 生成皮肤预览背景
  const getSkinBackground = (skin: SkinPreset): string | undefined => {
    if (!skin.background) {
      return skin.colorPrimary
    }
    switch (skin.background.type) {
      case 'solid':
        return skin.background.color
      case 'gradient':
        const dir = {
          'to-right': 'to right',
          'to-bottom': 'to bottom',
          'to-bottom-right': 'to bottom right',
          radial: 'circle at center'
        }[skin.background.gradient?.direction || 'to-bottom']
        return skin.background.gradient?.direction === 'radial'
          ? `radial-gradient(${dir}, ${skin.background.gradient?.colors.join(', ')})`
          : `linear-gradient(${dir}, ${skin.background.gradient?.colors.join(', ')})`
      case 'image':
        return skin.background.image?.url ? `url(${skin.background.image.url})` : skin.colorPrimary
      default:
        return skin.colorPrimary
    }
  }

  // 选择皮肤
  const handleSelectSkin = useCallback(
    (skin: SkinPreset) => {
      const newTheme: UserTheme = {
        ...userTheme,
        colorPrimary: skin.colorPrimary,
        background: skin.background,
        sidebarBackground: skin.sidebarBackground,
        cardBackground: skin.cardBackground,
        userFontFamily: skin.userFontFamily || userTheme.userFontFamily,
        userCodeFontFamily: skin.userCodeFontFamily || userTheme.userCodeFontFamily,
        activeSkinId: skin.id
      }
      setUserTheme(newTheme)
      onSelectSkin?.(skin)
    },
    [userTheme, setUserTheme, onSelectSkin]
  )

  // 保存自定义皮肤
  const handleSaveCustomSkin = useCallback(() => {
    if (!customSkinName.trim()) return

    const newSkin: Omit<SkinPreset, 'id'> = {
      name: customSkinName.trim(),
      colorPrimary: customPrimaryColor,
      background: customBackground,
      isBuiltIn: false
    }

    dispatch(addCustomSkin(newSkin))
    setCustomModalOpen(false)
    setCustomSkinName('')
  }, [customSkinName, customPrimaryColor, customBackground, dispatch])

  // 删除自定义皮肤
  const handleDeleteSkin = useCallback(
    (skinId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      dispatch(deleteCustomSkin(skinId))
    },
    [dispatch]
  )

  // 导出皮肤
  const handleExportSkin = useCallback(() => {
    const currentSkin = allSkins.find((s) => s.id === activeSkinId) || allSkins[0]
    const exportData: SkinExportFormat = {
      version: '1.0',
      type: 'ofox-skin',
      skin: {
        name: currentSkin.name,
        colorPrimary: currentSkin.colorPrimary,
        background: currentSkin.background,
        sidebarBackground: currentSkin.sidebarBackground,
        cardBackground: currentSkin.cardBackground
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentSkin.name}.ofox-skin.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [allSkins, activeSkinId])

  // 导入皮肤
  const handleImportSkin = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.ofox-skin.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text) as SkinExportFormat

        if (data.type !== 'ofox-skin') {
          throw new Error('Invalid skin file')
        }

        dispatch(
          addCustomSkin({
            name: data.skin.name,
            colorPrimary: data.skin.colorPrimary,
            background: data.skin.background,
            sidebarBackground: data.skin.sidebarBackground,
            cardBackground: data.skin.cardBackground,
            userFontFamily: data.skin.userFontFamily,
            userCodeFontFamily: data.skin.userCodeFontFamily
          })
        )
      } catch (error) {
        console.error('Failed to import skin:', error)
      }
    }
    input.click()
  }, [dispatch])

  return (
    <div>
      <SkinGrid>
        {allSkins.map((skin) => (
          <Tooltip key={skin.id} title={skin.name}>
            <div>
              <SkinCard
                $isActive={activeSkinId === skin.id}
                $background={getSkinBackground(skin)}
                onClick={() => handleSelectSkin(skin)}>
                {activeSkinId === skin.id && (
                  <CheckIcon>
                    <Check size={12} />
                  </CheckIcon>
                )}
                {!skin.isBuiltIn && (
                  <Popconfirm
                    title={t('settings.skin.deleteConfirm')}
                    onConfirm={(e) => handleDeleteSkin(skin.id, e as unknown as React.MouseEvent)}
                    onCancel={(e) => e?.stopPropagation()}>
                    <DeleteButton onClick={(e) => e.stopPropagation()}>
                      <Trash size={10} />
                    </DeleteButton>
                  </Popconfirm>
                )}
              </SkinCard>
              <SkinName>{skin.name}</SkinName>
            </div>
          </Tooltip>
        ))}

        {/* 添加自定义皮肤按钮 */}
        <Tooltip title={t('settings.skin.addCustom')}>
          <div>
            <SkinCard onClick={() => setCustomModalOpen(true)}>
              <Plus size={24} />
            </SkinCard>
            <SkinName>{t('settings.skin.addCustom')}</SkinName>
          </div>
        </Tooltip>
      </SkinGrid>

      {/* 导入/导出按钮 */}
      <HStack gap="8px">
        <Button icon={<Upload size={14} />} onClick={handleImportSkin}>
          {t('settings.skin.import')}
        </Button>
        <Button icon={<Download size={14} />} onClick={handleExportSkin}>
          {t('settings.skin.export')}
        </Button>
      </HStack>

      {/* 自定义皮肤弹窗 */}
      <Modal
        title={t('settings.skin.customTitle')}
        open={customModalOpen}
        onOk={handleSaveCustomSkin}
        onCancel={() => setCustomModalOpen(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>{t('settings.skin.name')}</label>
          <input
            type="text"
            value={customSkinName}
            onChange={(e) => setCustomSkinName(e.target.value)}
            placeholder={t('settings.skin.namePlaceholder')}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>{t('settings.skin.primaryColor')}</label>
          <HStack gap="8px" alignItems="center">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: customPrimaryColor,
                border: '1px solid var(--color-border)'
              }}
            />
            <input
              type="text"
              value={customPrimaryColor}
              onChange={(e) => setCustomPrimaryColor(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)' }}
            />
          </HStack>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8 }}>{t('settings.skin.background.title')}</label>
          <BackgroundEditor value={customBackground} onChange={setCustomBackground} />
        </div>
      </Modal>
    </div>
  )
}

export default SkinSelector
