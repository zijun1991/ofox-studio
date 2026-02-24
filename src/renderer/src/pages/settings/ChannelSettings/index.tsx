import ListItem from '@renderer/components/ListItem'
import Scrollbar from '@renderer/components/Scrollbar'
import { useAppSelector } from '@renderer/store'
import type { ChannelEntity } from '@renderer/types/channel'
import { Flex } from 'antd'
import { Globe, Mail, MessageCircle, Plus } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import AddChannelModal from './AddChannelModal'
import ChannelDetail from './ChannelDetail'

const ChannelSettings: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const channels = useAppSelector((state) => state.channels.channels)
  const statuses = useAppSelector((state) => state.channels.statuses)
  const [addModalVisible, setAddModalVisible] = useState(false)

  const getActiveChannelId = () => {
    const match = location.pathname.match(/\/settings\/channels\/(.+)/)
    return match?.[1] || null
  }

  const activeChannelId = getActiveChannelId()

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'webhook':
        return <Globe size={18} />
      case 'email':
        return <Mail size={18} />
      case 'telegram':
        return <MessageCircle size={18} />
      default:
        return <Globe size={18} />
    }
  }

  const getStatusColor = (channelId: string) => {
    const status = statuses[channelId]
    switch (status) {
      case 'active':
        return 'var(--color-success)'
      case 'error':
        return 'var(--color-error)'
      default:
        return 'var(--color-text-3)'
    }
  }

  return (
    <Container>
      <MainContainer>
        <MenuList>
          {channels.map((channel: ChannelEntity) => (
            <ListItem
              key={channel.id}
              title={channel.name}
              active={activeChannelId === channel.id}
              onClick={() => navigate(`/settings/channels/${channel.id}`)}
              icon={getChannelIcon(channel.type)}
              titleStyle={{ fontWeight: 500 }}
              rightContent={<StatusDot style={{ backgroundColor: getStatusColor(channel.id) }} />}
            />
          ))}
          <AddButton onClick={() => setAddModalVisible(true)}>
            <Plus size={16} />
            {t('channels.add', 'Add Channel')}
          </AddButton>
        </MenuList>
        <RightContainer>
          <Routes>
            <Route
              index
              element={
                channels.length > 0 ? (
                  <Navigate to={channels[0].id} replace />
                ) : (
                  <EmptyState>
                    {t('channels.empty', 'No channels configured. Click "Add Channel" to get started.')}
                  </EmptyState>
                )
              }
            />
            <Route path=":channelId" element={<ChannelDetail />} />
          </Routes>
        </RightContainer>
      </MainContainer>
      <AddChannelModal open={addModalVisible} onClose={() => setAddModalVisible(false)} />
    </Container>
  )
}

const Container = styled(Flex)`
  flex: 1;
`

const MainContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  width: 100%;
  height: calc(100vh - var(--navbar-height) - 6px);
  overflow: hidden;
`

const MenuList = styled(Scrollbar)`
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: var(--settings-width);
  padding: 12px;
  padding-bottom: 48px;
  border-right: 0.5px solid var(--color-border);
  height: calc(100vh - var(--navbar-height));
`

const RightContainer = styled.div`
  flex: 1;
  position: relative;
  overflow-y: auto;
`

const AddButton = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  cursor: pointer;
  border-radius: var(--list-item-border-radius);
  font-size: 13px;
  color: var(--color-text-2);
  transition: all 0.2s ease;
  &:hover {
    background: var(--color-background-soft);
    color: var(--color-text-1);
  }
`

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
`

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-3);
  font-size: 14px;
  padding: 20px;
  text-align: center;
`

export default ChannelSettings
