import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'
import { Button } from '../../../ui/button'

// Apply theme immediately to prevent flash
function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'

  const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (storedTheme) return storedTheme

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

// Apply theme to DOM immediately
if (typeof window !== 'undefined') {
  const initialTheme = getInitialTheme()
  const root = window.document.documentElement
  if (initialTheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)

  useEffect(() => {
    const root = window.document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="rounded-full overflow-hidden relative cursor-pointer"
      asChild
    >
      <motion.button whileTap={{ scale: 0.9 }}>
        <AnimatePresence mode="wait" initial={false}>
          {theme === 'light' ? (
            <motion.div
              key="moon"
              initial={{ scale: 0, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, rotate: 90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <MoonIcon className="h-6 w-6 text-foreground" weight="fill" />
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ scale: 0, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, rotate: 90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <SunIcon className="h-6 w-6 text-yellow-400" weight="fill" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </Button>
  )
}
