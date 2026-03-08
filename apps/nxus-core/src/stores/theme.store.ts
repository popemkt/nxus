import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Theme palette (color scheme)
export type ThemePalette =
  | 'default'
  // Core themes
  | 'tokyonight'
  | 'dracula'
  | 'nord'
  | 'catppuccin'
  | 'retro'
  | 'github'
  // Wild themes
  | 'synthwave'
  | 'gruvbox'
  | 'rosepine'
  | 'everforest'
  | 'kanagawa'
  | 'solarized'
  // Expressive themes
  | 'anime'
  | 'sketch'
  | 'celshaded'
  | 'vaporwave'
  | 'neon'
  | 'brutalism'
  | 'gothic'
  | 'cyberpunk'
  | 'bauhaus'

// Color mode (light/dark)
export type ColorMode = 'light' | 'dark'

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
 * Use this to prevent components from acting on stale default values before
 * the store has loaded the real persisted state.
 */
export function useThemeHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useThemeStore.persist.hasHydrated())
  useEffect(() => {
    if (!hydrated) {
      return useThemeStore.persist.onFinishHydration(() => setHydrated(true))
    }
  }, [hydrated])
  return hydrated
}
