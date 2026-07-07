/**
 * filter-defaults.ts - Single source of truth for "new filter" scaffolding
 *
 * Both the top-level QueryBuilder and the (recursively nested) LogicalFilterEditor
 * need to create a placeholder filter when the user picks a type from
 * AddFilterMenu. Previously each place duplicated this switch; centralizing it
 * here is what lets logical groups recurse without drift between the two call
 * sites.
 */

import type { QueryFilter } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export type SimpleFilterType =
  | 'supertag'
  | 'property'
  | 'path'
  | 'content'
  | 'relation'
  | 'temporal'
  | 'hasField'

export type LogicalFilterType = 'and' | 'or' | 'not'

export type FilterType = SimpleFilterType | LogicalFilterType

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a default (mostly empty but schema-shaped) filter for the given type.
 *
 * `path` defaults to a single empty segment rather than `[]` because
 * `PathSegmentSchema` array requires `.min(1)` (query.ts:100,112) — an empty
 * array would fail QueryDefinitionSchema validation even as a placeholder.
 */
export function createDefaultFilter(filterType: FilterType): QueryFilter {
  const id = crypto.randomUUID().slice(0, 8)

  switch (filterType) {
    case 'supertag':
      return {
        id,
        type: 'supertag',
        supertagId: '',
        includeInherited: true,
      }
    case 'property':
      return {
        id,
        type: 'property',
        fieldId: '',
        op: 'eq',
        value: '',
      }
    case 'path':
      return {
        id,
        type: 'path',
        path: [{ fieldId: '' }],
        op: 'isEmpty',
      }
    case 'content':
      return {
        id,
        type: 'content',
        query: '',
        caseSensitive: false,
      }
    case 'relation':
      return {
        id,
        type: 'relation',
        relationType: 'childOf',
        targetNodeId: undefined,
      }
    case 'temporal':
      return {
        id,
        type: 'temporal',
        field: 'createdAt',
        op: 'within',
        days: 7,
      }
    case 'hasField':
      return {
        id,
        type: 'hasField',
        fieldId: '',
        negate: false,
      }
    case 'and':
      return {
        id,
        type: 'and',
        filters: [],
      }
    case 'or':
      return {
        id,
        type: 'or',
        filters: [],
      }
    case 'not':
      return {
        id,
        type: 'not',
        filters: [],
      }
    default: {
      const _exhaustive: never = filterType
      throw new Error(`Unknown filter type: ${String(_exhaustive)}`)
    }
  }
}
