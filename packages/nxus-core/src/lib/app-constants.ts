import {
  CodeIcon,
  FileIcon,
  FolderOpenIcon,
  WrenchIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { Item, ItemType } from '@nxus/db'

/**
 * Icon mapping for each app type.
 * Used across the application for consistent visual representation.
 */
export const APP_TYPE_ICONS = {
  html: FileIcon,
  typescript: CodeIcon,
  'remote-repo': FolderOpenIcon,
  tool: WrenchIcon,
} as const

/**
 * Short label mapping for each app type.
 * Used in compact UI elements like app cards.
 */
export const APP_TYPE_LABELS_SHORT = {
  html: 'HTML',
  typescript: 'TypeScript',
  'remote-repo': 'Repository',
  tool: 'Tool',
} as const

/**
 * Long label mapping for each app type.
 * Used in detailed views like app detail pages.
 */
export const APP_TYPE_LABELS_LONG = {
  html: 'HTML Application',
  typescript: 'TypeScript Application',
  'remote-repo': 'Remote Repository',
  tool: 'Tool / Dependency',
} as const

/**
 * Badge variant mapping for app installation status.
 * Maps status to shadcn/ui badge variants.
 */
export const STATUS_VARIANTS = {
  installed: 'default',
  'not-installed': 'secondary',
  available: 'outline',
} as const satisfies Record<Item['status'], 'default' | 'secondary' | 'outline'>

/**
 * Color mapping for each app type.
 * Used in graph view and other visualizations.
 */
export const APP_TYPE_COLORS = {
  tool: '#22c55e',        // green
  'remote-repo': '#a855f7', // purple
  typescript: '#3b82f6',   // blue
  html: '#f97316',         // orange
} as const

// Type exports for consumers
export type AppType = keyof typeof APP_TYPE_ICONS
export type AppStatus = keyof typeof STATUS_VARIANTS

/**
 * Badge configuration for displaying type information
 */
export interface TypeBadgeConfig {
  type: ItemType
  label: string
  icon: Icon
  isFirst: boolean
}

/**
 * Gets the icon for a single type.
 * Returns the icon component for the specified type, or FileIcon as fallback.
 */
export function getTypeIcon(type: ItemType): Icon {
  return APP_TYPE_ICONS[type] ?? FileIcon
}

/**
 * Gets the first type icon for an item (used for display in compact views).
 * Uses `types[0]` as the display type.
 * Returns FileIcon if types array is empty or invalid.
 */
export function getFirstTypeIcon(item: Pick<Item, 'types'>): Icon {
  if (item.types && item.types.length > 0) {
    return APP_TYPE_ICONS[item.types[0]] ?? FileIcon
  }
  return FileIcon
}

/**
 * Gets the short label for a single type.
 * Returns the short label string for the specified type, or 'Unknown' as fallback.
 */
export function getTypeLabel(type: ItemType): string {
  return APP_TYPE_LABELS_SHORT[type] ?? 'Unknown'
}

/**
 * Gets the long label for a single type.
 * Returns the long label string for the specified type, or 'Unknown Type' as fallback.
 */
export function getTypeLabelLong(type: ItemType): string {
  return APP_TYPE_LABELS_LONG[type] ?? 'Unknown Type'
}

/**
 * Gets the first type label for an item (used for display in compact views).
 * Uses `types[0]` as the display type.
 */
export function getFirstTypeLabel(item: Pick<Item, 'types'>): string {
  if (item.types && item.types.length > 0) {
    return APP_TYPE_LABELS_SHORT[item.types[0]] ?? 'Unknown'
  }
  return 'Unknown'
}

/**
 * Gets all type labels for an item with multiple types.
 * Returns labels in the order they appear in the types array.
 */
export function getAllTypeLabels(item: Pick<Item, 'types'>): string[] {
  if (!item.types || item.types.length === 0) {
    return ['Unknown']
  }
  return item.types.map((type) => APP_TYPE_LABELS_SHORT[type] ?? 'Unknown')
}

/**
 * Gets badge configurations for all types of an item.
 * Used for displaying multiple type badges side by side.
 * The first type badge is marked with `isFirst: true`.
 */
export function getTypeBadges(item: Pick<Item, 'types'>): TypeBadgeConfig[] {
  if (!item.types || item.types.length === 0) {
    return []
  }

  return item.types.map((type, index) => ({
    type,
    label: APP_TYPE_LABELS_SHORT[type] ?? 'Unknown',
    icon: APP_TYPE_ICONS[type] ?? FileIcon,
    isFirst: index === 0,
  }))
}

/**
 * Gets all icons for an item with multiple types.
 * Returns icons in the order they appear in the types array.
 */
export function getAllTypeIcons(item: Pick<Item, 'types'>): Icon[] {
  if (!item.types || item.types.length === 0) {
    return [FileIcon]
  }
  return item.types.map((type) => APP_TYPE_ICONS[type] ?? FileIcon)
}

/**
 * Checks if an item has multiple types.
 */
export function hasMultipleTypes(item: Pick<Item, 'types'>): boolean {
  return item.types && item.types.length > 1
}

/**
 * Gets the count of types for an item.
 */
export function getTypeCount(item: Pick<Item, 'types'>): number {
  return item.types?.length ?? 0
}

/**
 * Gets the color for a single type.
 * Returns the color string for the specified type, or muted foreground as fallback.
 */
export function getTypeColor(type: ItemType): string {
  return APP_TYPE_COLORS[type] ?? 'var(--muted-foreground)'
}

/**
 * Gets the first type color for an item (used for display in graph view).
 * Uses `types[0]` as the display type.
 */
export function getFirstTypeColor(item: Pick<Item, 'types'>): string {
  if (item.types && item.types.length > 0) {
    return APP_TYPE_COLORS[item.types[0]] ?? 'var(--muted-foreground)'
  }
  return 'var(--muted-foreground)'
}
