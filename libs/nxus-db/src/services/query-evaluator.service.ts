/**
 * query-evaluator.service.ts - Core query evaluation engine
 *
 * This module evaluates QueryDefinition objects against the node database,
 * returning matching AssembledNode results. It supports:
 *
 * - Supertag filters (with inheritance)
 * - Property/field value comparisons
 * - Content full-text search
 * - Has field checks
 * - Temporal filters (createdAt, updatedAt)
 * - Relation filters (childOf, ownedBy, linksTo, linkedFrom)
 * - Logical operators (AND, OR, NOT)
 *
 * All filters are pure functions with no side effects.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDatabase } from '../client/master-client.js'
import { nodeProperties, nodes, SYSTEM_FIELDS } from '../schemas/node-schema.js'
import type {
  ContentFilter,
  FilterOp,
  HasFieldFilter,
  LogicalFilter,
  PathFilter,
  PropertyFilter,
  QueryDefinition,
  QueryFilter,
  QuerySort,
  RelationFilter,
  SupertagFilter,
  TemporalFilter,
} from '../types/query.js'
import { UUID_REGEX } from '../types/common.js'
import {
  assembleNodes,
  getFieldOrSupertagNode,
  getNodeIdsBySupertagWithInheritance,
  getSystemNode,
  type AssembledNode,
} from './node.service.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Database type used throughout the evaluator
 */
type Database = ReturnType<typeof getDatabase>

/**
 * Query evaluation result
 */
