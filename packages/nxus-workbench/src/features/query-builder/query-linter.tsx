/**
 * QueryLinter - Display query definition as human-readable plain text
 *
 * Renders a query definition in a format similar to Tana's linter,
 * making it easy to understand what the query is searching for.
 *
 * Example output:
 * "Nodes with #Item AND type = tool AND created in last 7 days"
 */

import { cn } from '@nxus/ui'
import type {
  QueryDefinition,
  QueryFilter,
  FilterOp,
  SupertagFilter,
  PropertyFilter,
  ContentFilter,
  RelationFilter,
  TemporalFilter,
  HasFieldFilter,
  LogicalFilter,
} from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface QueryLinterProps {
  /** The query definition to display */
  query: QueryDefinition
  /** Additional class names */
  className?: string
  /** Compact mode */
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

export function QueryLinter({ query, className, compact = false }: QueryLinterProps) {
  const hasFilters = query.filters.length > 0
  const hasSort = !!query.sort

  // Generate query description
  const queryText = generateQueryText(query)

  return (
    <div
      className={cn(
        'font-mono leading-relaxed',
        compact ? 'text-[10px]' : 'text-xs',
        'text-muted-foreground',
        className,
      )}
    >
      {hasFilters ? (
        <span>{queryText}</span>
      ) : (
        <span className="italic">All nodes</span>
      )}

      {/* Sort info */}
      {hasSort && (
        <span className="text-muted-foreground/70">
          {' '}
          <span className="text-accent-foreground">sorted by</span>{' '}
          {formatSortField(query.sort!.field)}{' '}
          {query.sort!.direction === 'asc' ? '↑' : '↓'}
        </span>
      )}

      {/* Limit info */}
      {query.limit && query.limit !== 500 && (
        <span className="text-muted-foreground/70">
          {' '}
          <span className="text-accent-foreground">limit</span> {query.limit}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Text Generation
// ============================================================================

/**
 * Generate human-readable text for a query definition
 */
function generateQueryText(query: QueryDefinition): string {
  if (query.filters.length === 0) {
    return 'All nodes'
  }

  // Top-level filters are implicitly ANDed
  const filterTexts = query.filters.map((filter) => formatFilter(filter))

  if (filterTexts.length === 1) {
    return `Nodes ${filterTexts[0]}`
  }

  return `Nodes ${filterTexts.join(' AND ')}`
}

/**
 * Format a single filter as text
 */
function formatFilter(filter: QueryFilter): string {
  switch (filter.type) {
    case 'supertag':
      return formatSupertagFilter(filter)
    case 'property':
      return formatPropertyFilter(filter)
    case 'content':
      return formatContentFilter(filter)
    case 'relation':
      return formatRelationFilter(filter)
    case 'temporal':
      return formatTemporalFilter(filter)
    case 'hasField':
      return formatHasFieldFilter(filter)
    case 'and':
    case 'or':
    case 'not':
      return formatLogicalFilter(filter)
    default:
      return '[unknown filter]'
  }
}

/**
 * Format supertag filter
 */
function formatSupertagFilter(filter: SupertagFilter): string {
  const supertagName = formatSystemId(filter.supertagId || '?')
  const inherited = filter.includeInherited ? '+' : ''
  return `with #${supertagName}${inherited}`
}

/**
 * Format property filter
 */
function formatPropertyFilter(filter: PropertyFilter): string {
  const fieldName = formatSystemId(filter.fieldId || '?')
  const op = formatOperator(filter.op)
  const value = formatValue(filter.value)

  // Handle operators that don't need a value
  if (filter.op === 'isEmpty') {
    return `where ${fieldName} is empty`
  }
  if (filter.op === 'isNotEmpty') {
    return `where ${fieldName} is not empty`
  }

  return `where ${fieldName} ${op} ${value}`
}

/**
 * Format content filter
 */
function formatContentFilter(filter: ContentFilter): string {
  const caseSensitive = filter.caseSensitive ? ' (case-sensitive)' : ''
  return `containing "${filter.query || '?'}"${caseSensitive}`
}

/**
 * Format relation filter
 */
function formatRelationFilter(filter: RelationFilter): string {
  const relationLabels: Record<string, string> = {
    childOf: 'child of',
    ownedBy: 'owned by',
    linksTo: 'linking to',
    linkedFrom: 'linked from',
  }

  const relation = relationLabels[filter.relationType] || filter.relationType

  if (filter.targetNodeId) {
    return `${relation} node ${filter.targetNodeId.slice(0, 8)}...`
  }

  return `${relation} any`
}

/**
 * Format temporal filter
 */
function formatTemporalFilter(filter: TemporalFilter): string {
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

/**
 * Format hasField filter
 */
function formatHasFieldFilter(filter: HasFieldFilter): string {
  const fieldName = formatSystemId(filter.fieldSystemId || '?')
  return filter.negate ? `missing ${fieldName}` : `having ${fieldName}`
}

/**
 * Format logical filter
 */
function formatLogicalFilter(filter: LogicalFilter): string {
  const nestedTexts = filter.filters.map((f) => formatFilter(f))

  if (nestedTexts.length === 0) {
    return '[empty group]'
  }

  switch (filter.type) {
    case 'and':
      return `(${nestedTexts.join(' AND ')})`
    case 'or':
      return `(${nestedTexts.join(' OR ')})`
    case 'not':
      return `NOT (${nestedTexts.join(' AND ')})`
    default:
      return '[unknown logical]'
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a system ID for display (e.g., "supertag:item" -> "Item")
 */
function formatSystemId(systemId: string): string {
  const parts = systemId.split(':')
  const name = parts[parts.length - 1] ?? ''
  if (!name) return systemId || '?'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Format a filter operator for display
 */
function formatOperator(op: FilterOp): string {
  const opLabels: Record<FilterOp, string> = {
    eq: '=',
    neq: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    contains: 'contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    isEmpty: 'is empty',
    isNotEmpty: 'is not empty',
  }
  return opLabels[op] || op
}

/**
 * Format a filter value for display
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '?'
  }
  if (typeof value === 'string') {
    return `"${value}"`
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

/**
 * Format a sort field for display
 */
function formatSortField(field: string): string {
  if (field === 'content') return 'name'
  if (field === 'createdAt') return 'created'
  if (field === 'updatedAt') return 'updated'
  return formatSystemId(field)
}
