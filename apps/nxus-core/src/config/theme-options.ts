import type { Icon } from '@phosphor-icons/react'
import {
  SparkleIcon,
  GhostIcon,
  SnowflakeIcon,
  TerminalIcon,
  CatIcon,
  GithubLogoIcon,
  CircleDashedIcon,
  LightningIcon,
  FireIcon,
  FlowerIcon,
  TreeIcon,
  WavesIcon,
  SunIcon,
  PaletteIcon,
  PencilLineIcon,
  GameControllerIcon,
  DiscIcon,
  RadioactiveIcon,
  CubeIcon,
} from '@phosphor-icons/react'
import type { ThemePalette } from '@/stores/theme.store'

export interface ThemeOption {
  value: ThemePalette
  label: string
  Icon: Icon
  color: string // Primary color for preview
}

export const themeOptions: ThemeOption[] = [
  // Core themes
  {
    value: 'default',
    label: 'Default',
    Icon: CircleDashedIcon,
    color: '#3b82f6',
  },
  {
    value: 'tokyonight',
    label: 'Tokyo Night',
    Icon: SparkleIcon,
    color: '#bb9af7',
  },
  {
    value: 'dracula',
    label: 'Dracula',
    Icon: GhostIcon,
    color: '#bd93f9',
  },
  {
    value: 'nord',
    label: 'Nord',
    Icon: SnowflakeIcon,
    color: '#88c0d0',
  },
  {
    value: 'catppuccin',
    label: 'Catppuccin',
    Icon: CatIcon,
    color: '#cba6f7',
  },
  {
    value: 'retro',
    label: 'Retro',
    Icon: TerminalIcon,
    color: '#22c55e',
  },
  {
    value: 'github',
    label: 'GitHub',
    Icon: GithubLogoIcon,
    color: '#0969da',
  },
  // Wild themes
  {
    value: 'synthwave',
    label: 'Synthwave',
    Icon: LightningIcon,
    color: '#ff7edb',
  },
  {
    value: 'gruvbox',
    label: 'Gruvbox',
    Icon: FireIcon,
    color: '#d79921',
  },
  {
    value: 'rosepine',
    label: 'Rosé Pine',
    Icon: FlowerIcon,
    color: '#ebbcba',
  },
  {
    value: 'everforest',
    label: 'Everforest',
    Icon: TreeIcon,
    color: '#a7c080',
  },
  {
    value: 'kanagawa',
    label: 'Kanagawa',
    Icon: WavesIcon,
    color: '#7e9cd8',
  },
  {
    value: 'solarized',
    label: 'Solarized',
    Icon: SunIcon,
    color: '#268bd2',
  },
  // Expressive themes
  {
    value: 'anime',
    label: 'Anime',
    Icon: PaletteIcon,
    color: '#ff1493',
  },
  {
    value: 'sketch',
    label: 'Sketch',
    Icon: PencilLineIcon,
    color: '#4a4a4a',
  },
  {
    value: 'celshaded',
    label: 'Cel-Shaded',
    Icon: GameControllerIcon,
    color: '#4ade80',
  },
  {
    value: 'vaporwave',
    label: 'Vaporwave',
    Icon: DiscIcon,
    color: '#e879f9',
  },
  {
    value: 'neon',
    label: 'Neon',
    Icon: RadioactiveIcon,
    color: '#00ff88',
  },
  {
    value: 'brutalism',
    label: 'Brutalism',
    Icon: CubeIcon,
    color: '#1a1a1a',
  },
]