export interface QueryEvaluationResult {
  nodes: AssembledNode[]
  totalCount: number // Count before limit applied
  evaluatedAt: Date
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Evaluate a query definition and return matching nodes
 *
 * @param db - Database instance
 * @param definition - Query definition with filters, sort, and limit
 * @returns Matching nodes with metadata
 */
export function evaluateQuery(
  db: Database,
  definition: QueryDefinition,
): QueryEvaluationResult {
  const evaluatedAt = new Date()

  // 1. Start with all non-deleted node IDs
  let candidateIds = getAllNonDeletedNodeIds(db)

  // 2. Apply each filter (top-level filters are AND'd together)
  for (const filter of definition.filters) {
    candidateIds = evaluateFilter(db, filter, candidateIds)
    // Short-circuit if no candidates remain
    if (candidateIds.size === 0) {
      return { nodes: [], totalCount: 0, evaluatedAt }
    }
  }

  const totalCount = candidateIds.size

  // 3. Assemble nodes (batch — 4 queries instead of N * (2+M+K))
  let assembledNodes = assembleNodes(db, Array.from(candidateIds))

  // 4. Apply sorting
  if (definition.sort) {
    assembledNodes = sortNodes(db, assembledNodes, definition.sort)
  }

  // 5. Apply limit
  const limit = definition.limit ?? 500
  if (assembledNodes.length > limit) {
    assembledNodes = assembledNodes.slice(0, limit)
  }

  return {
    nodes: assembledNodes,
    totalCount,
    evaluatedAt,
  }
}

// ============================================================================
// Filter Dispatcher
// ============================================================================

/**
 * Evaluate a single filter against candidate node IDs
 *
 * @param db - Database instance
 * @param filter - Filter to evaluate
 * @param candidateIds - Set of node IDs to filter
 * @returns Filtered set of node IDs
 */
export function evaluateFilter(
  db: Database,
  filter: QueryFilter,
  candidateIds: Set<string>,
): Set<string> {
  switch (filter.type) {
    case 'supertag':
      return evaluateSupertagFilter(db, filter, candidateIds)
    case 'property':
      return evaluatePropertyFilter(db, filter, candidateIds)
    case 'path':
      return evaluatePathFilter(db, filter, candidateIds)
    case 'content':
      return evaluateContentFilter(db, filter, candidateIds)
    case 'hasField':
      return evaluateHasFieldFilter(db, filter, candidateIds)
    case 'temporal':
      return evaluateTemporalFilter(db, filter, candidateIds)
    case 'relation':
      return evaluateRelationFilter(db, filter, candidateIds)
    case 'and':
    case 'or':
    case 'not':
      return evaluateLogicalFilter(db, filter, candidateIds)
    default:
      // Exhaustive check
      const _exhaustive: never = filter
      throw new Error(`Unknown filter type: ${(_exhaustive as QueryFilter).type}`)
  }
}

// ============================================================================
// Supertag Filter
// ============================================================================

/**
 * Filter nodes that have a specific supertag
 *
 * When includeInherited=true, also matches nodes with supertags that extend
 * the target supertag (via field:extends inheritance chain).
 */
export function evaluateSupertagFilter(
  db: Database,
  filter: SupertagFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { supertagId, includeInherited = true } = filter

  // Get all node IDs with this supertag (optionally with inheritance)
  let matchingIds: string[]
  if (includeInherited) {
    matchingIds = getNodeIdsBySupertagWithInheritance(db, supertagId)
  } else {
    // Direct match only - no inheritance
    matchingIds = getNodeIdsByDirectSupertag(db, supertagId)
  }

  // Intersect with candidates
  const result = new Set<string>()
  for (const id of matchingIds) {
    if (candidateIds.has(id)) {
      result.add(id)
    }
  }

  return result
}

/**
 * Get node IDs with a specific supertag (no inheritance)
 */
function getNodeIdsByDirectSupertag(
  db: Database,
  supertagId: string,
): string[] {
  const targetSupertag = getFieldOrSupertagNode(db, supertagId)
  if (!targetSupertag) return []

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  // Direct match using compound WHERE + value index
  const props = db
    .select({ nodeId: nodeProperties.nodeId })
    .from(nodeProperties)
    .where(and(
      eq(nodeProperties.fieldNodeId, supertagField.id),
      eq(nodeProperties.value, JSON.stringify(targetSupertag.id)),
    ))
    .all()

  return props.map((p) => p.nodeId)
}

// ============================================================================
// Property Filter
// ============================================================================

/**
 * Filter nodes by field value comparison
 *
 * Supports operators: eq, neq, gt, gte, lt, lte, contains, startsWith,
 * endsWith, isEmpty, isNotEmpty
 */
export function evaluatePropertyFilter(
  db: Database,
  filter: PropertyFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { fieldId, op, value } = filter

  const field = getFieldOrSupertagNode(db, fieldId)
  if (!field) {
    // Unknown field - return empty set
    return new Set()
  }

  const nodePropsMap = getParsedPropertiesForField(db, field.id, candidateIds)

  // For isEmpty/isNotEmpty, we need to consider nodes without the property
  if (op === 'isEmpty') {
    const result = new Set<string>()
    for (const id of candidateIds) {
      const values = nodePropsMap.get(id)
      if (!values || values.every(isEmptyValue)) {
        result.add(id)
      }
    }
    return result
  }

  if (op === 'isNotEmpty') {
    const result = new Set<string>()
    for (const id of candidateIds) {
      const values = nodePropsMap.get(id)
      if (values?.some((v) => !isEmptyValue(v))) {
        result.add(id)
      }
    }
    return result
  }

  // For other operators, check if any value matches
  const result = new Set<string>()
  for (const [nodeId, values] of nodePropsMap) {
    if (values.some((v) => compareValues(v, op, value))) {
      result.add(nodeId)
    }
  }

  return result
}

/**
 * Filter nodes by recursively traversing field references.
 *
 * Semantics:
 * - Each non-terminal segment is treated as a reference hop
 * - A candidate matches if any branch reaches a terminal value that satisfies
 *   the comparison
 */
export function evaluatePathFilter(
  db: Database,
  filter: PathFilter,
  candidateIds: Set<string>,
): Set<string> {
  const resolvedPath = filter.path.map((segment) =>
    getFieldOrSupertagNode(db, segment.fieldId),
  )

  if (resolvedPath.some((segment) => !segment)) {
    return new Set()
  }

  let frontier = new Map<string, Set<string>>()
  for (const candidateId of candidateIds) {
    frontier.set(candidateId, new Set([candidateId]))
  }

  for (const segment of resolvedPath.slice(0, -1)) {
    if (!segment || frontier.size === 0) {
      return new Set()
    }

    const stepValues = getParsedPropertiesForField(
      db,
      segment.id,
      new Set(frontier.keys()),
    )

    const nextRaw = new Map<string, Set<string>>()
    for (const [sourceNodeId, values] of stepValues) {
      const roots = frontier.get(sourceNodeId)
      if (!roots) continue

      for (const refId of extractReferenceIds(values)) {
        const existingRoots = nextRaw.get(refId)
        if (existingRoots) {
          for (const rootId of roots) {
            existingRoots.add(rootId)
          }
        } else {
          nextRaw.set(refId, new Set(roots))
        }
      }
    }

    if (nextRaw.size === 0) {
      return new Set()
    }

    const existingIds = getExistingNodeIds(db, new Set(nextRaw.keys()))
    frontier = new Map()
    for (const nodeId of existingIds) {
      const roots = nextRaw.get(nodeId)
      if (roots) {
        frontier.set(nodeId, roots)
      }
    }
  }

  const terminalSegment = resolvedPath[resolvedPath.length - 1]
  if (!terminalSegment || frontier.size === 0) {
    return new Set()
  }

  const terminalValues = getParsedPropertiesForField(
    db,
    terminalSegment.id,
    new Set(frontier.keys()),
  )

  const result = new Set<string>()
  for (const [nodeId, roots] of frontier) {
    const values = terminalValues.get(nodeId)

    if (filter.op === 'isEmpty') {
      if (!values || values.every(isEmptyValue)) {
        for (const rootId of roots) {
          result.add(rootId)
        }
      }
      continue
    }

    if (filter.op === 'isNotEmpty') {
      if (values?.some((value) => !isEmptyValue(value))) {
        for (const rootId of roots) {
          result.add(rootId)
        }
      }
      continue
    }

    if (values?.some((value) => compareValues(value, filter.op, filter.value))) {
      for (const rootId of roots) {
        result.add(rootId)
      }
    }
  }

  return result
}

/**
 * Check if a value is considered "empty"
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/**
 * Compare a value against a target using the specified operator
 */
function compareValues(actual: unknown, op: FilterOp, target: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === target
    case 'neq':
      return actual !== target
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      // Numeric comparison
      if (typeof actual === 'number' && typeof target === 'number') {
        return op === 'gt' ? actual > target
          : op === 'gte' ? actual >= target
          : op === 'lt' ? actual < target
          : actual <= target
      }
      // Date string comparison - parse ISO strings to timestamps for accurate ordering
      if (typeof actual === 'string' && typeof target === 'string') {
        const aTime = Date.parse(actual)
        const tTime = Date.parse(target)
        if (!isNaN(aTime) && !isNaN(tTime)) {
          return op === 'gt' ? aTime > tTime
            : op === 'gte' ? aTime >= tTime
            : op === 'lt' ? aTime < tTime
            : aTime <= tTime
        }
        // Fallback to lexicographic string comparison
        return op === 'gt' ? actual > target
          : op === 'gte' ? actual >= target
          : op === 'lt' ? actual < target
          : actual <= target
      }
      return false
    }
    case 'contains':
      return (
        typeof actual === 'string' &&
        typeof target === 'string' &&
        actual.toLowerCase().includes(target.toLowerCase())
      )
    case 'startsWith':
      return (
        typeof actual === 'string' &&
        typeof target === 'string' &&
        actual.toLowerCase().startsWith(target.toLowerCase())
      )
    case 'endsWith':
      return (
        typeof actual === 'string' &&
        typeof target === 'string' &&
        actual.toLowerCase().endsWith(target.toLowerCase())
      )
    case 'isEmpty':
    case 'isNotEmpty':
      // These are handled separately
      return false
    default:
      return false
  }
}

