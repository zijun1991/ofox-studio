/**
 * 背景编辑器组件
 * 支持纯色、渐变、图片三种背景类型
 */
import { HStack } from '@renderer/components/Layout'
import type { BackgroundConfig, GradientDirection } from '@renderer/types/skin'
import { BACKGROUND_TYPE_OPTIONS, GRADIENT_DIRECTION_OPTIONS } from '@renderer/types/skin'
import type { UploadProps } from 'antd'
import { Button, ColorPicker, Radio, Slider, Upload } from 'antd'
import { Minus, Plus, Upload as UploadIcon } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const PreviewBox = styled.div<{ $background?: string }>`
  width: 100%;
  height: 60px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: ${(props) => props.$background || 'var(--color-background)'};
  margin-top: 8px;
`

const ColorItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`

interface BackgroundEditorProps {
  value?: BackgroundConfig
  onChange: (config: BackgroundConfig | undefined) => void
}

const BackgroundEditor: FC<BackgroundEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const [type, setType] = useState<BackgroundConfig['type']>(value?.type || 'solid')
  const [color, setColor] = useState<string>(value?.color || '#ffffff')
  const [gradientColors, setGradientColors] = useState<string[]>(value?.gradient?.colors || ['#667eea', '#764ba2'])
  const [gradientDirection, setGradientDirection] = useState<GradientDirection>(
    value?.gradient?.direction || 'to-bottom'
  )
  const [imageUrl, setImageUrl] = useState<string>(value?.image?.url || '')
  const [imageBlur, setImageBlur] = useState<number>(value?.image?.blur || 0)
  const [imageOpacity, setImageOpacity] = useState<number>(value?.image?.opacity ?? 1)
  const [imageSize, setImageSize] = useState<'cover' | 'contain' | 'auto'>(value?.image?.size || 'cover')

  // 生成预览背景
  const previewBackground = useMemo(() => {
    switch (type) {
      case 'solid':
        return color
      case 'gradient':
        const dir = {
          'to-right': 'to right',
          'to-bottom': 'to bottom',
          'to-bottom-right': 'to bottom right',
          radial: 'circle at center'
        }[gradientDirection]
        return gradientDirection === 'radial'
          ? `radial-gradient(${dir}, ${gradientColors.join(', ')})`
          : `linear-gradient(${dir}, ${gradientColors.join(', ')})`
      case 'image':
        return imageUrl ? `url(${imageUrl})` : undefined
      default:
        return undefined
    }
  }, [type, color, gradientColors, gradientDirection, imageUrl])

  // 更新配置
  const updateConfig = useCallback(() => {
    switch (type) {
      case 'solid':
        onChange({ type: 'solid', color })
        break
      case 'gradient':
        onChange({
          type: 'gradient',
          gradient: { colors: gradientColors, direction: gradientDirection }
        })
        break
      case 'image':
        if (imageUrl) {
          onChange({
            type: 'image',
            image: { url: imageUrl, blur: imageBlur, opacity: imageOpacity, size: imageSize }
          })
        }
        break
    }
  }, [type, color, gradientColors, gradientDirection, imageUrl, imageBlur, imageOpacity, imageSize, onChange])

  // 类型变更
  const handleTypeChange = (newType: BackgroundConfig['type']) => {
    setType(newType)
    setTimeout(updateConfig, 0)
  }

  // 添加渐变色
  const addGradientColor = () => {
    if (gradientColors.length < 5) {
      setGradientColors([...gradientColors, '#ffffff'])
    }
  }

  // 删除渐变色
  const removeGradientColor = (index: number) => {
    if (gradientColors.length > 2) {
      const newColors = gradientColors.filter((_, i) => i !== index)
      setGradientColors(newColors)
    }
  }

  // 更新渐变色
  const updateGradientColor = (index: number, newColor: string) => {
    const newColors = [...gradientColors]
    newColors[index] = newColor
    setGradientColors(newColors)
  }

  // 图片上传处理
  const uploadProps: UploadProps = {
    accept: 'image/*',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setImageUrl(base64)
      }
      reader.readAsDataURL(file)
      return false
    }
  }

  // 渲染纯色编辑器
  const renderSolidEditor = () => (
    <div style={{ marginTop: 12 }}>
      <HStack gap="8px" alignItems="center">
        <span>{t('settings.skin.background.color')}:</span>
        <ColorPicker value={color} onChange={(c) => setColor(c.toHexString())} showText size="small" />
      </HStack>
    </div>
  )

  // 渲染渐变编辑器
  const renderGradientEditor = () => (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ marginRight: 8 }}>{t('settings.skin.background.direction')}:</span>
        <Radio.Group
          value={gradientDirection}
          onChange={(e) => setGradientDirection(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small">
          {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
            <Radio.Button key={opt.value} value={opt.value}>
              {opt.icon} {t(`settings.skin.background.directions.${opt.value}`)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>
      <div>
        <span>{t('settings.skin.background.colors')}:</span>
        {gradientColors.map((c, index) => (
          <ColorItem key={index}>
            <ColorPicker
              value={c}
              onChange={(color) => updateGradientColor(index, color.toHexString())}
              showText
              size="small"
            />
            {gradientColors.length > 2 && (
              <Button icon={<Minus size={14} />} size="small" onClick={() => removeGradientColor(index)} />
            )}
          </ColorItem>
        ))}
        {gradientColors.length < 5 && (
          <Button icon={<Plus size={14} />} size="small" onClick={addGradientColor}>
            {t('settings.skin.background.addColor')}
          </Button>
        )}
      </div>
    </div>
  )

  // 渲染图片编辑器
  const renderImageEditor = () => (
    <div style={{ marginTop: 12 }}>
      <Upload {...uploadProps}>
        <Button icon={<UploadIcon size={14} />}>{t('settings.skin.background.selectImage')}</Button>
      </Upload>
      {imageUrl && (
        <>
          <div style={{ marginTop: 12 }}>
            <span>{t('settings.skin.background.blur')}: </span>
            <Slider
              value={imageBlur}
              onChange={setImageBlur}
              min={0}
              max={20}
              style={{ width: 200, display: 'inline-block' }}
            />
            <span> {imageBlur}px</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span>{t('settings.skin.background.opacity')}: </span>
            <Slider
              value={imageOpacity * 100}
              onChange={(v) => setImageOpacity(v / 100)}
              min={0}
              max={100}
              style={{ width: 200, display: 'inline-block' }}
            />
            <span> {Math.round(imageOpacity * 100)}%</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span>{t('settings.skin.background.size')}: </span>
            <Radio.Group
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small">
              <Radio.Button value="cover">{t('settings.skin.background.sizeCover')}</Radio.Button>
              <Radio.Button value="contain">{t('settings.skin.background.sizeContain')}</Radio.Button>
              <Radio.Button value="auto">{t('settings.skin.background.sizeAuto')}</Radio.Button>
            </Radio.Group>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div>
      {/* 类型选择 */}
      <Radio.Group
        value={type}
        onChange={(e) => handleTypeChange(e.target.value)}
        optionType="button"
        buttonStyle="solid">
        {BACKGROUND_TYPE_OPTIONS.map((opt) => (
          <Radio.Button key={opt.value} value={opt.value}>
            {t(`settings.skin.background.types.${opt.value}`)}
          </Radio.Button>
        ))}
      </Radio.Group>

      {/* 根据类型渲染编辑器 */}
      {type === 'solid' && renderSolidEditor()}
      {type === 'gradient' && renderGradientEditor()}
      {type === 'image' && renderImageEditor()}

      {/* 预览 */}
      <PreviewBox $background={previewBackground} />
    </div>
  )
}

export default BackgroundEditor
