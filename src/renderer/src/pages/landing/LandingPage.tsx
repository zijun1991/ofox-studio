import { loggerService } from '@logger'
import { Button } from 'antd'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

const logger = loggerService.withContext('LandingPage')

const LandingPage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleEnterExpertMode = () => {
    logger.info('Navigating to expert mode')
    navigate('/expert')
  }

  return (
    <Container>
      <ContentWrapper>
        <AppName>ofox studio</AppName>
        <WelcomeText>{t('landing.welcome')}</WelcomeText>
        <ActionSection>
          <Button type="primary" size="large" icon={<Sparkles size={18} />} onClick={handleEnterExpertMode}>
            {t('landing.enterExpertMode')}
            <ArrowRight size={16} style={{ marginLeft: 8 }} />
          </Button>
        </ActionSection>
      </ContentWrapper>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--color-background);
`

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  max-width: 480px;
  text-align: center;
`

const AppName = styled.h1`
  font-size: 48px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text-primary);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-soft) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`

const WelcomeText = styled.p`
  font-size: 18px;
  color: var(--color-text-secondary);
  margin: 0;
`

const ActionSection = styled.div`
  margin-top: 16px;
`

export default LandingPage