function getParsedPropertiesForField(
  db: Database,
  fieldNodeId: string,
  ownerIds: Set<string>,
): Map<string, unknown[]> {
  const ownerIdArray = [...ownerIds]
  if (ownerIdArray.length === 0) {
    return new Map()
  }

  const props = db
    .select({ nodeId: nodeProperties.nodeId, value: nodeProperties.value })
    .from(nodeProperties)
    .where(and(
      eq(nodeProperties.fieldNodeId, fieldNodeId),
      inArray(nodeProperties.nodeId, ownerIdArray),
    ))
    .all()

  const nodePropsMap = new Map<string, unknown[]>()
  for (const prop of props) {
    const parsedValue = parsePropertyValue(prop.value)
    const existing = nodePropsMap.get(prop.nodeId)
    if (existing) {
      existing.push(parsedValue)
    } else {
      nodePropsMap.set(prop.nodeId, [parsedValue])
    }
  }

  return nodePropsMap
}

function parsePropertyValue(value: string | null): unknown {
  try {
    return JSON.parse(value || 'null')
  } catch {
    return value
  }
}

function extractReferenceIds(values: unknown[]): string[] {
  const refs: string[] = []
  for (const value of values) {
    if (typeof value === 'string') {
      refs.push(value)
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          refs.push(item)
        }
      }
    }
  }
  return refs
}

