import { useTheme } from '@renderer/context/ThemeProvider'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingContainer, SettingGroup, SettingTitle } from '..'
import ModelsByProvider from './ModelsByProvider'
import UserInfoCard from './UserInfoCard'

const AccountSettings: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>
          <span>{t('settings.provider.title')}</span>
        </SettingTitle>
      </SettingGroup>

      <UserInfoCard />
      <ModelsByProvider />
    </SettingContainer>
  )
}

export default AccountSettings
