import { describe, expect, it } from 'vitest'
import {
  createDefaultQueryDefinition,
  extractOutlineSpecial,
  formatQueryDefinition,
} from './outline-specials'

describe('outline specials', () => {
  it('detects query nodes and preserves a valid definition', () => {
    const special = extractOutlineSpecial({
      supertags: [{ systemId: 'supertag:query' }],
      queryDefinition: {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        limit: 25,
      },
    })

    expect(special).toEqual({
      kind: 'query',
      definition: {
        filters: [{ type: 'supertag', supertagId: 'supertag:task', includeInherited: true }],
        limit: 25,
      },
    })
  })

  it('falls back to an empty query definition when stored data is invalid', () => {
    const special = extractOutlineSpecial({
      supertags: [{ systemId: 'supertag:query' }],
      queryDefinition: { filters: 'nope' },
    })

    expect(special).toEqual({
      kind: 'query',
      definition: createDefaultQueryDefinition(),
    })
  })

  it('ignores non-special nodes', () => {
    const special = extractOutlineSpecial({
      supertags: [{ systemId: 'supertag:item' }],
      queryDefinition: {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      },
    })

    expect(special).toBeNull()
  })

  it('formats a query definition into readable summary text', () => {
    const text = formatQueryDefinition({
      filters: [
        { type: 'supertag', supertagId: 'supertag:task', includeInherited: true },
        { type: 'property', fieldId: 'field:status', op: 'eq', value: 'open' },
      ],
      sort: { field: 'updatedAt', direction: 'desc' },
      limit: 10,
    })

    expect(text).toBe(
      'Nodes with #Task+ AND where Status = "open" sorted by updatedAt ↓ limit 10',
    )
  })
})
