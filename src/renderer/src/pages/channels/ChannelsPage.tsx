import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import ChannelSettings from '@renderer/pages/settings/ChannelSettings'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

/**
 * 频道管理页面 - 顶级页面
 * 包含频道列表和频道详情配置
 */
const ChannelsPage: FC = () => {
  const { t } = useTranslation()

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>{t('title.channels', 'Channels')}</NavbarCenter>
      </Navbar>
      <ContentContainer>
        <ChannelSettings />
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  height: calc(100vh - var(--navbar-height));
`

export default ChannelsPage
