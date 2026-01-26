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

import { eq, isNull } from 'drizzle-orm'
import { getDatabase } from '../client/master-client.js'
import { nodeProperties, nodes, SYSTEM_FIELDS } from '../schemas/node-schema.js'
import type {
  ContentFilter,
  FilterOp,
  HasFieldFilter,
  LogicalFilter,
  PropertyFilter,
  QueryDefinition,
  QueryFilter,
  QuerySort,
  RelationFilter,
  SupertagFilter,
  TemporalFilter,
} from '../types/query.js'
import {
  assembleNode,
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

  // 3. Assemble nodes
  let assembledNodes = Array.from(candidateIds)
    .map((id) => assembleNode(db, id))
    .filter((n): n is AssembledNode => n !== null)

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
  const { supertagSystemId, includeInherited = true } = filter

  // Get all node IDs with this supertag (optionally with inheritance)
  let matchingIds: string[]
  if (includeInherited) {
    matchingIds = getNodeIdsBySupertagWithInheritance(db, supertagSystemId)
  } else {
    // Direct match only - no inheritance
    matchingIds = getNodeIdsByDirectSupertag(db, supertagSystemId)
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
  supertagSystemId: string,
): string[] {
  const targetSupertag = getSystemNode(db, supertagSystemId)
  if (!targetSupertag) return []

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, supertagField.id))
    .all()

  const nodeIds: string[] = []
  for (const prop of props) {
    try {
      const value = JSON.parse(prop.value || '')
      if (value === targetSupertag.id) {
        nodeIds.push(prop.nodeId)
      }
    } catch {
      // Skip malformed values
    }
  }

  return nodeIds
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
  const { fieldSystemId, op, value } = filter

  const field = getSystemNode(db, fieldSystemId)
  if (!field) {
    // Unknown field - return empty set
    return new Set()
  }

  // Get all properties for this field
  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, field.id))
    .all()

  // Build map of nodeId -> property values
  const nodePropsMap = new Map<string, unknown[]>()
  for (const prop of props) {
    if (!candidateIds.has(prop.nodeId)) continue

    let parsedValue: unknown = prop.value
    try {
      parsedValue = JSON.parse(prop.value || 'null')
    } catch {
      // Keep as string
    }

    if (!nodePropsMap.has(prop.nodeId)) {
      nodePropsMap.set(prop.nodeId, [])
    }
    nodePropsMap.get(prop.nodeId)!.push(parsedValue)
  }

  // For isEmpty/isNotEmpty, we need to consider nodes without the property
  if (op === 'isEmpty') {
    const result = new Set<string>()
    for (const id of candidateIds) {
      const values = nodePropsMap.get(id)
      if (!values || values.length === 0 || values.every(isEmptyValue)) {
        result.add(id)
      }
    }
    return result
  }

  if (op === 'isNotEmpty') {
    const result = new Set<string>()
    for (const id of candidateIds) {
      const values = nodePropsMap.get(id)
      if (values && values.length > 0 && values.some((v) => !isEmptyValue(v))) {
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
      return typeof actual === 'number' && typeof target === 'number' && actual > target
    case 'gte':
      return typeof actual === 'number' && typeof target === 'number' && actual >= target
    case 'lt':
      return typeof actual === 'number' && typeof target === 'number' && actual < target
    case 'lte':
      return typeof actual === 'number' && typeof target === 'number' && actual <= target
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

  const result = new Set<string>()
  for (const id of candidateIds) {
    const node = db.select().from(nodes).where(eq(nodes.id, id)).get()
    if (!node) continue

    const content = caseSensitive ? node.content : node.contentPlain
    if (content && content.includes(searchTerm)) {
      result.add(id)
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
  const { fieldSystemId, negate = false } = filter

  const field = getSystemNode(db, fieldSystemId)
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

  const result = new Set<string>()
  for (const id of candidateIds) {
    const node = db.select().from(nodes).where(eq(nodes.id, id)).get()
    if (!node) continue

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
      result.add(id)
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
  const { relationType, targetNodeId, fieldSystemId } = filter

  switch (relationType) {
    case 'childOf':
    case 'ownedBy':
      return evaluateChildOfRelation(db, candidateIds, targetNodeId)

    case 'linksTo':
      return evaluateLinksToRelation(db, candidateIds, targetNodeId, fieldSystemId)

    case 'linkedFrom':
      return evaluateLinkedFromRelation(db, candidateIds, targetNodeId, fieldSystemId)

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
  const result = new Set<string>()

  for (const id of candidateIds) {
    const node = db.select().from(nodes).where(eq(nodes.id, id)).get()
    if (!node) continue

    if (targetNodeId) {
      // Match specific parent
      if (node.ownerId === targetNodeId) {
        result.add(id)
      }
    } else {
      // Match any node with an owner
      if (node.ownerId) {
        result.add(id)
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
  fieldSystemId?: string,
): Set<string> {
  const result = new Set<string>()

  // Build query based on optional field filter
  let propsQuery = db.select().from(nodeProperties)
  if (fieldSystemId) {
    const field = getSystemNode(db, fieldSystemId)
    if (!field) return result
    propsQuery = propsQuery.where(eq(nodeProperties.fieldNodeId, field.id)) as typeof propsQuery
  }

  const allProps = propsQuery.all()

  for (const prop of allProps) {
    if (!candidateIds.has(prop.nodeId)) continue

    try {
      const value = JSON.parse(prop.value || '')

      // Check if value is a node reference
      const isMatch = targetNodeId
        ? value === targetNodeId ||
          (Array.isArray(value) && value.includes(targetNodeId))
        : typeof value === 'string' && value.length === 36 // UUID-like

      if (isMatch) {
        result.add(prop.nodeId)
      }
    } catch {
      // Skip malformed values
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
  fieldSystemId?: string,
): Set<string> {
  const result = new Set<string>()

  if (!targetNodeId) {
    // Need a target to find backlinks
    return result
  }

  // Find all properties that reference candidate nodes
  let propsQuery = db.select().from(nodeProperties)
  if (fieldSystemId) {
    const field = getSystemNode(db, fieldSystemId)
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
      // Skip malformed values
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
