import { PlusOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { Sortable, useDndReorder } from '@renderer/components/dnd'
import HorizontalScrollContainer from '@renderer/components/HorizontalScrollContainer'
import { isLinux, isMac } from '@renderer/config/constant'
import { allMinApps } from '@renderer/config/minapps'
import { useFullscreen } from '@renderer/hooks/useFullscreen'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTools } from '@renderer/hooks/useTools'
import { getTitleLabel } from '@renderer/i18n/label'
import UpdateAppButton from '@renderer/pages/home/components/UpdateAppButton'
import NavigationService from '@renderer/services/NavigationService'
import tabsService from '@renderer/services/TabsService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { Tab } from '@renderer/store/tabs'
import { addTab, removeTab, setActiveTab, setTabs } from '@renderer/store/tabs'
import type { MinAppType } from '@renderer/types'
import type { CustomTool } from '@renderer/types'
import { classNames } from '@renderer/utils'
import { Tooltip } from 'antd'
import type { LRUCache } from 'lru-cache'
import {
  Brain,
  Clock,
  FileSearch,
  Folder,
  Globe,
  Home,
  Languages,
  LayoutGrid,
  MessageSquare,
  NotepadText,
  Palette,
  Radio,
  Settings,
  Sparkle,
  Terminal,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import MinAppIcon from '../Icons/MinAppIcon'
import { OpenClawIcon } from '../Icons/SVGIcon'
import MinAppTabsPool from '../MinApp/MinAppTabsPool'
import WindowControls from '../WindowControls'

interface TabsContainerProps {
  children: React.ReactNode
}

const logger = loggerService.withContext('TabContainer')

const getTabIcon = (
  tabId: string,
  minapps: MinAppType[],
  minAppsCache?: LRUCache<string, MinAppType>,
  customTools?: CustomTool[]
): React.ReactNode | undefined => {
  // Check if it's a minapp tab (format: apps:appId)
  if (tabId.startsWith('apps:')) {
    const appId = tabId.replace('apps:', '')
    let app = [...allMinApps, ...minapps].find((app) => app.id === appId)

    // If not found in permanent apps, search in temporary apps cache
    // The cache stores apps opened via openSmartMinapp() for top navbar mode
    // These are temporary MinApps that were opened but not yet saved to user's config
    // The cache is LRU (Least Recently Used) with max size from settings
    // Cache validity: Apps in cache are currently active/recently used, not outdated
    if (!app && minAppsCache) {
      app = minAppsCache.get(appId)

      // Defensive programming: If app not found in cache but tab exists,
      // the cache entry may have been evicted due to LRU policy
      // Log warning for debugging potential sync issues
      if (!app) {
        logger.warn(`MinApp ${appId} not found in cache, using fallback icon`)
      }
    }

    if (app) {
      return <MinAppIcon size={14} app={app} />
    }

    // Fallback: If no app found (cache evicted), show default icon
    return <LayoutGrid size={14} />
  }

  // Check if it's a custom tool tab (format: tools:toolId)
  if (tabId.startsWith('tools:')) {
    const toolId = tabId.replace('tools:', '')
    const tool = customTools?.find((t) => t.id === toolId)
    if (tool?.logo) {
      return <img src={tool.logo} alt={tool.name} style={{ width: 14, height: 14, borderRadius: 4 }} />
    }
    return <LayoutGrid size={14} />
  }

  switch (tabId) {
    case 'home':
      return <Home size={14} />
    case 'expert':
      return <Brain size={14} />
    case 'store':
      return <Sparkle size={14} />
    case 'translate':
      return <Languages size={14} />
    case 'paintings':
      return <Palette size={14} />
    case 'apps':
      return <LayoutGrid size={14} />
    case 'notes':
      return <NotepadText size={14} />
    case 'knowledge':
      return <FileSearch size={14} />
    case 'files':
      return <Folder size={14} />
    case 'settings':
      return <Settings size={14} />
    case 'code':
      return <Terminal size={14} />
    case 'scheduler':
      return <Clock size={14} />
    case 'channels':
      return <MessageSquare size={14} />
    case 'openclaw':
      return <OpenClawIcon style={{ width: 14, height: 14 }} />
    default:
      return null
  }
}

let lastSettingsPath = '/settings/provider'
const specialTabs = ['launchpad', 'settings', 'home', 'scheduler', 'channels']

const TabsContainer: React.FC<TabsContainerProps> = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  // Ensure NavigationService has the navigate function for TabsService.closeTab
  useEffect(() => {
    NavigationService.setNavigate(navigate)
  }, [navigate])
  const tabs = useAppSelector((state) => state.tabs.tabs)
  const activeTabId = useAppSelector((state) => state.tabs.activeTabId)
  const isFullscreen = useFullscreen()
  const { hideMinappPopup, minAppsCache } = useMinappPopup()
  const { minapps } = useMinapps()
  const { customTools } = useTools()
  const { useSystemTitleBar } = useSettings()
  const { t } = useTranslation()

  const getTabId = (path: string): string => {
    if (path === '/') return 'home'
    const segments = path.split('/')
    // Handle minapp paths: /apps/appId -> apps:appId
    if (segments[1] === 'apps' && segments[2]) {
      return `apps:${segments[2]}`
    }
    // Handle custom tool paths: /tools/toolId -> tools:toolId
    if (segments[1] === 'tools' && segments[2]) {
      return `tools:${segments[2]}`
    }
    return segments[1] // 获取第一个路径段作为 id
  }

  const getTabTitle = (tabId: string): string => {
    // Check if it's a minapp tab
    if (tabId.startsWith('apps:')) {
      const appId = tabId.replace('apps:', '')
      let app = [...allMinApps, ...minapps].find((app) => app.id === appId)

      // If not found in permanent apps, search in temporary apps cache
      // This ensures temporary MinApps display proper titles while being used
      // The LRU cache automatically manages app lifecycle and prevents memory leaks
      if (!app && minAppsCache) {
        app = minAppsCache.get(appId)

        // Defensive programming: If app not found in cache but tab exists,
        // the cache entry may have been evicted due to LRU policy
        if (!app) {
          logger.warn(`MinApp ${appId} not found in cache, using fallback title`)
        }
      }

      // Return app name if found, otherwise use fallback with appId
      return app ? app.name : `MinApp-${appId}`
    }

    // Check if it's a custom tool tab
    if (tabId.startsWith('tools:')) {
      const toolId = tabId.replace('tools:', '')
      const tool = customTools.find((t) => t.id === toolId)
      return tool ? tool.name : `Tool-${toolId}`
    }

    return getTitleLabel(tabId)
  }

  const shouldCreateTab = (path: string) => {
    if (path === '/') return false
    if (path === '/settings') return false
    return !tabs.some((tab) => tab.id === getTabId(path))
  }

  const removeSpecialTabs = useCallback(() => {
    specialTabs.forEach((tabId) => {
      if (activeTabId !== tabId) {
        dispatch(removeTab(tabId))
      }
    })
  }, [activeTabId, dispatch])

  useEffect(() => {
    const tabId = getTabId(location.pathname)
    const currentTab = tabs.find((tab) => tab.id === tabId)

    if (!currentTab && shouldCreateTab(location.pathname)) {
      dispatch(addTab({ id: tabId, path: location.pathname }))
    } else if (currentTab) {
      dispatch(setActiveTab(currentTab.id))
    }

    // 当访问设置页面时，记录路径
    if (location.pathname.startsWith('/settings/')) {
      lastSettingsPath = location.pathname
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, location.pathname])

  useEffect(() => {
    removeSpecialTabs()
  }, [removeSpecialTabs])

  const closeTab = (tabId: string) => {
    tabsService.closeTab(tabId)
  }

  const handleAddTab = () => {
    hideMinappPopup()
    navigate('/launchpad')
  }

  const handleSettingsClick = () => {
    hideMinappPopup()
    navigate(lastSettingsPath)
  }

  const handleTabClick = (tab: Tab) => {
    hideMinappPopup()
    navigate(tab.path)
  }

  const visibleTabs = useMemo(() => tabs.filter((tab) => !specialTabs.includes(tab.id)), [tabs])

  const { onSortEnd } = useDndReorder<Tab>({
    originalList: tabs,
    filteredList: visibleTabs,
    onUpdate: (newTabs) => dispatch(setTabs(newTabs)),
    itemKey: 'id'
  })

  return (
    <Container>
      <TabsBar $isFullscreen={isFullscreen}>
        <HorizontalScrollContainer dependencies={[tabs]} gap="6px" className="tab-scroll-container">
          <Sortable
            items={visibleTabs}
            itemKey="id"
            layout="list"
            horizontal
            gap={'6px'}
            onSortEnd={onSortEnd}
            className="tabs-sortable"
            renderItem={(tab) => (
              <Tab
                key={tab.id}
                active={tab.id === activeTabId}
                onClick={() => handleTabClick(tab)}
                onAuxClick={(e) => {
                  if (e.button === 1 && tab.id !== 'home') {
                    e.preventDefault()
                    e.stopPropagation()
                    closeTab(tab.id)
                  }
                }}>
                <TabHeader>
                  {tab.id && <TabIcon>{getTabIcon(tab.id, minapps, minAppsCache, customTools)}</TabIcon>}
                  <TabTitle>{getTabTitle(tab.id)}</TabTitle>
                </TabHeader>
                {tab.id !== 'home' && (
                  <CloseButton
                    className="close-button"
                    data-no-dnd
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}>
                    <X size={12} />
                  </CloseButton>
                )}
              </Tab>
            )}
          />
          <AddTabButton onClick={handleAddTab} className={classNames({ active: activeTabId === 'launchpad' })}>
            <PlusOutlined />
          </AddTabButton>
        </HorizontalScrollContainer>
        <RightButtonsContainer style={{ paddingRight: isLinux && useSystemTitleBar ? '12px' : undefined }}>
          <UpdateAppButton />
          <Tooltip title={t('title.home')} mouseEnterDelay={0.8} placement="bottom">
            <NavbarIconButton
              onClick={() => {
                hideMinappPopup()
                dispatch(setActiveTab('home'))
                navigate('/')
              }}
              $active={activeTabId === 'home'}>
              <Home size={16} />
            </NavbarIconButton>
          </Tooltip>
          <Tooltip title={t('title.scheduler')} mouseEnterDelay={0.8} placement="bottom">
            <NavbarIconButton
              onClick={() => {
                hideMinappPopup()
                navigate('/scheduler')
              }}
              $active={activeTabId === 'scheduler'}>
              <Clock size={16} />
            </NavbarIconButton>
          </Tooltip>
          <Tooltip title={t('title.channels')} mouseEnterDelay={0.8} placement="bottom">
            <NavbarIconButton
              onClick={() => {
                hideMinappPopup()
                navigate('/channels')
              }}
              $active={activeTabId === 'channels'}>
              <Radio size={16} />
            </NavbarIconButton>
          </Tooltip>
          <Tooltip title={t('webview.manager.title')} mouseEnterDelay={0.8} placement="bottom">
            <NavbarIconButton onClick={() => window.api.webviewManager.open()} $active={false}>
              <Globe size={16} />
            </NavbarIconButton>
          </Tooltip>
          <NavbarIconButton onClick={handleSettingsClick} $active={activeTabId === 'settings'}>
            <Settings size={16} />
          </NavbarIconButton>
        </RightButtonsContainer>
        <WindowControls />
      </TabsBar>
      <TabContent>
        {/* MiniApp WebView 池（Tab 模式保活） */}
        <MinAppTabsPool />
        {children}
      </TabContent>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #B07353;
`

const TabsBar = styled.div<{ $isFullscreen: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding-left: ${({ $isFullscreen }) => (!$isFullscreen && isMac ? '76px' : '15px')};
  padding-right: ${({ $isFullscreen }) => ($isFullscreen ? '12px' : '0')};
  height: var(--navbar-height);
  min-height: ${({ $isFullscreen }) => (!$isFullscreen && isMac ? 'env(titlebar-area-height)' : '')};
  position: relative;
  -webkit-app-region: drag;
  background: #B07353;

  /* 确保交互元素在拖拽区域之上 */
  > * {
    position: relative;
    z-index: 1;
    -webkit-app-region: no-drag;
  }

  .tab-scroll-container {
    -webkit-app-region: drag;
    margin-left: auto;
    flex: 0 1 auto;

    > * {
      -webkit-app-region: no-drag;
    }
  }
`

const Tab = styled.div<{ active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  padding-right: 8px;
  background: ${(props) => (props.active ? 'var(--color-list-item)' : 'transparent')};
  color: ${(props) => (props.active ? 'var(--color-text)' : '#ffffff')};
  transition: background 0.2s, color 0.2s;
  border-radius: var(--list-item-border-radius);
  user-select: none;
  height: 30px;
  min-width: 90px;

  .lucide,
  .close-button {
    color: inherit;
  }

  .close-button {
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover {
    color: var(--color-text);
    background: var(--color-list-item);
    .close-button {
      opacity: 1;
    }
  }
`

const TabHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
`

const TabIcon = styled.span`
  display: flex;
  align-items: center;
  color: inherit;
  flex-shrink: 0;
`

const TabTitle = styled.span`
  color: inherit;
  font-size: 13px;
  display: flex;
  align-items: center;
  margin-right: 4px;
  overflow: hidden;
  white-space: nowrap;
`

const CloseButton = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: inherit;
`

const AddTabButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  cursor: pointer;
  color: #ffffff;
  border-radius: var(--list-item-border-radius);
  flex-shrink: 0;
  .lucide,
  .anticon {
    color: inherit;
  }
  &.active {
    color: var(--color-text);
    background: var(--color-list-item);
  }
  &:hover {
    color: var(--color-text);
    background: var(--color-list-item);
  }
`

const RightButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: ${isMac ? '12px' : '0'};
  flex-shrink: 0;
`

const NavbarIconButton = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  cursor: pointer;
  color: ${(props) => (props.$active ? 'var(--color-text)' : '#ffffff')};
  border-radius: 8px;
  background: ${(props) => (props.$active ? 'var(--color-list-item)' : 'transparent')};
  .lucide {
    color: inherit;
  }
  &:hover {
    color: var(--color-text);
    background: var(--color-list-item);
  }
`

const TabContent = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  width: calc(100vw - 12px);
  margin: 6px;
  margin-top: 0;
  border-radius: 8px;
  background-color: var(--color-background);
  position: relative; /* 约束 MinAppTabsPool 绝对定位范围 */
`

export default TabsContainer
