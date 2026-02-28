import { useCallback, useEffect, useRef, useState } from 'react'

const languages = ['en-US', 'de-DE', 'es-ES', 'zh-CN', 'zh-TW', 'ja-JP', 'ru-RU', 'el-GR', 'fr-FR', 'pt-PT', 'ro-RO']
const segmenter = new Intl.Segmenter(languages)

interface UseTypewriterOptions {
  text: string
  speed?: number
  startDelay?: number
  enabled?: boolean
}

export function useTypewriter({ text, speed = 80, startDelay = 0, enabled = true }: UseTypewriterOptions) {
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indexRef = useRef(0)
  const segmentsRef = useRef<string[]>([])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text)
      setIsTyping(false)
      setIsComplete(true)
      return
    }

    // Reset state
    setDisplayedText('')
    setIsTyping(false)
    setIsComplete(false)
    indexRef.current = 0
    segmentsRef.current = Array.from(segmenter.segment(text)).map((s) => s.segment)

    const segments = segmentsRef.current

    if (segments.length === 0) {
      setIsComplete(true)
      return
    }

    const typeNext = () => {
      if (indexRef.current < segments.length) {
        indexRef.current++
        setDisplayedText(segments.slice(0, indexRef.current).join(''))
        timerRef.current = setTimeout(typeNext, speed)
      } else {
        setIsTyping(false)
        setIsComplete(true)
      }
    }

    timerRef.current = setTimeout(() => {
      setIsTyping(true)
      typeNext()
    }, startDelay)

    return cleanup
  }, [text, speed, startDelay, enabled, cleanup])

  return { displayedText, isTyping, isComplete }
}
