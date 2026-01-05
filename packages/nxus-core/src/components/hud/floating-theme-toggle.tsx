import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from '@phosphor-icons/react'

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  if (storedTheme) return storedTheme
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

/**
 * Floating theme toggle that appears on the right side of the screen.
 */
export function FloatingThemeToggle() {
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
    <button
      className="fixed top-8 right-6 w-11 h-11 rounded-full border border-foreground/10 bg-background/85 backdrop-blur-xl shadow-lg text-foreground/70 cursor-pointer flex items-center justify-center z-50 transition-all hover:bg-background hover:text-foreground hover:scale-105"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === 'light' ? (
          <motion.div
            key="moon"
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <Moon className="size-4" weight="fill" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <Sun className="size-4 text-yellow-400" weight="fill" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}
