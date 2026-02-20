import { Navbar, NavbarMain } from '@renderer/components/app/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { useNavbarPosition } from '@renderer/hooks/useSettings'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTools } from '@renderer/hooks/useTools'
import { Button, Input } from 'antd'
import { Search, SettingsIcon } from 'lucide-react'
import type { FC } from 'react'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import AddCustomToolButton from './AddCustomToolButton'
import ToolsSettingsPopup from './Settings/ToolsSettingsPopup'

const ToolsPage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { builtinTools, customTools } = useTools()
  const { isTopNavbar } = useNavbarPosition()
  const { defaultPaintingProvider } = useSettings()

  // 搜索过滤内置工具
  const filteredBuiltinTools = useMemo(() => {
    if (!search) return builtinTools
    return builtinTools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search.toLowerCase()) ||
        t(tool.nameKey).toLowerCase().includes(search.toLowerCase())
    )
  }, [builtinTools, search, t])

  // 搜索过滤自定义工具
  const filteredCustomTools = useMemo(() => {
    if (!search) return customTools
    return customTools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search.toLowerCase()) || tool.url.toLowerCase().includes(search.toLowerCase())
    )
  }, [customTools, search])

  // 点击内置工具跳转
  const handleBuiltinToolClick = (tool: (typeof builtinTools)[0]) => {
    if (tool.id === 'paintings') {
      navigate(`/paintings/${defaultPaintingProvider}`)
    } else {
      navigate(tool.path)
    }
  }

  // 点击自定义工具打开 webview
  const handleCustomToolClick = (tool: (typeof customTools)[0]) => {
    navigate(`/tools/${tool.id}`)
  }

  // 禁用右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return (
    <Container onContextMenu={handleContextMenu}>
      <Navbar>
        <NavbarMain>
          {t('tools.title')}
          <Input
            placeholder={t('common.search')}
            className="nodrag"
            style={{
              width: '30%',
              height: 28,
              borderRadius: 15
            }}
            size="small"
            variant="filled"
            suffix={<Search size={18} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type="text"
            className="nodrag"
            icon={<SettingsIcon size={18} color="var(--color-text-2)" />}
            onClick={ToolsSettingsPopup.show}
          />
        </NavbarMain>
      </Navbar>
      <ContentContainer id="content-container">
        <MainContainer>
          <RightContainer>
            {isTopNavbar && (
              <HeaderContainer>
                <Input
                  placeholder={t('common.search')}
                  className="nodrag"
                  style={{ width: '30%', borderRadius: 15 }}
                  variant="filled"
                  suffix={<Search size={18} />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button
                  type="text"
                  className="nodrag"
                  icon={<SettingsIcon size={18} color="var(--color-text-2)" />}
                  onClick={() => ToolsSettingsPopup.show()}
                />
              </HeaderContainer>
            )}
            <ToolsContainerWrapper>
              <ToolsGridContainer>
                {/* 内置工具区域 */}
                {filteredBuiltinTools.map((tool) => {
                  const IconComponent = tool.icon
                  return (
                    <ToolIcon key={tool.id} onClick={() => handleBuiltinToolClick(tool)}>
                      <IconWrapper bgColor={tool.bgColor}>
                        <IconComponent size={28} className="icon" />
                      </IconWrapper>
                      <ToolName>{t(tool.nameKey)}</ToolName>
                    </ToolIcon>
                  )
                })}

                {/* 自定义工具区域 */}
                {filteredCustomTools.map((tool) => (
                  <ToolIcon key={tool.id} onClick={() => handleCustomToolClick(tool)}>
                    <CustomToolLogo logo={tool.logo} name={tool.name} />
                    <ToolName>{tool.name}</ToolName>
                  </ToolIcon>
                ))}

                {/* 添加按钮 */}
                <AddCustomToolButton />
              </ToolsGridContainer>
            </ToolsContainerWrapper>
          </RightContainer>
        </MainContainer>
      </ContentContainer>
    </Container>
  )
}

// 自定义工具 Logo 组件
const CustomToolLogo: FC<{ logo?: string; name: string }> = ({ logo, name }) => {
  if (logo) {
    return (
      <IconWrapper bgColor="linear-gradient(135deg, #6366F1, #4F46E5)">
        <LogoImage src={logo} alt={name} />
      </IconWrapper>
    )
  }
  return (
    <IconWrapper bgColor="linear-gradient(135deg, #6366F1, #4F46E5)">
      <DefaultLogoText>{name.charAt(0).toUpperCase()}</DefaultLogoText>
    </IconWrapper>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  height: 100%;
`

const HeaderContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  height: 60px;
  width: 100%;
  gap: 10px;
`

const MainContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  height: calc(100vh - var(--navbar-height));
  width: 100%;
`

const RightContainer = styled(Scrollbar)`
  display: flex;
  flex: 1 1 0%;
  min-width: 0;
  flex-direction: column;
  height: 100%;
  align-items: center;
  height: calc(100vh - var(--navbar-height));
`

const ToolsContainerWrapper = styled(Scrollbar)`
  display: flex;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  padding: 50px 0;
  width: 100%;
  margin-bottom: 20px;
  [navbar-position='top'] & {
    padding: 20px 0;
  }
`

const ToolsGridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 90px);
  grid-auto-rows: min-content;
  grid-auto-flow: column;
  gap: 25px;
  justify-content: center;
`

const ToolIcon = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  transition: transform 0.2s ease, background-color 0.2s ease;

  &:hover {
    transform: scale(1.05);
    background-color: var(--color-background-soft);
  }

  &:active {
    transform: scale(0.95);
  }
`

const IconWrapper = styled.div<{ bgColor: string }>`
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: ${(props) => props.bgColor};
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  .icon {
    color: white;
  }
`

const ToolName = styled.div`
  font-size: 12px;
  color: var(--color-text);
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const LogoImage = styled.img`
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 8px;
`

const DefaultLogoText = styled.span`
  font-size: 24px;
  font-weight: 600;
  color: white;
`

export default ToolsPage
