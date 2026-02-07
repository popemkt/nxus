import { describe, it, expect } from 'vitest'
import { cn } from './utils.js'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('handles undefined and null values', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('merges tailwind classes (last wins)', () => {
    // tailwind-merge should resolve conflicts
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('preserves non-conflicting tailwind classes', () => {
    expect(cn('p-4', 'mt-2')).toBe('p-4 mt-2')
  })

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })

  it('passes through non-tailwind duplicate classes', () => {
    // clsx + tailwind-merge doesn't deduplicate non-tailwind classes
    expect(cn('foo', 'foo')).toBe('foo foo')
  })

  it('handles complex tailwind conflicts', () => {
    // More specific utilities should win
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})
