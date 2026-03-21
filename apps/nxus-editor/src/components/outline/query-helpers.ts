import type { QueryDefinition } from '@nxus/db'
import { QUERY_SYSTEM_ID, QUERY_FIELD_SYSTEM_IDS } from '@/types/outline'
import type { OutlineNode, OutlineField } from '@/types/outline'

/**
 * Query key factory for outline query evaluations.
 * Used by query invalidation in use-outline-sync.
 */
export const outlineQueryKeys = {
  all: ['outline-query'] as const,
  evaluation: (definitionKey: string) =>
    ['outline-query', 'evaluation', definitionKey] as const,
}

/** Stable JSON key for query definition identity */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/** Type guard: does this value look like a valid QueryDefinition? */
export function isQueryDefinition(value: unknown): value is QueryDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'filters' in value &&
    Array.isArray((value as QueryDefinition).filters)
  )
}

/** Does this node have the #Query supertag? */
export function isQueryNode(node: OutlineNode): boolean {
  return node.supertags.some((t) => t.systemId === QUERY_SYSTEM_ID)
}

/** Extract the query definition from a query node's fields.
 *  The value may arrive as a JSON string from the DB — parse it if so. */
export function extractQueryDefinition(
  node: OutlineNode,
): unknown | undefined {
  const raw = node.fields.find(
    (f) => f.fieldSystemId === 'field:query_definition',
  )?.values[0]?.value
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  return raw
}

/** Filter out query-internal fields (definition, sort, limit) for display */
export function getVisibleFields(
  fields: OutlineField[],
  isQuery: boolean,
): OutlineField[] {
  if (!isQuery) return fields
  return fields.filter(
    (f) => !f.fieldSystemId || !QUERY_FIELD_SYSTEM_IDS.has(f.fieldSystemId),
  )
}
