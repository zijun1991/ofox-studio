import { useTheme } from '@renderer/context/ThemeProvider'
import { updateOfoxApiKey } from '@renderer/store/llm'
import { setShowLoginModal } from '@renderer/store/ofoxStore'
import type { Provider } from '@renderer/types'
import { Avatar, Button, Input, message } from 'antd'
import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'
import styled from 'styled-components'

const UserInfoCard: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const dispatch = useDispatch()
  const { isLoggedIn, user } = useSelector(
    (state: {
      ofox: {
        isLoggedIn: boolean
        user: { id: string; email: string; name?: string; image?: string } | null
      }
    }) => state.ofox
  )
  const ofoxApiKey = useSelector(
    (state: { llm: { providers: Provider[] } }) =>
      state.llm.providers.find((p: Provider) => p.id === 'ofox-openai')?.apiKey || ''
  )
  const [inputApiKey, setInputApiKey] = useState(ofoxApiKey || '')

  const handleLogin = () => {
    dispatch(setShowLoginModal(true))
  }

  const handleSaveApiKey = () => {
    if (!inputApiKey.trim()) {
      message.warning(t('settings.account.api_key_required'))
      return
    }
    dispatch(updateOfoxApiKey(inputApiKey.trim()))
    message.success(t('settings.account.api_key_saved'))
  }

  const handleResetApiKey = () => {
    setInputApiKey('')
    dispatch(updateOfoxApiKey(''))
  }

  const getInitials = () => {
    if (user?.name) {
      return user.name.charAt(0).toUpperCase()
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase()
    }
    return '?'
  }

  return (
    <Card theme={theme}>
      <MainRow>
        <UserInfoSection>
          <AvatarSection>
            {isLoggedIn && user ? (
              <StyledAvatar src={user.image} size={56}>
                {getInitials()}
              </StyledAvatar>
            ) : (
              <StyledAvatar size={56}>?</StyledAvatar>
            )}
          </AvatarSection>
          <InfoSection>
            {isLoggedIn && user ? (
              <>
                <UserName>{user.name || user.email}</UserName>
                <UserEmail>{user.email}</UserEmail>
              </>
            ) : (
              <>
                <UserName>{t('settings.account.not_logged_in')}</UserName>
                <UserEmail>{t('settings.account.login_hint')}</UserEmail>
              </>
            )}
          </InfoSection>
        </UserInfoSection>
        <ActionSection>
          {isLoggedIn ? (
            <StatusBadge>
              <StatusDot />
              {t('settings.account.logged_in')}
            </StatusBadge>
          ) : (
            <Button type="primary" onClick={handleLogin}>
              {t('settings.account.login')}
            </Button>
          )}
        </ActionSection>
      </MainRow>
      {isLoggedIn && (
        <ApiKeySection>
          <ApiKeyLabel>{t('settings.account.api_key')}</ApiKeyLabel>
          <ApiKeyInput
            placeholder={t('settings.account.api_key_placeholder')}
            value={inputApiKey}
            onChange={(e) => setInputApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <SaveButton type="primary" onClick={handleSaveApiKey}>
            {t('settings.account.api_key_save')}
          </SaveButton>
        </ApiKeySection>
      )}
      <ResetApiKeySection>
        <Button onClick={handleResetApiKey}>重置 API Key</Button>
      </ResetApiKeySection>
    </Card>
  )
}

const Card = styled.div<{ theme: string }>`
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: var(--list-item-border-radius);
  border: 0.5px solid var(--color-border);
  background: ${(props) => (props.theme === 'dark' ? '#00000010' : 'var(--color-background)')};
  margin-bottom: 20px;
`

const MainRow = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`

const UserInfoSection = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
`

const AvatarSection = styled.div`
  flex-shrink: 0;
`

const StyledAvatar = styled(Avatar)`
  background: var(--color-primary);
  font-size: 20px;
`

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const UserName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
`

const UserEmail = styled.div`
  font-size: 13px;
  color: var(--color-text-3);
`

const ActionSection = styled.div`
  flex-shrink: 0;
`

const StatusBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  background: var(--color-background-soft);
  font-size: 13px;
  color: var(--color-text-2);
`

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #52c41a;
`

const ResetApiKeySection = styled.div`
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 0.5px solid var(--color-border);
`

const ApiKeySection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 0.5px solid var(--color-border);
`

const ApiKeyLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-2);
  white-space: nowrap;
`

const ApiKeyInput = styled(Input.Password)`
  flex: 1;
`

const SaveButton = styled(Button)`
  flex-shrink: 0;
`

export default UserInfoCard
