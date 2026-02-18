/**
 * 模型服务页面 - 新版本
 *
 * 原有页面代码位置参考:
 * - 主组件: ./ProviderList.tsx
 * - 配置组件: ./ProviderSetting.tsx
 * - 模型列表: ./ModelList/ModelList.tsx
 *
 * 原有组件功能:
 * - 左侧显示所有服务商列表（支持拖拽排序）
 * - 右侧显示选中服务商的详细配置
 * - 支持搜索过滤服务商
 * - 支持添加自定义服务商
 * - 支持通过 URL Schema 添加 API Key
 * - 支持模型备注功能
 */

import { UserOutlined } from '@ant-design/icons'
import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setShowLoginModal, setUser } from '@renderer/store/ofoxStore'
import { Avatar, Button, Card, Spin, Typography } from 'antd'
import type { FC } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const { Text, Title } = Typography

const ProviderListNew: FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { isLoggedIn, isChecking, user } = useAppSelector((state) => state.ofox)

  // 处理登录按钮点击
  const handleLogin = useCallback(() => {
    dispatch(setShowLoginModal(true))
  }, [dispatch])

  // 处理登出
  const handleLogout = useCallback(async () => {
    await window.api.ofox.logout()
    dispatch(setUser(null))
    dispatch(setShowLoginModal(true))
  }, [dispatch])

  return (
    <Container>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none' }}>{t('settings.provider.title')}</NavbarCenter>
      </Navbar>
      <ContentContainer>
        <MainContent>
          {/* 用户信息卡片 */}
          <UserCard title="Ofox 账户">
            {isChecking ? (
              <LoadingContainer>
                <Spin />
                <Text type="secondary">检查登录状态...</Text>
              </LoadingContainer>
            ) : isLoggedIn && user ? (
              <UserInfo>
                <Avatar size={48} src={user.image} icon={<UserOutlined />} />
                <UserInfoText>
                  <Text strong>{user.name || user.email}</Text>
                  <Text type="secondary">{user.email}</Text>
                </UserInfoText>
                <Button danger onClick={handleLogout}>
                  登出
                </Button>
              </UserInfo>
            ) : (
              <LoginPrompt>
                <Text type="secondary">请登录 Ofox 账户以使用模型服务</Text>
                <Button type="primary" onClick={handleLogin}>
                  登录
                </Button>
              </LoginPrompt>
            )}
          </UserCard>

          {/* 开发中的提示 */}
          <PlaceholderContent>
            <Title level={4}>{t('settings.provider.title')}</Title>
            <Text type="secondary">{t('common.developing')}...</Text>
          </PlaceholderContent>
        </MainContent>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`

const ContentContainer = styled(Scrollbar)`
  display: flex;
  flex: 1;
  height: calc(100vh - var(--navbar-height));
`

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 24px;
  gap: 24px;
`

const UserCard = styled(Card)`
  max-width: 500px;
`

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
`

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`

const UserInfoText = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
`

const LoginPrompt = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 0;
`

const PlaceholderContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-2);
  text-align: center;

  h4 {
    margin-bottom: 8px;
    color: var(--color-text-1);
  }
`

export default ProviderListNew
