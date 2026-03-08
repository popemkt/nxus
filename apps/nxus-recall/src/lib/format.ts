export function formatInterval(days: number): string {
  if (days === 0) return '<1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString()
}

import type { FsrsCardState } from '@nxus/db'

// Exhaustiveness checked at definition — all FsrsCardState keys required
const _cardStateLabels: Record<FsrsCardState, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
}

// Widened for runtime indexing (server function types lose precision through serialization)
export const cardStateLabels: Record<number, string> = _cardStateLabels