function getExistingNodeIds(db: Database, nodeIds: Set<string>): Set<string> {
  const nodeIdArray = [...nodeIds]
  if (nodeIdArray.length === 0) {
    return new Set()
  }

  const rows = db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(
      inArray(nodes.id, nodeIdArray),
      isNull(nodes.deletedAt),
    ))
    .all()

  return new Set(rows.map((row) => row.id))
}

// ============================================================================
// Content Filter
// ============================================================================

/**
 * Filter nodes by content full-text search
 *
 * Searches the contentPlain field (lowercase) for case-insensitive matching.
 */
export function evaluateContentFilter(
  db: Database,
  filter: ContentFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { query, caseSensitive = false } = filter

  if (!query || query.trim() === '') {
    // Empty query matches all
    return candidateIds
  }

  const searchTerm = caseSensitive ? query : query.toLowerCase()

  // Batch fetch all candidate nodes instead of N+1 queries
  const candidateArray = [...candidateIds]
  const candidateNodes = candidateArray.length > 0
    ? db.select({ id: nodes.id, content: nodes.content, contentPlain: nodes.contentPlain })
        .from(nodes)
        .where(inArray(nodes.id, candidateArray))
        .all()
    : []

  const result = new Set<string>()
  for (const node of candidateNodes) {
    const content = caseSensitive ? node.content : node.contentPlain
    if (content && content.includes(searchTerm)) {
      result.add(node.id)
    }
  }

  return result
}

// ============================================================================
// Has Field Filter
// ============================================================================

/**
 * Filter nodes that have (or don't have) a specific field
 */
export function evaluateHasFieldFilter(
  db: Database,
  filter: HasFieldFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { fieldId, negate = false } = filter

  const field = getFieldOrSupertagNode(db, fieldId)
  if (!field) {
    // Unknown field - if negated, all match; otherwise none match
    return negate ? candidateIds : new Set()
  }

  // Get all nodes that have this field
  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, field.id))
    .all()

  const nodesWithField = new Set<string>(props.map((p) => p.nodeId))

  const result = new Set<string>()
  for (const id of candidateIds) {
    const hasField = nodesWithField.has(id)
    if (negate ? !hasField : hasField) {
      result.add(id)
    }
  }

  return result
}

// ============================================================================
// Temporal Filter
// ============================================================================

/**
 * Filter nodes by timestamp (createdAt or updatedAt)
 *
 * Supports:
 * - 'within' last N days
 * - 'before' a specific date
 * - 'after' a specific date
 */
export function evaluateTemporalFilter(
  db: Database,
  filter: TemporalFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { field, op, days, date } = filter

  const now = new Date()
  let targetDate: Date

  switch (op) {
    case 'within':
      if (days === undefined) {
        return candidateIds // No days specified, match all
      }
      targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      break
    case 'before':
    case 'after':
      if (!date) {
        return candidateIds // No date specified, match all
      }
      targetDate = new Date(date)
      break
    default:
      return candidateIds
  }

  // Batch fetch all candidate nodes instead of N+1 queries
  const candidateArray = [...candidateIds]
  const candidateNodes = candidateArray.length > 0
    ? db.select({ id: nodes.id, createdAt: nodes.createdAt, updatedAt: nodes.updatedAt })
        .from(nodes)
        .where(inArray(nodes.id, candidateArray))
        .all()
    : []

  const result = new Set<string>()
  for (const node of candidateNodes) {
    const nodeDate = field === 'createdAt' ? node.createdAt : node.updatedAt

    let matches = false
    switch (op) {
      case 'within':
        matches = nodeDate >= targetDate
        break
      case 'before':
        matches = nodeDate < targetDate
        break
      case 'after':
        matches = nodeDate > targetDate
        break
    }

    if (matches) {
      result.add(node.id)
    }
  }

  return result
}

