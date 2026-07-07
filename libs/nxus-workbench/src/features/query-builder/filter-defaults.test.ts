import { describe, expect, it } from 'vitest'
import { QueryFilterSchema } from '@nxus/db'
import { createDefaultFilter } from './filter-defaults.js'

describe('createDefaultFilter', () => {
  it('creates a schema-valid placeholder for every simple filter type', () => {
    expect(createDefaultFilter('supertag')).toMatchObject({
      type: 'supertag',
      supertagId: '',
      includeInherited: true,
    })
    expect(createDefaultFilter('property')).toMatchObject({
      type: 'property',
      fieldId: '',
      op: 'eq',
    })
    expect(createDefaultFilter('content')).toMatchObject({
      type: 'content',
      query: '',
      caseSensitive: false,
    })
    expect(createDefaultFilter('relation')).toMatchObject({
      type: 'relation',
      relationType: 'childOf',
    })
    expect(createDefaultFilter('temporal')).toMatchObject({
      type: 'temporal',
      field: 'createdAt',
      op: 'within',
      days: 7,
    })
    expect(createDefaultFilter('hasField')).toMatchObject({
      type: 'hasField',
      fieldId: '',
      negate: false,
    })
  })

  it('creates a path filter with a non-empty path array (schema requires .min(1))', () => {
    const filter = createDefaultFilter('path')
    expect(filter.type).toBe('path')
    if (filter.type !== 'path') throw new Error('expected path filter')
    expect(filter.path).toHaveLength(1)
    expect(filter.path[0]).toEqual({ fieldId: '' })
    expect(filter.op).toBe('isEmpty')
  })

  it('creates empty and/or/not groups so nested "Add filter" starts from zero', () => {
    for (const type of ['and', 'or', 'not'] as const) {
      const filter = createDefaultFilter(type)
      expect(filter).toMatchObject({ type, filters: [] })
    }
  })

  it('assigns a fresh id to every created filter', () => {
    const a = createDefaultFilter('property')
    const b = createDefaultFilter('property')
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
  })

  it('produces filters that validate against QueryFilterSchema for every filter type', () => {
    const types = [
      'supertag',
      'property',
      'path',
      'content',
      'relation',
      'temporal',
      'hasField',
      'and',
      'or',
      'not',
    ] as const

    for (const type of types) {
      const result = QueryFilterSchema.safeParse(createDefaultFilter(type))
      expect(result.success, `${type} default filter should be schema-valid`).toBe(true)
    }
  })
})
