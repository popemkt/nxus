import { describe, it, expect } from 'vitest'
import {
  outlineQueryKeys,
  safeStringify,
  isQueryDefinition,
  isQueryNode,
  extractQueryDefinition,
  getVisibleFields,
} from './query-helpers'
import type { OutlineNode, OutlineField } from '@/types/outline'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<OutlineNode> = {}): OutlineNode {
  return {
    id: 'test-id',
    content: 'Test node',
    parentId: null,
    children: [],
    order: '00001000',
    collapsed: false,
    supertags: [],
    fields: [],
    ...overrides,
  }
}

function makeField(overrides: Partial<OutlineField> = {}): OutlineField {
  return {
    fieldId: 'f1',
    fieldName: 'Test Field',
    fieldNodeId: 'fn1',
    fieldSystemId: null,
    fieldType: 'text',
    values: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// outlineQueryKeys
// ---------------------------------------------------------------------------

describe('outlineQueryKeys', () => {
  it('returns stable "all" key', () => {
    expect(outlineQueryKeys.all).toEqual(['outline-query'])
  })

  it('returns evaluation key with definition hash', () => {
    expect(outlineQueryKeys.evaluation('abc')).toEqual([
      'outline-query',
      'evaluation',
      'abc',
    ])
  })
})

// ---------------------------------------------------------------------------
// safeStringify
// ---------------------------------------------------------------------------

describe('safeStringify', () => {
  it('serializes plain objects', () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}')
  })

  it('serializes arrays', () => {
    expect(safeStringify([1, 2])).toBe('[1,2]')
  })

  it('returns empty string for circular references', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(safeStringify(obj)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(safeStringify(undefined)).toBe('')
  })

  it('serializes null', () => {
    expect(safeStringify(null)).toBe('null')
  })
})

// ---------------------------------------------------------------------------
// isQueryDefinition
// ---------------------------------------------------------------------------

describe('isQueryDefinition', () => {
  it('returns true for valid definition with filters array', () => {
    expect(
      isQueryDefinition({ filters: [], limit: 500 }),
    ).toBe(true)
  })

  it('returns true for definition with populated filters', () => {
    expect(
      isQueryDefinition({
        filters: [{ type: 'supertag', supertagId: 'supertag:inbox' }],
        limit: 100,
      }),
    ).toBe(true)
  })

  it('returns false for null', () => {
    expect(isQueryDefinition(null)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isQueryDefinition('not a definition')).toBe(false)
  })

  it('returns false for object without filters', () => {
    expect(isQueryDefinition({ limit: 10 })).toBe(false)
  })

  it('returns false for object with non-array filters', () => {
    expect(isQueryDefinition({ filters: 'string' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isQueryNode
// ---------------------------------------------------------------------------

describe('isQueryNode', () => {
  it('returns true when node has supertag:query', () => {
    const node = makeNode({
      supertags: [
        { id: 'st1', name: 'Query', color: null, systemId: 'supertag:query' },
      ],
    })
    expect(isQueryNode(node)).toBe(true)
  })

  it('returns false for node without query supertag', () => {
    const node = makeNode({
      supertags: [
        { id: 'st2', name: 'Item', color: null, systemId: 'supertag:item' },
      ],
    })
    expect(isQueryNode(node)).toBe(false)
  })

  it('returns false for node with no supertags', () => {
    expect(isQueryNode(makeNode())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// extractQueryDefinition
// ---------------------------------------------------------------------------

describe('extractQueryDefinition', () => {
  it('extracts definition from field:query_definition field', () => {
    const def = { filters: [], limit: 500 }
    const node = makeNode({
      fields: [
        makeField({
          fieldSystemId: 'field:query_definition',
          values: [{ value: def, order: 0 }],
        }),
      ],
    })
    expect(extractQueryDefinition(node)).toBe(def)
  })

  it('returns undefined when field is not present', () => {
    const node = makeNode({
      fields: [
        makeField({ fieldSystemId: 'field:query_sort', values: [] }),
      ],
    })
    expect(extractQueryDefinition(node)).toBeUndefined()
  })

  it('returns undefined when field has no values', () => {
    const node = makeNode({
      fields: [
        makeField({ fieldSystemId: 'field:query_definition', values: [] }),
      ],
    })
    expect(extractQueryDefinition(node)).toBeUndefined()
  })

  it('returns undefined when node has no fields', () => {
    expect(extractQueryDefinition(makeNode())).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getVisibleFields
// ---------------------------------------------------------------------------

describe('getVisibleFields', () => {
  const userField = makeField({ fieldSystemId: 'field:status' })
  const queryDefField = makeField({ fieldSystemId: 'field:query_definition' })
  const querySortField = makeField({ fieldSystemId: 'field:query_sort' })
  const queryLimitField = makeField({ fieldSystemId: 'field:query_limit' })
  const nullSystemIdField = makeField({ fieldSystemId: null })

  it('returns all fields for non-query nodes', () => {
    const fields = [userField, queryDefField, querySortField]
    expect(getVisibleFields(fields, false)).toEqual(fields)
  })

  it('filters out query-internal fields for query nodes', () => {
    const fields = [userField, queryDefField, querySortField, queryLimitField, nullSystemIdField]
    const visible = getVisibleFields(fields, true)
    expect(visible).toEqual([userField, nullSystemIdField])
  })

  it('keeps fields with null systemId for query nodes', () => {
    const fields = [nullSystemIdField]
    expect(getVisibleFields(fields, true)).toEqual([nullSystemIdField])
  })

  it('returns empty array when all fields are query-internal', () => {
    const fields = [queryDefField, querySortField, queryLimitField]
    expect(getVisibleFields(fields, true)).toEqual([])
  })
})
