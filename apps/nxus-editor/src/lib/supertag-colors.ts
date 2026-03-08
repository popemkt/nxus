/**
 * Deterministic supertag color assignment based on ID hash.
 * Matches the pattern used in the workbench graph.
 */

const DEFAULT_SUPERTAG_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#10b981', // Emerald
] as const

function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return hash >>> 0
}

export function getSupertagColor(supertagId: string): string {
  const hash = hashString(supertagId)
  const index = Math.abs(hash) % DEFAULT_SUPERTAG_COLORS.length
  return DEFAULT_SUPERTAG_COLORS[index]!
}
