/**
 * Color Palette Utilities
 *
 * Generates consistent, visually distinct colors for supertag visualization.
 * Uses golden angle distribution for optimal color separation.
 */

/**
 * Default color palette for supertags.
 * These are hand-picked colors that work well together and are accessible.
 */
export const DEFAULT_SUPERTAG_COLORS = [
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

/**
 * Color for nodes without a supertag.
 */
export const NO_SUPERTAG_COLOR = '#6b7280' // Gray-500

/**
 * Color for virtual/synthesized nodes (tags, etc.).
 */
export const VIRTUAL_NODE_COLOR = '#9ca3af' // Gray-400

/**
 * Generate a consistent color for a supertag based on its ID.
 *
 * Uses a simple hash function to deterministically map IDs to colors.
 * This ensures the same supertag always gets the same color across renders.
 *
 * @param supertagId - The supertag's unique identifier
 * @returns A hex color string
 */
export function getSupertagColor(supertagId: string): string {
  const hash = hashString(supertagId)
  const index = Math.abs(hash) % DEFAULT_SUPERTAG_COLORS.length
  return DEFAULT_SUPERTAG_COLORS[index]
}

/**
 * Generate a color map for all supertags in the graph.
 *
 * This pre-computes colors for all supertags to ensure consistency
 * and avoid repeated hash calculations during render.
 *
 * @param supertagIds - Array of supertag IDs to generate colors for
 * @returns Map of supertag ID to hex color
 */
export function generateSupertagColorMap(
  supertagIds: string[],
): Map<string, string> {
  const colorMap = new Map<string, string>()

  // Use a Set to avoid duplicates
  const uniqueIds = [...new Set(supertagIds)]

  for (const id of uniqueIds) {
    colorMap.set(id, getSupertagColor(id))
  }

  return colorMap
}

/**
 * Simple string hash function (djb2).
 *
 * Produces a 32-bit integer hash from a string.
 * Used for deterministic color assignment.
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return hash >>> 0 // Convert to unsigned 32-bit integer
}

/**
 * Adjust color brightness for different states.
 *
 * @param hex - The base hex color
 * @param percent - Brightness adjustment (-100 to 100)
 * @returns Adjusted hex color
 */
export function adjustBrightness(hex: string, percent: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '')

  // Parse RGB components
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)

  // Adjust brightness
  const adjust = (value: number) => {
    const adjusted = value + (value * percent) / 100
    return Math.max(0, Math.min(255, Math.round(adjusted)))
  }

  const newR = adjust(r)
  const newG = adjust(g)
  const newB = adjust(b)

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`
}

/**
 * Get a dimmed version of a color (for unfocused nodes).
 */
export function getDimmedColor(hex: string): string {
  return adjustBrightness(hex, -30)
}

/**
 * Get a highlighted version of a color (for focused nodes).
 */
export function getHighlightedColor(hex: string): string {
  return adjustBrightness(hex, 20)
}
