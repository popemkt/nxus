/**
 * query-seed.ts — pure helpers for query-evaluator candidate seeding
 * (spec/tech/persistence.md §10), shared by the sync SQLite evaluator and
 * SurrealBackend.evaluateQuery so the "required supertag" definition can
 * never drift between backends.
 *
 * A supertag filter is REQUIRED when it must hold for every result:
 * top-level filters are ANDed, and `and` branches preserve requiredness
 * recursively. A supertag under `or`/`not` is NOT required and MUST NOT
 * narrow the seed.
 */

import type { QueryFilter, SupertagFilter } from '../types/query.js'

export function findRequiredSupertagFilter(
  filters: QueryFilter[],
): SupertagFilter | null {
  for (const filter of filters) {
    const required = findRequiredSupertagInConjunction(filter)
    if (required) return required
  }

  return null
}

function findRequiredSupertagInConjunction(
  filter: QueryFilter,
): SupertagFilter | null {
  if (filter.type === 'supertag') {
    return filter
  }

  if (filter.type !== 'and') {
    return null
  }

  for (const subFilter of filter.filters) {
    const required = findRequiredSupertagInConjunction(subFilter)
    if (required) return required
  }

  return null
}
