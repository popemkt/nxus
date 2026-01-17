import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from '@phosphor-icons/react'
import { useThemeStore } from '@/stores/theme.store'

/**
 * Floating theme toggle that appears on the right side of the screen.
 * Toggles between light and dark color modes.
 */
export function FloatingThemeToggle() {
  const colorMode = useThemeStore((s) => s.colorMode)
  const toggleColorMode = useThemeStore((s) => s.toggleColorMode)

  return (
    <button
      className="fixed top-8 right-6 w-11 h-11 radius-button border border-foreground/10 bg-background/85 backdrop-blur-xl shadow-lg text-foreground/70 cursor-pointer flex items-center justify-center z-50 transition-all hover:bg-background hover:text-foreground hover:scale-105"
      onClick={toggleColorMode}
      title={
        colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {colorMode === 'light' ? (
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
            <Sun className="size-4 text-foreground/80" weight="fill" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}
