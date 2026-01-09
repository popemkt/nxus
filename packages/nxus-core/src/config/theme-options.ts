import {
  Moon,
  Sun,
  Sparkle,
  Ghost,
  Snowflake,
  Terminal,
  Cat,
  GithubLogo,
} from '@phosphor-icons/react'
import type { ComponentType } from 'react'

// Theme value type - all available themes
export type Theme =
  // Dark themes
  | 'dark'
  | 'tokyonight'
  | 'dracula'
  | 'nord'
  | 'catppuccin'
  | 'retro'
  // Light themes
  | 'light'
  | 'github'

export interface ThemeOption {
  value: Theme
  label: string
  Icon: ComponentType<{ className?: string; weight?: string }>
  isDark: boolean
  color: string // Primary color for preview
}

export const themeOptions: ThemeOption[] = [
  // Dark themes
  {
    value: 'dark',
    label: 'Dark',
    Icon: Moon,
    isDark: true,
    color: '#3b82f6',
  },
  {
    value: 'tokyonight',
    label: 'Tokyo Night',
    Icon: Sparkle,
    isDark: true,
    color: '#bb9af7',
  },
  {
    value: 'dracula',
    label: 'Dracula',
    Icon: Ghost,
    isDark: true,
    color: '#bd93f9',
  },
  {
    value: 'nord',
    label: 'Nord',
    Icon: Snowflake,
    isDark: true,
    color: '#88c0d0',
  },
  {
    value: 'catppuccin',
    label: 'Catppuccin',
    Icon: Cat,
    isDark: true,
    color: '#cba6f7',
  },
  {
    value: 'retro',
    label: 'Retro',
    Icon: Terminal,
    isDark: true,
    color: '#22c55e',
  },
  // Light themes
  {
    value: 'light',
    label: 'Light',
    Icon: Sun,
    isDark: false,
    color: '#3b82f6',
  },
  {
    value: 'github',
    label: 'GitHub',
    Icon: GithubLogo,
    isDark: false,
    color: '#0969da',
  },
]

// Helper: Get only dark themes
export const darkThemes = themeOptions.filter((t) => t.isDark)

// Helper: Get only light themes
export const lightThemes = themeOptions.filter((t) => !t.isDark)
