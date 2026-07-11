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

export interface SupertagThemeColor {
  bg: string
  fg: string
}

export interface SupertagColorPair {
  light: SupertagThemeColor
  dark: SupertagThemeColor
}

/**
 * Derives both theme renderings from one stored color. A numeric value (or a
 * numeric string, optionally suffixed with `deg`) is treated as a hue. Hex
 * colors retain their hue and contribute their saturation to the transform.
 */
export function getSupertagColorPair(color: string | number): SupertagColorPair {
  const { hue, saturation } = parseColor(color)
  const lightSaturation = clamp(saturation, 52, 82)
  const darkSaturation = clamp(saturation * 0.9, 48, 76)

  return {
    light: {
      bg: hsl(hue, lightSaturation * 0.7, 94),
      fg: hsl(hue, lightSaturation, 38),
    },
    dark: {
      bg: hsl(hue, darkSaturation * 0.65, 22),
      fg: hsl(hue, darkSaturation, 72),
    },
  }
}

function parseColor(color: string | number): { hue: number; saturation: number } {
  if (typeof color === 'number') {
    return { hue: normalizeHue(color), saturation: 70 }
  }

  const trimmed = color.trim()
  const hueMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)(?:deg)?$/i)
  if (hueMatch) {
    return { hue: normalizeHue(Number(hueMatch[1])), saturation: 70 }
  }

  const hexMatch = trimmed.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (!hexMatch) {
    throw new Error(`Unsupported supertag color: ${color}`)
  }

  const compact = hexMatch[1]!
  const expanded = compact.length === 3
    ? compact.split('').map((digit) => digit + digit).join('')
    : compact
  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) return { hue: 0, saturation: 0 }

  let hue: number
  if (max === red) hue = 60 * (((green - blue) / delta) % 6)
  else if (max === green) hue = 60 * ((blue - red) / delta + 2)
  else hue = 60 * ((red - green) / delta + 4)

  const saturation = delta / (1 - Math.abs(2 * lightness - 1)) * 100
  return { hue: normalizeHue(hue), saturation }
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${round(hue)} ${round(saturation)}% ${lightness}%)`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
