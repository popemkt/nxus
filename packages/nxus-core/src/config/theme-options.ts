import {
  Sparkle,
  Ghost,
  Snowflake,
  Terminal,
  Cat,
  GithubLogo,
  CircleDashed,
  Lightning,
  Fire,
  Flower,
  Tree,
  Waves,
  Sun,
} from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import type { ThemePalette } from '@/stores/theme.store'

export interface ThemeOption {
  value: ThemePalette
  label: string
  Icon: ComponentType<{ className?: string; weight?: string }>
  color: string // Primary color for preview
}

export const themeOptions: ThemeOption[] = [
  // Core themes
  {
    value: 'default',
    label: 'Default',
    Icon: CircleDashed,
    color: '#3b82f6',
  },
  {
    value: 'tokyonight',
    label: 'Tokyo Night',
    Icon: Sparkle,
    color: '#bb9af7',
  },
  {
    value: 'dracula',
    label: 'Dracula',
    Icon: Ghost,
    color: '#bd93f9',
  },
  {
    value: 'nord',
    label: 'Nord',
    Icon: Snowflake,
    color: '#88c0d0',
  },
  {
    value: 'catppuccin',
    label: 'Catppuccin',
    Icon: Cat,
    color: '#cba6f7',
  },
  {
    value: 'retro',
    label: 'Retro',
    Icon: Terminal,
    color: '#22c55e',
  },
  {
    value: 'github',
    label: 'GitHub',
    Icon: GithubLogo,
    color: '#0969da',
  },
  // Wild themes
  {
    value: 'synthwave',
    label: 'Synthwave',
    Icon: Lightning,
    color: '#ff7edb',
  },
  {
    value: 'gruvbox',
    label: 'Gruvbox',
    Icon: Fire,
    color: '#d79921',
  },
  {
    value: 'rosepine',
    label: 'Rosé Pine',
    Icon: Flower,
    color: '#ebbcba',
  },
  {
    value: 'everforest',
    label: 'Everforest',
    Icon: Tree,
    color: '#a7c080',
  },
  {
    value: 'kanagawa',
    label: 'Kanagawa',
    Icon: Waves,
    color: '#7e9cd8',
  },
  {
    value: 'solarized',
    label: 'Solarized',
    Icon: Sun,
    color: '#268bd2',
  },
]
