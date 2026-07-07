const ORDER_KEY_WIDTH = 8

export function parseOrderKey(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null
  }
  if (typeof value !== 'string' || value.length === 0) return null
  if (!/^\d+$/.test(value)) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function orderKeyToNumber(value: string | number): number {
  const parsed = parseOrderKey(value)
  if (parsed === null) {
    throw new Error(`Invalid order key: ${String(value)}`)
  }
  return parsed
}

export function formatOrderKey(value: string | number | null | undefined): string {
  const parsed = parseOrderKey(value) ?? 0
  return String(parsed).padStart(ORDER_KEY_WIDTH, '0')
}

export function compareOrderKeys(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aParsed = parseOrderKey(a)
  const bParsed = parseOrderKey(b)
  if (aParsed !== null && bParsed !== null) return aParsed - bParsed
  if (aParsed !== null) return -1
  if (bParsed !== null) return 1
  return String(a ?? '').localeCompare(String(b ?? ''))
}
