import { describe, expect, it } from 'vitest'
import type { PathFilter } from '@nxus/db'
import { formatPathFilterLabel, isPathUnaryOp } from './filter-format.js'

describe('isPathUnaryOp', () => {
  it('is true for a filter with no value key (fresh/unary)', () => {
    const filter: PathFilter = { type: 'path', path: [{ fieldId: 'field:color' }], op: 'isEmpty' }
    expect(isPathUnaryOp(filter)).toBe(true)
  })

  it('is true for a filter with an explicit value: undefined (post-merge stale key)', () => {
    // Simulates FilterChip's `{ ...oldFilter, ...updates }` merge after a
    // value-op -> unary-op edit: PathFilterEditor sets `value: undefined`
    // explicitly (path-filter.tsx handleSave) rather than omitting it.
    const filter = {
      type: 'path',
      path: [{ fieldId: 'field:color' }],
      op: 'isNotEmpty',
      value: undefined,
    } as unknown as PathFilter
    expect(isPathUnaryOp(filter)).toBe(true)
  })

  it('is false for a filter with a real value', () => {
    const filter: PathFilter = {
      type: 'path',
      path: [{ fieldId: 'field:color' }],
      op: 'eq',
      value: 'Red',
    }
    expect(isPathUnaryOp(filter)).toBe(false)
  })
})

describe('formatPathFilterLabel', () => {
  it('renders a unary filter without a trailing value placeholder', () => {
    const filter: PathFilter = { type: 'path', path: [{ fieldId: 'field:color' }], op: 'isEmpty' }
    expect(formatPathFilterLabel(filter, { ascii: true })).toBe('Color is empty')
  })

  it('does not append a stray placeholder for a stale value: undefined key', () => {
    // Regression test: before the isPathUnaryOp fix this rendered
    // "Color is empty ?" because `'value' in filter` is true even when the
    // value is `undefined`.
    const filter = {
      type: 'path',
      path: [{ fieldId: 'field:color' }],
      op: 'isEmpty',
      value: undefined,
    } as unknown as PathFilter
    expect(formatPathFilterLabel(filter, { ascii: true })).toBe('Color is empty')
  })

  it('renders a value filter with its comparator and value', () => {
    const filter: PathFilter = {
      type: 'path',
      path: [{ fieldId: 'field:owner' }, { fieldId: 'field:color' }],
      op: 'eq',
      value: 'Red',
    }
    expect(formatPathFilterLabel(filter, { ascii: true })).toBe('Owner.Color = "Red"')
  })
})
