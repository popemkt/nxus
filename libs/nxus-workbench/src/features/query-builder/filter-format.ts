import { UUID_REGEX, type FilterOp, type PathFilter, type PathSegment } from '@nxus/db'

interface FormatOperatorOptions {
  ascii?: boolean
}

interface FormatValueOptions {
  emptyPlaceholder?: string
  quoteStrings?: boolean
  truncateAt?: number
}

interface FormatPathFilterOptions {
  ascii?: boolean
  emptyPlaceholder?: string
  includeWhere?: boolean
  quoteStrings?: boolean
  truncateAt?: number
}

/**
 * Format a field or supertag identifier for display.
 *
 * UUID-backed custom fields currently have no lookup context in this UI layer,
 * so they intentionally fall back to a neutral placeholder.
 */
export function formatFilterIdentifier(identifier: string | undefined): string {
  if (!identifier) return '?'
  if (UUID_REGEX.test(identifier)) return '?'

  const parts = identifier.split(':')
  const name = parts[parts.length - 1] ?? ''
  if (!name) return '?'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function formatFilterOperator(
  op: FilterOp,
  { ascii = false }: FormatOperatorOptions = {},
): string {
  const opLabels: Record<FilterOp, string> = ascii
    ? {
        eq: '=',
        neq: '!=',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
        contains: 'contains',
        startsWith: 'starts with',
        endsWith: 'ends with',
        isEmpty: 'is empty',
        isNotEmpty: 'is not empty',
      }
    : {
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

export function formatFilterValue(
  value: unknown,
  {
    emptyPlaceholder = '?',
    quoteStrings = true,
    truncateAt,
  }: FormatValueOptions = {},
): string {
  if (value === undefined || value === null) {
    return emptyPlaceholder
  }
  if (typeof value === 'string') {
    const rendered = truncateAt && value.length > truncateAt
      ? `${value.slice(0, truncateAt)}...`
      : value

    return quoteStrings ? `"${rendered}"` : rendered
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

export function formatPathSegments(path: PathSegment[]): string {
  if (path.length === 0) return '?'
  return path.map((segment) => formatFilterIdentifier(segment.fieldId)).join('.')
}

export function formatPathFilterLabel(
  filter: PathFilter,
  {
    ascii = false,
    emptyPlaceholder = '?',
    includeWhere = false,
    quoteStrings = true,
    truncateAt,
  }: FormatPathFilterOptions = {},
): string {
  const prefix = includeWhere ? 'where ' : ''
  const path = formatPathSegments(filter.path)

  if (filter.op === 'isEmpty' || filter.op === 'isNotEmpty') {
    return `${prefix}${path} ${formatFilterOperator(filter.op, { ascii })}`
  }

  return `${prefix}${path} ${formatFilterOperator(filter.op, { ascii })} ${formatFilterValue(filter.value, {
    emptyPlaceholder,
    quoteStrings,
    truncateAt,
  })}`
}
