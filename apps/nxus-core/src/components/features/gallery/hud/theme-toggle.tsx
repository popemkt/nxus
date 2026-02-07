import { AnimatePresence, motion } from 'framer-motion'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'
import { Button } from '../../../ui/button'
import { useThemeStore } from '@/stores/theme.store'

/**
 * Theme toggle button - toggles between light and dark color modes.
 */
export function ThemeToggle() {
  const colorMode = useThemeStore((s) => s.colorMode)
  const toggleColorMode = useThemeStore((s) => s.toggleColorMode)

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleColorMode}
      aria-label="Toggle theme"
      className="radius-button overflow-hidden relative cursor-pointer"
      render={<motion.button whileTap={{ scale: 0.9 }} />}
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
            <SunIcon className="h-6 w-6 text-foreground/80" weight="fill" />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  )
}
