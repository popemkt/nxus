import type { Item } from '@nxus/db'

const GROUP_PALETTE = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444',
  '#06b6d4', '#eab308', '#ec4899', '#8b5cf6', '#14b8a6',
  '#f59e0b', '#6366f1',
] as const

const TYPE_COLORS: Record<string, string> = {
  tool: '#22c55e',
  'remote-repo': '#a855f7',
  typescript: '#3b82f6',
  html: '#f97316',
  concept: '#eab308',
}

export interface GroupInfo {
  key: string
  label: string
  color: string
}

export interface GroupingDimension {
  id: string
  label: string
  /** Given an item, return the group(s) it belongs to. Array because items can be in multiple groups. */
  getGroups: (item: Item) => Array<GroupInfo>
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function paletteColor(str: string): string {
  return GROUP_PALETTE[hashString(str) % GROUP_PALETTE.length] ?? '#888'
}

export const GROUPING_DIMENSIONS: Array<GroupingDimension> = [
  {
    id: 'supertag',
    label: 'Type',
    getGroups: (item) =>
      (item.types ?? [item.type]).map((t) => ({
        key: t,
        label: t,
        color: TYPE_COLORS[t] ?? '#888',
      })),
  },
  {
    id: 'tag',
    label: 'Tag',
    getGroups: (item) =>
      item.metadata.tags.map((t) => ({
        key: t.id,
        label: t.name,
        color: paletteColor(t.id),
      })),
  },
  {
    id: 'category',
    label: 'Category',
    getGroups: (item) => [
      {
        key: item.metadata.category,
        label: item.metadata.category,
        color: paletteColor(item.metadata.category),
      },
    ],
  },
]
