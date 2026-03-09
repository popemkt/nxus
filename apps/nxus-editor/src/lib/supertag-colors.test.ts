import { describe, it, expect } from 'vitest'
import { getSupertagColor } from './supertag-colors'

describe('getSupertagColor', () => {
  it('returns a hex color string', () => {
    const color = getSupertagColor('some-id')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('is deterministic — same ID returns same color', () => {
    const color1 = getSupertagColor('test-supertag-id')
    const color2 = getSupertagColor('test-supertag-id')
    expect(color1).toBe(color2)
  })

  it('returns different colors for different IDs', () => {
    const colors = new Set([
      getSupertagColor('aaa'),
      getSupertagColor('bbb'),
      getSupertagColor('ccc'),
      getSupertagColor('ddd'),
      getSupertagColor('eee'),
    ])
    // With 5 different IDs and 12 colors, very unlikely all same
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles empty string', () => {
    const color = getSupertagColor('')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('handles UUID-like strings', () => {
    const color = getSupertagColor('550e8400-e29b-41d4-a716-446655440000')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