// ============================================================================
// Relation Filter
// ============================================================================

/**
 * Filter nodes by relationships
 *
 * Supports:
 * - 'childOf' / 'ownedBy': Node's ownerId matches target
 * - 'linksTo': Node has a property value referencing target
 * - 'linkedFrom': Target has a property value referencing this node (backlinks)
 */
export function evaluateRelationFilter(
  db: Database,
  filter: RelationFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { relationType, targetNodeId, fieldId } = filter

  switch (relationType) {
    case 'childOf':
    case 'ownedBy':
      return evaluateChildOfRelation(db, candidateIds, targetNodeId)

    case 'linksTo':
      return evaluateLinksToRelation(db, candidateIds, targetNodeId, fieldId)

    case 'linkedFrom':
      return evaluateLinkedFromRelation(db, candidateIds, targetNodeId, fieldId)

    default:
      return candidateIds
  }
}

/**
 * Find nodes that are children of a specific node (via ownerId)
 */
function evaluateChildOfRelation(
  db: Database,
  candidateIds: Set<string>,
  targetNodeId?: string,
): Set<string> {
  // Batch fetch all candidate nodes instead of N+1 queries
  const candidateArray = [...candidateIds]
  const candidateNodes = candidateArray.length > 0
    ? db.select({ id: nodes.id, ownerId: nodes.ownerId })
        .from(nodes)
        .where(inArray(nodes.id, candidateArray))
        .all()
    : []

  const result = new Set<string>()
  for (const node of candidateNodes) {
    if (targetNodeId) {
      if (node.ownerId === targetNodeId) {
        result.add(node.id)
      }
    } else {
      if (node.ownerId) {
        result.add(node.id)
      }
    }
  }

  return result
}

/**
 * Find nodes that link to a target node via a property
 */
function evaluateLinksToRelation(
  db: Database,
  candidateIds: Set<string>,
  targetNodeId?: string,
  fieldId?: string,
): Set<string> {
  const result = new Set<string>()

  // Build query based on optional field filter
  let propsQuery = db.select().from(nodeProperties)
  if (fieldId) {
    const field = getFieldOrSupertagNode(db, fieldId)
    if (!field) return result
    propsQuery = propsQuery.where(eq(nodeProperties.fieldNodeId, field.id)) as typeof propsQuery
  }

  const allProps = propsQuery.all()

  for (const prop of allProps) {
    if (!candidateIds.has(prop.nodeId)) continue

    try {
      const value = JSON.parse(prop.value || '')

      // Check if value is a node reference (UUID)
      const isMatch = targetNodeId
        ? value === targetNodeId ||
          (Array.isArray(value) && value.includes(targetNodeId))
        : typeof value === 'string' && UUID_REGEX.test(value)

      if (isMatch) {
        result.add(prop.nodeId)
      }
    } catch {
      // Log warning for malformed property values in relation queries
      console.warn(
        `[QueryEvaluator] Malformed property value in linksTo query for node ${prop.nodeId}: ${prop.value?.slice(0, 50)}`,
      )
    }
  }

  return result
}

/**
 * Find nodes that are linked FROM a target (backlinks)
 */
function evaluateLinkedFromRelation(
  db: Database,
  candidateIds: Set<string>,
  targetNodeId?: string,
  fieldId?: string,
): Set<string> {
  const result = new Set<string>()

  if (!targetNodeId) {
    // Need a target to find backlinks
    return result
  }

  // Find all properties that reference candidate nodes
  let propsQuery = db.select().from(nodeProperties)
  if (fieldId) {
    const field = getFieldOrSupertagNode(db, fieldId)
    if (!field) return result
    propsQuery = propsQuery.where(eq(nodeProperties.fieldNodeId, field.id)) as typeof propsQuery
  }

  const allProps = propsQuery.all()

  // Find properties on target node that reference candidates
  for (const prop of allProps) {
    if (prop.nodeId !== targetNodeId) continue

    try {
      const value = JSON.parse(prop.value || '')

      if (typeof value === 'string' && candidateIds.has(value)) {
        result.add(value)
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === 'string' && candidateIds.has(v)) {
            result.add(v)
          }
        }
      }
    } catch {
      // Log warning for malformed property values in backlink queries
      console.warn(
        `[QueryEvaluator] Malformed property value in linkedFrom query for node ${prop.nodeId}: ${prop.value?.slice(0, 50)}`,
      )
    }
  }

  return result
}

