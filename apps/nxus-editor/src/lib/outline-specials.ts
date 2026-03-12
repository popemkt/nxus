import {
  QueryDefinitionSchema,
  type QueryDefinition,
  type QueryFilter,
} from '@nxus/db'
import type {
  OutlineNode,
  OutlineQuerySpecial,
  OutlineSpecial,
  SupertagBadge,
} from '@/types/outline'

export const QUERY_SUPERTAG_SYSTEM_ID = 'supertag:query'

export function createDefaultQueryDefinition(): QueryDefinition {
  return QueryDefinitionSchema.parse({})
}

export function hasSpecialContent(node: Pick<OutlineNode, 'special'>): boolean {
  return node.special !== null
}

export function getQuerySpecial(
  node: Pick<OutlineNode, 'special'>,
): OutlineQuerySpecial | null {
  return node.special?.kind === 'query' ? node.special : null
}

export function extractOutlineSpecial(input: {
  supertags: Array<Pick<SupertagBadge, 'systemId'>>
  queryDefinition?: unknown
}): OutlineSpecial | null {
  if (!input.supertags.some((tag) => tag.systemId === QUERY_SUPERTAG_SYSTEM_ID)) {
    return null
  }

  const parsedDefinition = QueryDefinitionSchema.safeParse(input.queryDefinition)

  return {
    kind: 'query',
    definition: parsedDefinition.success
      ? parsedDefinition.data
      : createDefaultQueryDefinition(),
  }
}

export function formatQueryDefinition(query: QueryDefinition): string {
  if (query.filters.length === 0) {
    return 'All nodes'
  }

  const filterTexts = query.filters.map((filter: QueryFilter) =>
    formatFilter(filter),
  )
  const base =
    filterTexts.length === 1
      ? `Nodes ${filterTexts[0]}`
      : `Nodes ${filterTexts.join(' AND ')}`

  const sortText = query.sort
    ? ` sorted by ${formatSortField(query.sort.field)} ${query.sort.direction === 'asc' ? '↑' : '↓'}`
    : ''
  const limitText =
    query.limit && query.limit !== 500 ? ` limit ${query.limit}` : ''

  return `${base}${sortText}${limitText}`
}

function formatFilter(filter: QueryFilter): string {
  switch (filter.type) {
    case 'supertag':
      return `with #${formatSystemId(filter.supertagId)}${filter.includeInherited ? '+' : ''}`
    case 'property':
      if (filter.op === 'isEmpty') return `where ${formatSystemId(filter.fieldId)} is empty`
      if (filter.op === 'isNotEmpty') return `where ${formatSystemId(filter.fieldId)} is not empty`
      return `where ${formatSystemId(filter.fieldId)} ${formatOperator(filter.op)} ${formatValue(filter.value)}`
    case 'content':
      return `containing "${filter.query || '?'}"${filter.caseSensitive ? ' (case-sensitive)' : ''}`
    case 'relation':
      return `${formatRelationType(filter.relationType)} ${
        filter.targetNodeId ? `node ${filter.targetNodeId.slice(0, 8)}...` : 'any'
      }`
    case 'temporal':
      return formatTemporalFilter(filter)
    case 'hasField':
      return filter.negate
        ? `missing ${formatSystemId(filter.fieldId)}`
        : `having ${formatSystemId(filter.fieldId)}`
    case 'and':
      return `(${filter.filters.map((nested: QueryFilter) => formatFilter(nested)).join(' AND ')})`
    case 'or':
      return `(${filter.filters.map((nested: QueryFilter) => formatFilter(nested)).join(' OR ')})`
    case 'not':
      return `NOT (${filter.filters.map((nested: QueryFilter) => formatFilter(nested)).join(' AND ')})`
    default:
      return '[unknown filter]'
  }
}

function formatTemporalFilter(
  filter: Extract<QueryDefinition['filters'][number], { type: 'temporal' }>,
): string {
  const fieldLabel = filter.field === 'createdAt' ? 'created' : 'updated'

  switch (filter.op) {
    case 'within':
      return `${fieldLabel} in last ${filter.days} ${filter.days === 1 ? 'day' : 'days'}`
    case 'before':
      return `${fieldLabel} before ${filter.date || '?'}`
    case 'after':
      return `${fieldLabel} after ${filter.date || '?'}`
    default:
      return fieldLabel
  }
}

function formatRelationType(relationType: string): string {
  switch (relationType) {
    case 'childOf':
      return 'child of'
    case 'ownedBy':
      return 'owned by'
    case 'linksTo':
      return 'linking to'
    case 'linkedFrom':
      return 'linked from'
    default:
      return relationType
  }
}

function formatOperator(op: string): string {
  switch (op) {
    case 'eq':
      return '='
    case 'neq':
      return '!='
    case 'gt':
      return '>'
    case 'gte':
      return '>='
    case 'lt':
      return '<'
    case 'lte':
      return '<='
    case 'contains':
      return 'contains'
    case 'startsWith':
      return 'starts with'
    case 'endsWith':
      return 'ends with'
    default:
      return op
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (value === undefined) {
    return '?'
  }
  return String(value)
}

function formatSortField(field: string): string {
  if (field === 'createdAt' || field === 'updatedAt' || field === 'content') {
    return field
  }
  return formatSystemId(field)
}

function formatSystemId(systemId: string): string {
  const parts = systemId.split(':')
  const name = parts[parts.length - 1] ?? ''
  if (!name) return systemId || '?'
  return name.charAt(0).toUpperCase() + name.slice(1)
}
