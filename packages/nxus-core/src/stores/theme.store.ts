import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Theme palette (color scheme)
export type ThemePalette =
  | 'default'
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
