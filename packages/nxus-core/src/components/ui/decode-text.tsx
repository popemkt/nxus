import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const CHARACTERS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+'

interface DecodeTextProps {
  text: string
  className?: string
  duration?: number // total time to decode in ms
}

export function DecodeText({
  text,
  className,
  duration = 1500,
}: DecodeTextProps) {
  const [displayText, setDisplayText] = useState('')
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    let interval: NodeJS.Timeout
    let step = 0
    const totalSteps = 20 // number of scrambling steps
    const stepDuration = duration / totalSteps

    // Fill with random characters initially
    setDisplayText(
      text
        .split('')
        .map(() => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)])
        .join(''),
    )

    const animate = () => {
      interval = setInterval(() => {
        step++
        if (step > totalSteps) {
          clearInterval(interval)
          setDisplayText(text)
          return
        }

        const progress = step / totalSteps
        const revealCount = Math.floor(text.length * progress)

        const scrambled = text
          .split('')
          .map((char, index) => {
            if (index < revealCount) return char
            return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
          })
          .join('')

        setDisplayText(scrambled)
      }, stepDuration)
    }

    animate()
    return () => clearInterval(interval)
  }, [text, duration])

  // Re-run animation on hover
  const handleHover = () => {
    if (isHovered) return
    setIsHovered(true)
    let step = 0
    const totalSteps = 15
    const stepDuration = 50

    const interval = setInterval(() => {
      step++
      if (step > totalSteps) {
        clearInterval(interval)
        setDisplayText(text)
        setIsHovered(false)
        return
      }

      const progress = step / totalSteps
      const revealCount = Math.floor(text.length * progress)

      const scrambled = text
        .split('')
        .map((char, index) => {
          if (index < revealCount) return char
          return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
        })
        .join('')

      setDisplayText(scrambled)
    }, stepDuration)
  }

  return (
    <motion.div
      className={className}
      onMouseEnter={handleHover}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {displayText}
    </motion.div>
  )
}