// ============================================================================
// Logical Filter
// ============================================================================

/**
 * Evaluate logical operators (AND, OR, NOT)
 */
export function evaluateLogicalFilter(
  db: Database,
  filter: LogicalFilter,
  candidateIds: Set<string>,
): Set<string> {
  const { type, filters } = filter

  if (filters.length === 0) {
    // No sub-filters - return all candidates for AND/OR, none for NOT
    return type === 'not' ? new Set() : candidateIds
  }

  switch (type) {
    case 'and': {
      // Intersection - all filters must match
      let result = candidateIds
      for (const subFilter of filters) {
        result = evaluateFilter(db, subFilter, result)
        if (result.size === 0) break // Short-circuit
      }
      return result
    }

    case 'or': {
      // Union - any filter can match
      const result = new Set<string>()
      for (const subFilter of filters) {
        const matches = evaluateFilter(db, subFilter, candidateIds)
        for (const id of matches) {
          result.add(id)
        }
      }
      return result
    }

    case 'not': {
      // Complement - none of the filters should match
      // First, find all nodes matching the combined sub-filters (OR'd together)
      const excludeSet = new Set<string>()
      for (const subFilter of filters) {
        const matches = evaluateFilter(db, subFilter, candidateIds)
        for (const id of matches) {
          excludeSet.add(id)
        }
      }

      // Return candidates minus excluded
      const result = new Set<string>()
      for (const id of candidateIds) {
        if (!excludeSet.has(id)) {
          result.add(id)
        }
      }
      return result
    }

    default:
      return candidateIds
  }
}

// ============================================================================
// Sorting
// ============================================================================

/**
 * Sort assembled nodes by a field
 */
function sortNodes(
  db: Database,
  nodes: AssembledNode[],
  sort: QuerySort,
): AssembledNode[] {
  const { field, direction } = sort
  const multiplier = direction === 'asc' ? 1 : -1

  return [...nodes].sort((a, b) => {
    const aValue = getSortValue(a, field)
    const bValue = getSortValue(b, field)

    // Handle null/undefined - put them at the end
    if (aValue === null || aValue === undefined) {
      return bValue === null || bValue === undefined ? 0 : 1
    }
    if (bValue === null || bValue === undefined) {
      return -1
    }

    // Compare based on type
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return multiplier * aValue.localeCompare(bValue)
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return multiplier * (aValue - bValue)
    }

    if (aValue instanceof Date && bValue instanceof Date) {
      return multiplier * (aValue.getTime() - bValue.getTime())
    }

    // Fallback: string comparison
    return multiplier * String(aValue).localeCompare(String(bValue))
  })
}

/**
 * Get the value to sort by from an assembled node
 */
function getSortValue(
  node: AssembledNode,
  field: string,
): string | number | Date | null {
  // Built-in fields
  switch (field) {
    case 'content':
      return node.content
    case 'createdAt':
      return node.createdAt
    case 'updatedAt':
      return node.updatedAt
    case 'systemId':
      return node.systemId
  }

  // Try to find as property (by systemId)
  for (const values of Object.values(node.properties)) {
    for (const pv of values) {
      if (pv.fieldSystemId === field || pv.fieldName === field) {
        return pv.value as string | number | Date | null
      }
    }
  }

  return null
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all non-deleted node IDs
 */
function getAllNonDeletedNodeIds(db: Database): Set<string> {
  const allNodes = db
    .select({ id: nodes.id })
    .from(nodes)
    .where(isNull(nodes.deletedAt))
    .all()

  return new Set(allNodes.map((n) => n.id))
}
