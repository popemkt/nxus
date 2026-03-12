import { useEffect } from 'react'
import { ALL_PALETTES } from './theme-apply'
import { useThemeStore, useThemeHydrated } from './theme.store'
import { applyStoredTheme } from './theme-apply'

/**
 * Theme provider — applies theme palette and color mode classes to <html>.
 * Uses Zustand store for reactive updates and listens to storage events
 * for cross-tab synchronization.
 */
export function ThemeProvider() {
  const palette = useThemeStore((s) => s.palette)
  const colorMode = useThemeStore((s) => s.colorMode)
  const hydrated = useThemeHydrated()

  // Reactive theme application from Zustand store
  useEffect(() => {
    // Don't touch classes until Zustand has hydrated from localStorage.
    // The inline <script> in <head> already applied the correct classes
    // on initial load — acting on default store values would strip them.
    if (!hydrated) return

    const root = document.documentElement

    // Remove all palette classes
    ALL_PALETTES.forEach((p) => root.classList.remove(p))
    root.classList.remove('dark')

    // Apply color mode
    if (colorMode === 'dark') {
      root.classList.add('dark')
    }

    // Apply palette class (except for 'default' which uses base styles)
    if (palette !== 'default') {
      root.classList.add(palette)
    }
  }, [palette, colorMode, hydrated])

  // Cross-tab theme synchronization via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'nxus-theme') {
        applyStoredTheme()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return null
}
