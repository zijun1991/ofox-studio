import { useTypewriter } from '@renderer/hooks/useTypewriter'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import styled, { keyframes } from 'styled-components'

const SpeedyWelcome: FC = () => {
  const { t } = useTranslation()

  const titleText = t('speedy.welcome.title')
  const subtitleText = t('speedy.welcome.subtitle')

  const { displayedText: titleDisplayed, isComplete: titleComplete } = useTypewriter({
    text: titleText,
    speed: 80,
    startDelay: 400
  })

  return (
    <WelcomeContainer>
      <NeonGlow />
      <ContentWrapper>
        <TitleLine>
          <TitleText>{titleDisplayed}</TitleText>
          {!titleComplete && <BlinkingCursor />}
        </TitleLine>
        <AnimatePresence>
          {titleComplete && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}>
              <SubtitleLine>
                <SubtitleText>{subtitleText}</SubtitleText>
                <BlinkingCursor />
              </SubtitleLine>
            </motion.div>
          )}
        </AnimatePresence>
      </ContentWrapper>
    </WelcomeContainer>
  )
}

const breathe = keyframes`
  0%, 100% {
    opacity: 0.3;
    transform: translate(-50%, -50%) scale(0.9);
  }
  50% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(1.1);
  }
`

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`

const WelcomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 350px);
  position: relative;
  overflow: hidden;
`

const NeonGlow = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(176, 115, 83, 0.2) 0%, rgba(176, 115, 83, 0.05) 50%, transparent 70%);
  transform: translate(-50%, -50%);
  animation: ${breathe} 4s ease-in-out infinite;
  pointer-events: none;
`

const ContentWrapper = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`

const TitleLine = styled.div`
  display: flex;
  align-items: center;
  min-height: 36px;
`

const TitleText = styled.span`
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 1px;
`

const SubtitleLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`

const SubtitleText = styled.span`
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-secondary);
  letter-spacing: 0.5px;
`

const BlinkingCursor = styled.span`
  display: inline-block;
  width: 2px;
  height: 1.1em;
  margin-left: 2px;
  background-color: var(--speedy-brand, #b07353);
  animation: ${blink} 1s step-end infinite;
  vertical-align: text-bottom;
`

export default memo(SpeedyWelcome)
