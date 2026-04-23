import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ColorMode, ThemePalette } from './theme.types'

interface ThemeState {
  palette: ThemePalette
  colorMode: ColorMode
  setPalette: (palette: ThemePalette) => void
  setColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      palette: 'default',
      colorMode: 'dark',
      setPalette: (palette) => set({ palette }),
      setColorMode: (colorMode) => set({ colorMode }),
      toggleColorMode: () =>
        set((state) => ({
          colorMode: state.colorMode === 'dark' ? 'light' : 'dark',
        })),
    }),
    {
      name: 'nxus-theme',
    },
  ),
)

/**
 * Hook to track whether Zustand persist has finished hydrating from localStorage.
 * Returns false during SSR (persist middleware not available server-side).
 */
export function useThemeHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => {
    // persist middleware is undefined during SSR
    return useThemeStore.persist?.hasHydrated?.() ?? false
  })
  useEffect(() => {
    if (!hydrated) {
      return useThemeStore.persist?.onFinishHydration?.(() => setHydrated(true))
    }
  }, [hydrated])
  return hydrated
}
