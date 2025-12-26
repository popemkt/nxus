import {
  CodeIcon,
  FileIcon,
  FolderOpenIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react'
import type { App } from '@/types/app'

/**
 * Icon mapping for each app type.
 * Used across the application for consistent visual representation.
 */
export const APP_TYPE_ICONS = {
  html: FileIcon,
  typescript: CodeIcon,
  'remote-repo': FolderOpenIcon,
  'script-tool': TerminalWindowIcon,
} as const

/**
 * Short label mapping for each app type.
 * Used in compact UI elements like app cards.
 */
export const APP_TYPE_LABELS_SHORT = {
  html: 'HTML',
  typescript: 'TypeScript',
  'remote-repo': 'Repository',
  'script-tool': 'Script',
} as const

/**
 * Long label mapping for each app type.
 * Used in detailed views like app detail pages.
 */
export const APP_TYPE_LABELS_LONG = {
  html: 'HTML Application',
  typescript: 'TypeScript Application',
  'remote-repo': 'Remote Repository',
  'script-tool': 'Script Tool',
} as const

/**
 * Badge variant mapping for app installation status.
 * Maps status to shadcn/ui badge variants.
 */
export const STATUS_VARIANTS = {
  installed: 'default',
  'not-installed': 'secondary',
  available: 'outline',
} as const satisfies Record<App['status'], 'default' | 'secondary' | 'outline'>

// Type exports for consumers
export type AppType = keyof typeof APP_TYPE_ICONS
export type AppStatus = keyof typeof STATUS_VARIANTS
