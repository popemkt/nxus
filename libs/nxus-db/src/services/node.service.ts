/**
 * node.service.ts - Core node operations
 *
 * Provides CRUD and query functions for the node-based architecture.
 *
 * For NEW mini-apps: Use the Write API directly (createNode, setProperty, etc.)
 * For LEGACY migration: Use adapters from ./adapters.ts
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { getDatabase } from '../client/master-client.js'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  isSystemId,
  type FieldSystemId,
  type FieldContentName,
} from '../schemas/node-schema.js'
import { itemTypes, type AppType } from '../schemas/item-schema.js'
import { eventBus } from '../reactive/event-bus.js'
import { evaluateFormulaExpression } from './formula-evaluator.js'

// Re-export types from the shared types file (for backward compatibility)
export type {
  AssembledNode,
  PropertyValue,
  CreateNodeOptions,
} from '../types/node.js'

// Re-export isSystemId for convenience (canonical version is in node-schema.ts)
export { isSystemId } from '../schemas/node-schema.js'

// Import types for use in this file
import type { AssembledNode, PropertyValue, CreateNodeOptions } from '../types/node.js'
import type { JsonValue } from '../types/common.js'
import type { MutationEvent } from '../reactive/types.js'
import type { BaseType } from '../types/base-type.js'

type NodeDatabase = ReturnType<typeof getDatabase>

const transactionEventStack: MutationEvent[][] = []

type FieldNodeInfo = { content: string; systemId: string | null }
type SupertagNodeInfo = { id: string; content: string; systemId: string | null }
type SupertagFieldDefinition = {
  fieldNodeId: string
  fieldName: string
  defaultValue?: unknown
}
type FormulaFieldDefinition = {
  fieldSystemId: string
  fieldNodeId: string
  fieldName: string
  expression: string
}

export interface AssemblyCache {
  fieldNodes: Map<string, FieldNodeInfo>
  supertagNodes: Map<string, SupertagNodeInfo>
  supertagFieldDefinitions: Map<string, Map<string, SupertagFieldDefinition>>
  ancestorSupertags: Map<string, string[]>
  fieldDefinitionTypes: Map<string, string>
  fieldDefinitionFormulas: Map<string, string>
  formulaDefinitions: Map<string, FormulaFieldDefinition[]>
  supertagsByBaseType: Map<BaseType, string[]>
  nodeIdsByBaseType: Map<BaseType, string[]>
}

export function createAssemblyCache(): AssemblyCache {
  return {
    fieldNodes: new Map(),
    supertagNodes: new Map(),
    supertagFieldDefinitions: new Map(),
    ancestorSupertags: new Map(),
    fieldDefinitionTypes: new Map(),
    fieldDefinitionFormulas: new Map(),
    formulaDefinitions: new Map(),
    supertagsByBaseType: new Map(),
    nodeIdsByBaseType: new Map(),
  }
}

function emitMutation(event: MutationEvent): void {
  const currentEvents = transactionEventStack.at(-1)
  if (currentEvents) {
    currentEvents.push(event)
    return
  }
  eventBus.emit(event)
}

function runMutationTransaction<T>(
  db: NodeDatabase,
  mutate: (tx: NodeDatabase) => T,
): T {
  if (transactionEventStack.length > 0) {
    return mutate(db)
  }

  const events: MutationEvent[] = []
  const result = db.transaction((tx) => {
    transactionEventStack.push(events)
    try {
      return mutate(tx as NodeDatabase)
    } finally {
      transactionEventStack.pop()
    }
  }) as T
  for (const event of events) {
    eventBus.emit(event)
  }
  return result
}

export function withNodeMutationTransaction<T>(
  db: NodeDatabase,
  mutate: (tx: NodeDatabase) => T,
): T {
  return runMutationTransaction(db, mutate)
}

// ============================================================================
// System Node Cache (runtime cache for field/supertag lookups)
// ============================================================================

const systemNodeCache = new Map<string, { id: string; content: string }>()
const nodeIdCache = new Map<string, { id: string; content: string }>()

/**
 * Get a system node by systemId (cached)
 */
export function getSystemNode(
  db: ReturnType<typeof getDatabase>,
  systemId: string,
): { id: string; content: string } | null {
  if (systemNodeCache.has(systemId)) {
    return systemNodeCache.get(systemId)!
  }
  const node = db.select().from(nodes).where(eq(nodes.systemId, systemId)).get()
  if (node) {
    const entry = { id: node.id, content: node.content || '' }
    systemNodeCache.set(systemId, entry)
    return entry
  }
  return null
}

/**
 * Get a node by id (cached) - for field/supertag lookups by UUID
 */
export function getNodeById(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
): { id: string; content: string } | null {
  if (nodeIdCache.has(nodeId)) {
    return nodeIdCache.get(nodeId)!
  }
  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (node) {
    const entry = { id: node.id, content: node.content || '' }
    nodeIdCache.set(nodeId, entry)
    return entry
  }
  return null
}

/**
 * Resolve a field or supertag reference to its node.
 *
 * Accepts either:
 * - A systemId (e.g., 'field:status', 'supertag:task') - looked up by systemId
 * - A UUID (e.g., '019c0a49-abc...') - looked up by id
 *
 * Uses systemId prefix detection for unambiguous routing.
 */
export function getFieldOrSupertagNode(
  db: ReturnType<typeof getDatabase>,
  idOrSystemId: string,
): { id: string; content: string } | null {
  // Handle undefined/null/empty gracefully
  if (!idOrSystemId) {
    return null
  }

  // Route based on prefix - systemIds always have 'field:' or 'supertag:' prefix
  if (isSystemId(idOrSystemId)) {
    return getSystemNode(db, idOrSystemId)
  }

  // Otherwise treat as UUID
  return getNodeById(db, idOrSystemId)
}

/**
 * Clear system node cache (call after bootstrap or migration)
 */
export function clearSystemNodeCache(): void {
  systemNodeCache.clear()
  nodeIdCache.clear()
}

function getDirectParentSupertagIds(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
  extendsFieldId: string,
): string[] {
  const props = db
    .select()
    .from(nodeProperties)
    .where(and(
      eq(nodeProperties.nodeId, supertagId),
      eq(nodeProperties.fieldNodeId, extendsFieldId),
    ))
    .all()
    .sort((a, b) => {
      const orderDiff = (a.order ?? 0) - (b.order ?? 0)
      return orderDiff !== 0 ? orderDiff : a.nodeId.localeCompare(b.nodeId)
    })

  const parentIds: string[] = []
  for (const prop of props) {
    try {
      const parentId = JSON.parse(prop.value || '')
      if (typeof parentId === 'string' && parentId) {
        parentIds.push(parentId)
      }
    } catch {
      // skip malformed extends values
    }
  }

  return parentIds
}

/**
 * Get all ancestor supertags by walking the field:extends DAG breadth-first.
 * Returns IDs in BFS discovery order from direct parents outward.
 */
export function getAncestorSupertags(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
  maxDepth: number = 10,
  cache?: AssemblyCache,
): string[] {
  const cacheKey = `${supertagId}:${maxDepth}`
  const cached = cache?.ancestorSupertags.get(cacheKey)
  if (cached) return cached

  const extendsField = getSystemNode(db, SYSTEM_FIELDS.EXTENDS)
  if (!extendsField) return []

  const ancestors: string[] = []
  const visited = new Set<string>([supertagId])
  let frontier = [supertagId]

  for (let depth = 0; depth < maxDepth; depth++) {
    if (frontier.length === 0) break
    const nextFrontier: string[] = []

    for (const currentId of frontier) {
      const parentIds = getDirectParentSupertagIds(db, currentId, extendsField.id)
      for (const parentId of parentIds) {
        if (visited.has(parentId)) continue
        visited.add(parentId)
        ancestors.push(parentId)
        nextFrontier.push(parentId)
      }
    }

    frontier = nextFrontier
  }

  cache?.ancestorSupertags.set(cacheKey, ancestors)
  return ancestors
}

function getSupertagInheritanceMergeOrder(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
  cache?: AssemblyCache,
): string[] {
  return [
    supertagId,
    ...getAncestorSupertags(db, supertagId, 10, cache),
  ]
}

/**
 * Get field definitions from a supertag (fields that the supertag defines for its instances)
 * Returns map of fieldSystemId -> default value (or undefined if no default)
 */
export function getSupertagFieldDefinitions(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
  cache?: AssemblyCache,
): Map<
  string,
  { fieldNodeId: string; fieldName: string; defaultValue?: unknown }
> {
  const cached = cache?.supertagFieldDefinitions.get(supertagId)
  if (cached) return cached

  const fieldDefs = new Map<
    string,
    { fieldNodeId: string; fieldName: string; defaultValue?: unknown }
  >()

  // Get all properties of the supertag node itself
  // Properties on a supertag define the schema for its instances
  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, supertagId))
    .all()

  // Filter to only include properties that are "field definitions"
  // Skip system fields like supertag, extends that are about the supertag itself
  const systemFieldIds = new Set<string>()
  const systemFields = [
    SYSTEM_FIELDS.SUPERTAG,
    SYSTEM_FIELDS.EXTENDS,
    SYSTEM_FIELDS.FIELD_TYPE,
    SYSTEM_FIELDS.BASE_TYPE,
  ]
  for (const sf of systemFields) {
    const node = getSystemNode(db, sf)
    if (node) systemFieldIds.add(node.id)
  }

  for (const prop of props) {
    if (systemFieldIds.has(prop.fieldNodeId)) continue

    const cachedFieldNode = cache?.fieldNodes.get(prop.fieldNodeId)
    const fieldNode = cachedFieldNode
      ? {
          id: prop.fieldNodeId,
          content: cachedFieldNode.content,
          systemId: cachedFieldNode.systemId,
        }
      : db
          .select()
          .from(nodes)
          .where(eq(nodes.id, prop.fieldNodeId))
          .get()

    if (fieldNode && fieldNode.systemId) {
      cache?.fieldNodes.set(prop.fieldNodeId, {
        content: fieldNode.content || '',
        systemId: fieldNode.systemId,
      })

      let defaultValue: unknown
      try {
        defaultValue = JSON.parse(prop.value || 'null')
      } catch {
        defaultValue = prop.value
      }

      fieldDefs.set(fieldNode.systemId, {
        fieldNodeId: prop.fieldNodeId,
        fieldName: fieldNode.content || fieldNode.systemId,
        defaultValue,
      })
    }
  }

  cache?.supertagFieldDefinitions.set(supertagId, fieldDefs)
  return fieldDefs
}

// ============================================================================
// Read API - Query nodes
// ============================================================================

/**
 * Find node by UUID
 */
export function findNodeById(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
): AssembledNode | null {
  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) return null
  return assembleNode(db, node.id)
}

/**
 * Find node by systemId (uses cache)
 */
export function findNodeBySystemId(
  db: ReturnType<typeof getDatabase>,
  systemId: string,
): AssembledNode | null {
  const cached = getSystemNode(db, systemId)
  if (cached) {
    return assembleNode(db, cached.id)
  }
  const node = db.select().from(nodes).where(eq(nodes.systemId, systemId)).get()
  if (!node) return null
  return assembleNode(db, node.id)
}

/**
 * @deprecated Use findNodeById or findNodeBySystemId instead.
 *
 * This function has ambiguous behavior - it tries systemId first, then UUID.
 * This can lead to unexpected results if a systemId happens to look like a UUID.
 * Prefer explicit functions:
 * - findNodeById(db, uuid) - when you have a UUID
 * - findNodeBySystemId(db, systemId) - when you have a systemId like 'item:my-app'
 */
export function findNode(
  db: ReturnType<typeof getDatabase>,
  identifier: string,
): AssembledNode | null {
  // Log deprecation warning (only once per identifier to avoid spam)
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      `[DEPRECATED] findNode() called with '${identifier}'. Use findNodeById() or findNodeBySystemId() instead.`,
    )
  }
  // Try systemId first (more common for lookups)
  let result = findNodeBySystemId(db, identifier)
  if (result) return result
  // Fall back to UUID
  return findNodeById(db, identifier)
}

/**
 * Assemble a node with all its properties and resolved field names
 */
export function assembleNode(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  cache?: AssemblyCache,
): AssembledNode | null {
  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) return null

  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()

  // Build field info cache
  const fieldCache = new Map<string, FieldNodeInfo>()
  for (const prop of props) {
    const cachedField = cache?.fieldNodes.get(prop.fieldNodeId)
    if (cachedField) {
      fieldCache.set(prop.fieldNodeId, cachedField)
    } else if (!fieldCache.has(prop.fieldNodeId)) {
      const fieldNode = db
        .select()
        .from(nodes)
        .where(eq(nodes.id, prop.fieldNodeId))
        .get()
      if (fieldNode) {
        fieldCache.set(prop.fieldNodeId, {
          content: fieldNode.content || '',
          systemId: fieldNode.systemId,
        })
        cache?.fieldNodes.set(prop.fieldNodeId, {
          content: fieldNode.content || '',
          systemId: fieldNode.systemId,
        })
      }
    }
  }

  const assembled: AssembledNode = {
    id: node.id,
    content: node.content,
    systemId: node.systemId,
    ownerId: node.ownerId,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    deletedAt: node.deletedAt,
    properties: {},
    supertags: [],
  }

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  const supertagFieldId = supertagField?.id

  for (const prop of props) {
    const fieldInfo = fieldCache.get(prop.fieldNodeId)
    const fieldName = (fieldInfo?.content || prop.fieldNodeId) as FieldContentName

    let parsedValue: unknown = prop.value
    try {
      parsedValue = JSON.parse(prop.value || 'null')
    } catch {
      // Keep as string
    }

    const pv: PropertyValue = {
      value: parsedValue as JsonValue, // JSON.parse output is JsonValue by construction
      rawValue: prop.value || '',
      fieldNodeId: prop.fieldNodeId,
      fieldName,
      fieldSystemId: fieldInfo?.systemId || null,
      order: prop.order || 0,
    }

    if (!assembled.properties[fieldName]) {
      assembled.properties[fieldName] = []
    }
    assembled.properties[fieldName].push(pv)

    // Resolve supertags
    if (
      prop.fieldNodeId === supertagFieldId &&
      typeof parsedValue === 'string'
    ) {
      const cachedSupertag = cache?.supertagNodes.get(parsedValue)
      const stNode = cachedSupertag
        ? cachedSupertag
        : db
            .select()
            .from(nodes)
            .where(eq(nodes.id, parsedValue))
            .get()
      if (stNode) {
        cache?.supertagNodes.set(parsedValue, {
          id: stNode.id,
          content: stNode.content || '',
          systemId: stNode.systemId,
        })
        assembled.supertags.push({
          id: stNode.id,
          content: stNode.content || '',
          systemId: stNode.systemId,
        })
      }
    }
  }

  applyFormulaFields(db, assembled, cache)
  return assembled
}

/**
 * Batch-assemble multiple nodes in minimal queries.
 * Uses 4 queries total instead of N * (2 + M + K) queries.
 */
export function assembleNodes(
  db: ReturnType<typeof getDatabase>,
  nodeIds: string[],
  cache?: AssemblyCache,
): AssembledNode[] {
  if (nodeIds.length === 0) return []

  // 1. Batch fetch all nodes
  const allNodeRows = db.select().from(nodes).where(inArray(nodes.id, nodeIds)).all()
  const nodeMap = new Map(allNodeRows.map((n) => [n.id, n]))

  // 2. Batch fetch all properties for these nodes
  const allProps = db
    .select()
    .from(nodeProperties)
    .where(inArray(nodeProperties.nodeId, nodeIds))
    .all()

  // 3. Collect unique field node IDs and batch fetch them
  const fieldNodeIdSet = new Set<string>()
  for (const prop of allProps) {
    fieldNodeIdSet.add(prop.fieldNodeId)
  }
  const fieldNodeIds = [...fieldNodeIdSet]
  const missingFieldNodeIds = fieldNodeIds.filter((id) => !cache?.fieldNodes.has(id))
  const fieldRows =
    missingFieldNodeIds.length > 0
      ? db.select().from(nodes).where(inArray(nodes.id, missingFieldNodeIds)).all()
      : []
  const fieldCache = new Map<string, FieldNodeInfo>()
  for (const fieldNodeId of fieldNodeIds) {
    const cached = cache?.fieldNodes.get(fieldNodeId)
    if (cached) fieldCache.set(fieldNodeId, cached)
  }
  for (const fn of fieldRows) {
    const info = { content: fn.content || '', systemId: fn.systemId }
    fieldCache.set(fn.id, info)
    cache?.fieldNodes.set(fn.id, info)
  }

  // 4. Identify supertag property values and batch fetch supertag nodes
  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  const supertagFieldId = supertagField?.id

  const supertagNodeIdSet = new Set<string>()
  for (const prop of allProps) {
    if (prop.fieldNodeId === supertagFieldId) {
      try {
        const value = JSON.parse(prop.value || 'null')
        if (typeof value === 'string') supertagNodeIdSet.add(value)
      } catch {
        // skip malformed
      }
    }
  }
  const supertagNodeIds = [...supertagNodeIdSet]
  const missingSupertagNodeIds = supertagNodeIds.filter(
    (id) => !cache?.supertagNodes.has(id),
  )
  const supertagRows =
    missingSupertagNodeIds.length > 0
      ? db.select().from(nodes).where(inArray(nodes.id, missingSupertagNodeIds)).all()
      : []
  const supertagCache = new Map<string, SupertagNodeInfo>()
  for (const supertagNodeId of supertagNodeIds) {
    const cached = cache?.supertagNodes.get(supertagNodeId)
    if (cached) supertagCache.set(supertagNodeId, cached)
  }
  for (const sn of supertagRows) {
    const info = {
      id: sn.id,
      content: sn.content || '',
      systemId: sn.systemId,
    }
    supertagCache.set(sn.id, info)
    cache?.supertagNodes.set(sn.id, info)
  }

  // 5. Group properties by nodeId
  const propsByNode = new Map<string, typeof allProps>()
  for (const prop of allProps) {
    const existing = propsByNode.get(prop.nodeId)
    if (existing) {
      existing.push(prop)
    } else {
      propsByNode.set(prop.nodeId, [prop])
    }
  }

  // 6. Assemble each node
  const results: AssembledNode[] = []
  for (const nodeId of nodeIds) {
    const node = nodeMap.get(nodeId)
    if (!node) continue

    const props = propsByNode.get(nodeId) || []
    const assembled: AssembledNode = {
      id: node.id,
      content: node.content,
      systemId: node.systemId,
      ownerId: node.ownerId,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      deletedAt: node.deletedAt,
      properties: {},
      supertags: [],
    }

    for (const prop of props) {
      const fieldInfo = fieldCache.get(prop.fieldNodeId)
      const fieldName = (fieldInfo?.content || prop.fieldNodeId) as FieldContentName

      let parsedValue: unknown = prop.value
      try {
        parsedValue = JSON.parse(prop.value || 'null')
      } catch {
        // Keep as string
      }

      const pv: PropertyValue = {
        value: parsedValue as JsonValue, // JSON.parse output is JsonValue by construction
        rawValue: prop.value || '',
        fieldNodeId: prop.fieldNodeId,
        fieldName,
        fieldSystemId: fieldInfo?.systemId || null,
        order: prop.order || 0,
      }

      if (!assembled.properties[fieldName]) {
        assembled.properties[fieldName] = []
      }
      assembled.properties[fieldName].push(pv)

      // Resolve supertags
      if (prop.fieldNodeId === supertagFieldId && typeof parsedValue === 'string') {
        const stNode = supertagCache.get(parsedValue)
        if (stNode) {
          assembled.supertags.push({
            id: stNode.id,
            content: stNode.content,
            systemId: stNode.systemId,
          })
        }
      }
    }

    applyFormulaFields(db, assembled, cache)
    results.push(assembled)
  }

  return results
}

function applyFormulaFields(
  db: ReturnType<typeof getDatabase>,
  assembled: AssembledNode,
  cache?: AssemblyCache,
): void {
  const formulaDefs = getFormulaFieldDefinitionsForNode(db, assembled, cache)
  if (formulaDefs.length === 0) return

  const formulaFieldNames = new Set(formulaDefs.map((def) => def.fieldName))
  const values = new Map<string, JsonValue>()
  for (const [fieldName, propValues] of Object.entries(assembled.properties)) {
    if (formulaFieldNames.has(fieldName)) continue
    const sorted = [...propValues].sort((a, b) => a.order - b.order)
    const first = sorted[0]
    if (first) values.set(fieldName, first.value)
  }

  for (const def of formulaDefs) {
    const result = evaluateFormulaExpression(def.expression, {
      values,
      formulaFieldNames,
    })
    const pv: PropertyValue = {
      value: result,
      rawValue: JSON.stringify(result),
      fieldNodeId: def.fieldNodeId,
      fieldName: def.fieldName,
      fieldSystemId: def.fieldSystemId,
      order: 0,
    }
    const key = def.fieldName as FieldContentName
    assembled.properties[key] = [pv]
  }
}

function getFormulaFieldDefinitionsForNode(
  db: ReturnType<typeof getDatabase>,
  assembled: AssembledNode,
  cache?: AssemblyCache,
): FormulaFieldDefinition[] {
  const cacheKey = assembled.supertags.map((st) => st.id).join('|')
  const cached = cache?.formulaDefinitions.get(cacheKey)
  if (cached) return cached

  const definitions = new Map<
    string,
    { fieldSystemId: string; fieldNodeId: string; fieldName: string; expression: string }
  >()

  for (const supertag of assembled.supertags) {
    for (const stId of getSupertagInheritanceMergeOrder(db, supertag.id, cache)) {
      const fieldDefs = getSupertagFieldDefinitions(db, stId, cache)
      for (const [fieldSystemId, def] of fieldDefs) {
        if (getFieldDefinitionType(db, def.fieldNodeId, cache) !== 'formula') continue
        const expression = getFieldDefinitionFormula(db, def.fieldNodeId, cache)
        definitions.set(fieldSystemId, {
          fieldSystemId,
          fieldNodeId: def.fieldNodeId,
          fieldName: def.fieldName,
          expression,
        })
      }
    }
  }

  const result = [...definitions.values()]
  cache?.formulaDefinitions.set(cacheKey, result)
  return result
}

function getFieldDefinitionType(
  db: ReturnType<typeof getDatabase>,
  fieldNodeId: string,
  cache?: AssemblyCache,
): string {
  const cached = cache?.fieldDefinitionTypes.get(fieldNodeId)
  if (cached) return cached
  const result = getNodePropertyBySystemField(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE) ?? 'text'
  cache?.fieldDefinitionTypes.set(fieldNodeId, result)
  return result
}

function getFieldDefinitionFormula(
  db: ReturnType<typeof getDatabase>,
  fieldNodeId: string,
  cache?: AssemblyCache,
): string {
  const cached = cache?.fieldDefinitionFormulas.get(fieldNodeId)
  if (cached !== undefined) return cached
  const result = getNodePropertyBySystemField(db, fieldNodeId, SYSTEM_FIELDS.FORMULA) ?? ''
  cache?.fieldDefinitionFormulas.set(fieldNodeId, result)
  return result
}

function getNodePropertyBySystemField(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldSystemId: FieldSystemId,
): string | undefined {
  const field = getSystemNode(db, fieldSystemId)
  if (!field) return undefined
  const prop = db
    .select()
    .from(nodeProperties)
    .where(and(
      eq(nodeProperties.nodeId, nodeId),
      eq(nodeProperties.fieldNodeId, field.id),
      eq(nodeProperties.order, 0),
    ))
    .get()
  if (!prop) return undefined
  try {
    const parsed = JSON.parse(prop.value || 'null')
    return typeof parsed === 'string' ? parsed : undefined
  } catch {
    return prop.value ?? undefined
  }
}

/**
 * Assemble a node with inherited properties from supertag chain
 *
 * This walks the supertag inheritance chain (field:extends) and merges
 * field definitions from ancestor supertags into the node's properties.
 *
 * Inheritance order: Node's own properties > Immediate supertag > Parent supertags
 */
export function assembleNodeWithInheritance(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  cache?: AssemblyCache,
): AssembledNode | null {
  // Start with base assembled node
  const node = assembleNode(db, nodeId, cache)
  if (!node) return null

  // Track which fields we already have (don't override)
  const existingFieldSystemIds = new Set<string>()
  for (const values of Object.values(node.properties)) {
    for (const pv of values) {
      if (pv.fieldSystemId) {
        existingFieldSystemIds.add(pv.fieldSystemId)
      }
    }
  }

  // For each supertag, collect inherited fields
  for (const supertag of node.supertags) {
    for (const stId of getSupertagInheritanceMergeOrder(db, supertag.id, cache)) {
      const fieldDefs = getSupertagFieldDefinitions(db, stId, cache)

      for (const [fieldSystemId, def] of fieldDefs) {
        // Skip if node already has this field
        if (existingFieldSystemIds.has(fieldSystemId)) continue

        // Add inherited field with default value
        if (def.defaultValue !== undefined && def.defaultValue !== null) {
          const inheritedPv: PropertyValue = {
            value: def.defaultValue as JsonValue,
            rawValue: JSON.stringify(def.defaultValue),
            fieldNodeId: def.fieldNodeId,
            fieldName: def.fieldName,
            fieldSystemId: fieldSystemId,
            order: 0,
          }

          const key = def.fieldName as FieldContentName
          if (!node.properties[key]) {
            node.properties[key] = []
          }
          node.properties[key].push(inheritedPv)
          existingFieldSystemIds.add(fieldSystemId)
        }
      }
    }
  }

  return node
}

// ============================================================================
// Inline mentions - extraction and reconciliation
// ============================================================================

/**
 * Inline mention token grammar: `[[node:<uuid>]]`.
 * The uuid group matches any RFC-4122-shaped id (nodes use uuidv7).
 */
const INLINE_MENTION_TOKEN_PATTERN =
  /\[\[node:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g

/**
 * Extract the set of node ids referenced via `[[node:<uuid>]]` tokens in
 * `content`, deduplicated, in first-occurrence order.
 */
export function extractMentionedNodeIds(content: string | null | undefined): string[] {
  if (!content) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of content.matchAll(INLINE_MENTION_TOKEN_PATTERN)) {
    const id = match[1]
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/**
 * Reconcile a node's `field:mentions` property rows against the inline
 * `[[node:<uuid>]]` tokens currently present in its content.
 *
 * This is the single write-time extraction point: callers never parse
 * content to answer "what does this node mention" — they read
 * `field:mentions` like any other node-refs property. Diffs against the
 * existing rows (add new, remove gone) rather than clear-and-reinsert, so
 * `property:added`/`property:removed` events only fire for actual changes.
 */
export function reconcileMentions(
  db: NodeDatabase,
  nodeId: string,
  content: string | null | undefined,
): void {
  const field = getSystemNode(db, SYSTEM_FIELDS.MENTIONS)
  if (!field) return // bootstrap hasn't run (e.g. pre-migration DB) — tolerate

  const desired = extractMentionedNodeIds(content)
  const desiredSet = new Set(desired)
  const hasMentionToken = content?.includes('[[node:') ?? false

  if (!hasMentionToken && desired.length === 0) {
    const existingMention = db
      .select({ id: nodeProperties.id })
      .from(nodeProperties)
      .where(and(eq(nodeProperties.nodeId, nodeId), eq(nodeProperties.fieldNodeId, field.id)))
      .limit(1)
      .get()
    if (!existingMention) return
  }

  const existingRows = db
    .select()
    .from(nodeProperties)
    .where(and(eq(nodeProperties.nodeId, nodeId), eq(nodeProperties.fieldNodeId, field.id)))
    .all()

  const existingByValue = new Map<string, (typeof existingRows)[number]>()
  for (const row of existingRows) {
    try {
      const value: unknown = JSON.parse(row.value ?? 'null')
      if (typeof value === 'string') existingByValue.set(value, row)
    } catch {
      // Malformed row — ignore, it will be left in place untouched.
    }
  }

  const now = new Date()

  for (const [value, row] of existingByValue) {
    if (desiredSet.has(value)) continue
    db.delete(nodeProperties).where(eq(nodeProperties.id, row.id)).run()
    emitMutation({
      type: 'property:removed',
      timestamp: now,
      nodeId,
      fieldId: field.id,
      fieldSystemId: SYSTEM_FIELDS.MENTIONS,
      beforeValue: value,
    })
  }

  let maxOrder = existingRows.reduce((max, p) => Math.max(max, p.order ?? 0), -1)
  for (const value of desired) {
    if (existingByValue.has(value)) continue
    maxOrder += 1
    db.insert(nodeProperties)
      .values({
        nodeId,
        fieldNodeId: field.id,
        value: JSON.stringify(value),
        order: maxOrder,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    emitMutation({
      type: 'property:added',
      timestamp: now,
      nodeId,
      fieldId: field.id,
      fieldSystemId: SYSTEM_FIELDS.MENTIONS,
      afterValue: value,
    })
  }
}

// ============================================================================
// Write API - Create/Update/Delete nodes (for new mini-apps)
// ============================================================================

/**
 * Create a new node with optional supertag
 */
export function createNode(
  db: NodeDatabase,
  options: CreateNodeOptions,
): string {
  return runMutationTransaction(db, (tx) => {
    const nodeId = uuidv7()
    const now = new Date()

    tx.insert(nodes)
      .values({
        id: nodeId,
        content: options.content,
        contentPlain: options.content.toLowerCase(),
        systemId: options.systemId,
        ownerId: options.ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Assign supertag if provided (accepts UUID or systemId)
    let assignedSupertagId: string | null = null
    if (options.supertagId) {
      const supertag = getFieldOrSupertagNode(tx, options.supertagId)
      const supertagField = getSystemNode(tx, SYSTEM_FIELDS.SUPERTAG)
      if (supertag && supertagField) {
        setProperty(tx, nodeId, SYSTEM_FIELDS.SUPERTAG, supertag.id)
        assignedSupertagId = supertag.id
      }
    }

    // Emit node:created AFTER supertag assignment so the membership event
    // carries the ancestor-expanded supertag set (invalidation narrowing).
    const createdSupertagIds = assignedSupertagId
      ? [assignedSupertagId, ...getAncestorSupertags(tx, assignedSupertagId)]
      : []
    emitMutation({
      type: 'node:created',
      timestamp: now,
      nodeId,
      supertagIds: [...new Set(createdSupertagIds)],
      afterValue: {
        id: nodeId,
        content: options.content,
        ownerId: options.ownerId,
      },
    })
    if (assignedSupertagId) {
      // supertag:added still fires for supertag-change listeners
      emitMutation({
        type: 'supertag:added',
        timestamp: now,
        nodeId,
        supertagId: assignedSupertagId,
      })
    }

    // Extract [[node:<uuid>]] tokens from the initial content into field:mentions
    reconcileMentions(tx, nodeId, options.content)

    return nodeId
  })
}

/**
 * Update node content
 */
export function updateNodeContent(
  db: NodeDatabase,
  nodeId: string,
  content: string,
): void {
  runMutationTransaction(db, (tx) => {
    // Get current content for beforeValue
    const currentNode = tx.select().from(nodes).where(eq(nodes.id, nodeId)).get()
    const beforeContent = currentNode?.content ?? null

    const now = new Date()
    tx.update(nodes)
      .set({
        content,
        contentPlain: content.toLowerCase(),
        updatedAt: now,
      })
      .where(eq(nodes.id, nodeId))
      .run()

    // Emit node:updated event
    emitMutation({
      type: 'node:updated',
      timestamp: now,
      nodeId,
      beforeValue: beforeContent,
      afterValue: content,
    })

    // Re-extract [[node:<uuid>]] tokens on every content write — this is the
    // canonical write path (§ Inline mentions above); queries never parse content.
    reconcileMentions(tx, nodeId, content)
  })
}

/**
 * Soft delete a node
 */
export function deleteNode(
  db: NodeDatabase,
  nodeId: string,
): void {
  runMutationTransaction(db, (tx) => {
    const now = new Date()
    // Read supertags BEFORE the delete: enrichment must reflect what the
    // node was when it left query results.
    const supertagIds = expandNodeSupertagIds(tx, nodeId)
    tx.update(nodes)
      .set({ deletedAt: now })
      .where(eq(nodes.id, nodeId))
      .run()

    // Emit node:deleted event
    emitMutation({
      type: 'node:deleted',
      timestamp: now,
      nodeId,
      supertagIds,
    })
  })
}

/**
 * Restore a soft-deleted node (clears deletedAt).
 *
 * Used by undo: undoing a delete cannot re-create the node with the same id
 * via createNode, but the row (and its properties) are still present under
 * a soft delete, so clearing deletedAt resurrects it in place.
 */
export function restoreNode(
  db: NodeDatabase,
  nodeId: string,
): void {
  runMutationTransaction(db, (tx) => {
    tx.update(nodes)
      .set({ deletedAt: null })
      .where(eq(nodes.id, nodeId))
      .run()

    // Emit node:created — restoring a node is a membership change like
    // creation (it re-enters query results), reusing that mutation type
    // avoids widening MutationType for a rare, symmetrical op.
    emitMutation({
      type: 'node:created',
      timestamp: new Date(),
      nodeId,
      supertagIds: expandNodeSupertagIds(tx, nodeId),
    })
  })
}

/**
 * Ancestor-expanded supertag UUIDs for membership-event enrichment
 * (spec/tech/reactivity.md, membership narrowing): the returned list is the
 * node's assigned supertags plus every ancestor reached through
 * field:extends, deduped. Expansion happens at EMISSION time so it can
 * never go stale when tags re-extend.
 */
function expandNodeSupertagIds(db: NodeDatabase, nodeId: string): string[] {
  const assigned = getNodeSupertags(db, nodeId)
  const expanded = new Set<string>()
  for (const st of assigned) {
    expanded.add(st.id)
    for (const ancestor of getAncestorSupertags(db, st.id)) {
      expanded.add(ancestor)
    }
  }
  return [...expanded]
}

export function getWorkspaceRoots(db: NodeDatabase): string[] {
  const rootRows = db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(isNull(nodes.ownerId), isNull(nodes.deletedAt), isNull(nodes.systemId)))
    .all()

  if (rootRows.length > 0) {
    return rootRows.map((row) => row.id)
  }

  const fallback = db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(isNull(nodes.deletedAt), isNull(nodes.systemId)))
    .limit(1)
    .get()

  return fallback ? [fallback.id] : []
}

export function reparentNode(
  db: NodeDatabase,
  nodeId: string,
  newParentId: string | null,
  order?: number,
): void {
  runMutationTransaction(db, (tx) => {
    const now = new Date()
    tx.update(nodes)
      .set({
        ownerId: newParentId,
        updatedAt: now,
      })
      .where(eq(nodes.id, nodeId))
      .run()

    emitMutation({
      type: 'node:updated',
      timestamp: now,
      nodeId,
      afterValue: { ownerId: newParentId },
    })

    if (order !== undefined) {
      setProperty(tx, nodeId, SYSTEM_FIELDS.ORDER, order)
    }
  })
}

/**
 * Set a property value (creates or updates).
 *
 * @param fieldId A FieldSystemId (e.g., SYSTEM_FIELDS.STATUS).
 *   Resolved internally via getFieldOrSupertagNode().
 */
export function setProperty(
  db: NodeDatabase,
  nodeId: string,
  fieldId: FieldSystemId,
  value: unknown,
  order: number = 0,
): void {
  runMutationTransaction(db, (tx) => {
    const field = getFieldOrSupertagNode(tx, fieldId)
    if (!field) throw new Error(`Field not found: ${fieldId}`)

    const jsonValue = JSON.stringify(value)
    const now = new Date()

    // Check if property exists and get beforeValue
    const existing = tx
      .select()
      .from(nodeProperties)
      .where(and(
        eq(nodeProperties.nodeId, nodeId),
        eq(nodeProperties.fieldNodeId, field.id),
        eq(nodeProperties.order, order),
      ))
      .get()

    let beforeValue: unknown = undefined
    if (existing) {
      try {
        beforeValue = JSON.parse(existing.value || 'null')
      } catch {
        beforeValue = existing.value
      }
      tx.update(nodeProperties)
        .set({ value: jsonValue, updatedAt: now })
        .where(eq(nodeProperties.id, existing.id))
        .run()
    } else {
      tx.insert(nodeProperties)
        .values({
          nodeId,
          fieldNodeId: field.id,
          value: jsonValue,
          order,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }

    // Emit property:set event with field UUID and systemId
    emitMutation({
      type: 'property:set',
      timestamp: now,
      nodeId,
      fieldId: field.id,
      fieldSystemId: fieldId,
      beforeValue,
      afterValue: value,
    })
  })
}

/**
 * Add a value to a multi-value property (like tags, dependencies).
 *
 * @param fieldId A FieldSystemId (e.g., SYSTEM_FIELDS.TAGS).
 */
export function addPropertyValue(
  db: NodeDatabase,
  nodeId: string,
  fieldId: FieldSystemId,
  value: unknown,
): void {
  runMutationTransaction(db, (tx) => {
    const field = getFieldOrSupertagNode(tx, fieldId)
    if (!field) throw new Error(`Field not found: ${fieldId}`)

    // Get current max order
    const existing = tx
      .select({ order: nodeProperties.order })
      .from(nodeProperties)
      .where(and(
        eq(nodeProperties.nodeId, nodeId),
        eq(nodeProperties.fieldNodeId, field.id),
      ))
      .all()

    const maxOrder = existing.reduce((max, p) => Math.max(max, p.order || 0), -1)

    const now = new Date()
    tx.insert(nodeProperties)
      .values({
        nodeId,
        fieldNodeId: field.id,
        value: JSON.stringify(value),
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Emit property:added event with field UUID and systemId
    emitMutation({
      type: 'property:added',
      timestamp: now,
      nodeId,
      fieldId: field.id,
      fieldSystemId: fieldId,
      afterValue: value,
    })
  })
}

/**
 * Remove all property values for a field.
 *
 * @param fieldId A FieldSystemId (e.g., SYSTEM_FIELDS.TAGS).
 */
export function clearProperty(
  db: NodeDatabase,
  nodeId: string,
  fieldId: FieldSystemId,
): void {
  runMutationTransaction(db, (tx) => {
    const field = getFieldOrSupertagNode(tx, fieldId)
    if (!field) return

    const props = tx
      .select()
      .from(nodeProperties)
      .where(and(
        eq(nodeProperties.nodeId, nodeId),
        eq(nodeProperties.fieldNodeId, field.id),
      ))
      .all()

    // Collect beforeValues for event emission
    const beforeValues: unknown[] = []
    for (const prop of props) {
      try {
        beforeValues.push(JSON.parse(prop.value || 'null'))
      } catch {
        beforeValues.push(prop.value)
      }
    }

    const now = new Date()
    // Batch delete all properties for this field
    if (props.length > 0) {
      tx.delete(nodeProperties)
        .where(and(
          eq(nodeProperties.nodeId, nodeId),
          eq(nodeProperties.fieldNodeId, field.id),
        ))
        .run()
    }

    // Emit property:removed event for each removed value
    for (const beforeValue of beforeValues) {
      emitMutation({
        type: 'property:removed',
        timestamp: now,
        nodeId,
        fieldId: field.id,
        fieldSystemId: fieldId,
        beforeValue,
      })
    }
  })
}

/**
 * Link two nodes via a field (e.g., set parent, add dependency).
 *
 * @param fieldId A FieldSystemId (e.g., SYSTEM_FIELDS.PARENT).
 */
export function linkNodes(
  db: ReturnType<typeof getDatabase>,
  fromNodeId: string,
  fieldId: FieldSystemId,
  toNodeId: string,
  append: boolean = false,
): void {
  if (append) {
    addPropertyValue(db, fromNodeId, fieldId, toNodeId)
  } else {
    setProperty(db, fromNodeId, fieldId, toNodeId)
  }
}

export function setNodeOrderProperties(
  db: NodeDatabase,
  updates: Array<{ nodeId: string; order: number }>,
): void {
  if (updates.length === 0) return
  runMutationTransaction(db, (tx) => {
    for (const update of updates) {
      setProperty(tx, update.nodeId, SYSTEM_FIELDS.ORDER, update.order)
    }
  })
}

export function reorderNodes(
  db: NodeDatabase,
  updates: Array<{ nodeId: string; order: number }>,
): void {
  setNodeOrderProperties(db, updates)
}

export function getDistinctPropertyValues(
  db: NodeDatabase,
  fieldNodeId: string,
): unknown[] {
  const rows = db
    .select({
      nodeId: nodeProperties.nodeId,
      value: nodeProperties.value,
    })
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, fieldNodeId))
    .all()

  if (rows.length === 0) return []

  const liveNodeIds = new Set(
    db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(inArray(nodes.id, [...new Set(rows.map((row) => row.nodeId))]), isNull(nodes.deletedAt)))
      .all()
      .map((row) => row.id),
  )

  const values = new Map<string, unknown>()
  for (const row of rows) {
    if (!liveNodeIds.has(row.nodeId) || row.value === null) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(row.value)
    } catch {
      parsed = row.value
    }
    const key = parsed === undefined ? '__nxus_undefined__' : JSON.stringify(parsed)
    values.set(key, parsed)
  }

  return [...values.values()]
}

export function removePropertyRow(
  db: NodeDatabase,
  ownerNodeId: string,
  fieldNodeId: string,
): void {
  runMutationTransaction(db, (tx) => {
    const rows = tx
      .select()
      .from(nodeProperties)
      .where(and(
        eq(nodeProperties.nodeId, ownerNodeId),
        eq(nodeProperties.fieldNodeId, fieldNodeId),
      ))
      .all()

    if (rows.length === 0) return

    tx.delete(nodeProperties)
      .where(and(
        eq(nodeProperties.nodeId, ownerNodeId),
        eq(nodeProperties.fieldNodeId, fieldNodeId),
      ))
      .run()

    const now = new Date()
    for (const row of rows) {
      let beforeValue: unknown
      try {
        beforeValue = JSON.parse(row.value || 'null')
      } catch {
        beforeValue = row.value
      }
      emitMutation({
        type: 'property:removed',
        timestamp: now,
        nodeId: ownerNodeId,
        fieldId: fieldNodeId,
        beforeValue,
      })
    }
  })
}

export function getFieldUsageStats(
  db: NodeDatabase,
  fieldNodeId: string,
): { nodeCount: number; supertagCount: number } {
  const rows = db
    .select({ nodeId: nodeProperties.nodeId })
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, fieldNodeId))
    .all()

  if (rows.length === 0) return { nodeCount: 0, supertagCount: 0 }

  const liveNodeIds = new Set(
    db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(inArray(nodes.id, [...new Set(rows.map((row) => row.nodeId))]), isNull(nodes.deletedAt)))
      .all()
      .map((row) => row.id),
  )
  const referencedLiveNodeIds = new Set(
    rows.map((row) => row.nodeId).filter((nodeId) => liveNodeIds.has(nodeId)),
  )

  const supertagIds = new Set(getNodeIdsBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.SUPERTAG))
  const supertagCount = [...referencedLiveNodeIds].filter((nodeId) => supertagIds.has(nodeId)).length

  return {
    nodeCount: referencedLiveNodeIds.size,
    supertagCount,
  }
}

// ============================================================================
// Query API - Find nodes by criteria
// ============================================================================

/**
 * Get all node IDs that have a specific supertag (with inheritance)
 */
export function getNodeIdsBySupertagWithInheritance(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
  maxDepth: number = 10,
): string[] {
  const targetSupertag = getFieldOrSupertagNode(db, supertagId)
  if (!targetSupertag) return []

  const extendsField = getSystemNode(db, SYSTEM_FIELDS.EXTENDS)
  if (!extendsField) return []

  const allSupertagIds = new Set<string>([targetSupertag.id])

  const extendsProps = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, extendsField.id))
    .all()

  const childrenByParent = new Map<string, string[]>()
  const sortedExtendsProps = [...extendsProps].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0)
    return orderDiff !== 0 ? orderDiff : a.nodeId.localeCompare(b.nodeId)
  })

  for (const prop of sortedExtendsProps) {
    try {
      const parentId = JSON.parse(prop.value || '')
      if (typeof parentId !== 'string' || !parentId) continue
      const children = childrenByParent.get(parentId) ?? []
      children.push(prop.nodeId)
      childrenByParent.set(parentId, children)
    } catch {
      // skip malformed extends values
    }
  }

  let frontier = [targetSupertag.id]
  for (let depth = 0; depth < maxDepth; depth++) {
    if (frontier.length === 0) break
    const nextFrontier: string[] = []

    for (const currentId of frontier) {
      const childIds = childrenByParent.get(currentId) ?? []
      for (const childId of childIds) {
        if (allSupertagIds.has(childId)) continue
        allSupertagIds.add(childId)
        nextFrontier.push(childId)
      }
    }

    frontier = nextFrontier
  }

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  const supertagValues = [...allSupertagIds].map((id) => JSON.stringify(id))
  if (supertagValues.length === 0) return []

  const matchingSupertagProps = db
    .select({ nodeId: nodeProperties.nodeId })
    .from(nodeProperties)
    .where(and(
      eq(nodeProperties.fieldNodeId, supertagField.id),
      inArray(nodeProperties.value, supertagValues),
    ))
    .all()

  const nodeIdSet = new Set<string>()
  for (const p of matchingSupertagProps) {
    nodeIdSet.add(p.nodeId)
  }

  return [...nodeIdSet]
}

/**
 * Get all assembled nodes with a supertag (with inheritance)
 */
export function getNodesBySupertagWithInheritance(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
): AssembledNode[] {
  const nodeIds = getNodeIdsBySupertagWithInheritance(db, supertagId)
  return assembleNodes(db, nodeIds)
}

/**
 * Get supertag definition node IDs whose own baseType, or any inherited
 * ancestor's baseType, matches the requested engine base type.
 */
export function getSupertagIdsByBaseType(
  db: ReturnType<typeof getDatabase>,
  baseType: BaseType,
  cache?: AssemblyCache,
): string[] {
  const cached = cache?.supertagsByBaseType.get(baseType)
  if (cached) return cached

  const baseTypeField = getSystemNode(db, SYSTEM_FIELDS.BASE_TYPE)
  if (!baseTypeField) return []

  const rows = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, baseTypeField.id))
    .all()

  const directBaseTypeSupertags = new Set<string>()
  for (const row of rows) {
    try {
      if (JSON.parse(row.value || 'null') === baseType) {
        directBaseTypeSupertags.add(row.nodeId)
      }
    } catch {
      // skip malformed baseType values
    }
  }

  const resolved = new Set<string>(directBaseTypeSupertags)
  const extendsField = getSystemNode(db, SYSTEM_FIELDS.EXTENDS)
  if (extendsField) {
    const childRows = db
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.fieldNodeId, extendsField.id))
      .all()

    for (const row of childRows) {
      const ancestors = getAncestorSupertags(db, row.nodeId, 10, cache)
      if (ancestors.some((ancestorId) => directBaseTypeSupertags.has(ancestorId))) {
        resolved.add(row.nodeId)
      }
    }
  }

  const result = [...resolved]
  cache?.supertagsByBaseType.set(baseType, result)
  return result
}

/**
 * Get node IDs whose assigned supertag, or that supertag's inherited ancestors,
 * carries the requested engine base type.
 */
export function getNodeIdsBySupertagBaseType(
  db: ReturnType<typeof getDatabase>,
  baseType: BaseType,
  cache?: AssemblyCache,
): string[] {
  const cached = cache?.nodeIdsByBaseType.get(baseType)
  if (cached) return cached

  const supertagIds = getSupertagIdsByBaseType(db, baseType, cache)
  if (supertagIds.length === 0) {
    cache?.nodeIdsByBaseType.set(baseType, [])
    return []
  }

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  const targetSupertags = new Set(supertagIds)
  const supertagProps = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, supertagField.id))
    .all()

  const nodeIds = new Set<string>()
  for (const prop of supertagProps) {
    try {
      const value = JSON.parse(prop.value || 'null')
      if (typeof value === 'string' && targetSupertags.has(value)) {
        nodeIds.add(prop.nodeId)
      }
    } catch {
      // skip malformed supertag assignments
    }
  }

  // Property rows survive soft deletion — exclude deleted nodes here so no
  // caller can resurface them (a deleted event re-appearing on the calendar).
  let result: string[] = []
  if (nodeIds.size > 0) {
    const liveRows = db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(inArray(nodes.id, [...nodeIds]), isNull(nodes.deletedAt)))
      .all()
    result = liveRows.map((row) => row.id)
  }
  cache?.nodeIdsByBaseType.set(baseType, result)
  return result
}

export function getNodesBySupertagBaseType(
  db: ReturnType<typeof getDatabase>,
  baseType: BaseType,
  cache?: AssemblyCache,
): AssembledNode[] {
  return assembleNodes(db, getNodeIdsBySupertagBaseType(db, baseType, cache), cache)
}

// ============================================================================
// Property Helpers (for reading assembled nodes)
// ============================================================================

/**
 * Get single property value from assembled node.
 *
 * @param fieldName A FieldContentName (e.g., FIELD_NAMES.PARENT, FIELD_NAMES.STATUS).
 *   This is the field node's `content` value, NOT a systemId.
 *   For writes, use setProperty with SYSTEM_FIELDS instead.
 */
export function getProperty<T = unknown>(
  node: AssembledNode,
  fieldName: FieldContentName,
): T | undefined {
  const props = node.properties[fieldName]
  if (!props || props.length === 0) return undefined
  return props[0].value as T
}

/**
 * Get all property values from assembled node (for multi-value fields).
 *
 * @param fieldName A FieldContentName (e.g., FIELD_NAMES.TAGS).
 *   This is the field node's `content` value, NOT a systemId.
 */
export function getPropertyValues<T = unknown>(
  node: AssembledNode,
  fieldName: FieldContentName,
): T[] {
  const props = node.properties[fieldName]
  if (!props) return []
  return props.sort((a, b) => a.order - b.order).map((p) => p.value as T)
}

// ============================================================================
// Supertag Helpers (for multi-type support)
// ============================================================================

export interface SupertagInfo {
  id: string
  systemId: string | null
  content: string
  order: number
}

/**
 * Get all supertags assigned to a node
 * Returns supertag info including id, systemId, content, and order
 */
export function getNodeSupertags(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
): SupertagInfo[] {
  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  // Get all supertag properties for this node
  const supertagProps = db
    .select()
    .from(nodeProperties)
    .where(and(
      eq(nodeProperties.nodeId, nodeId),
      eq(nodeProperties.fieldNodeId, supertagField.id),
    ))
    .all()

  const supertags: SupertagInfo[] = []
  for (const prop of supertagProps) {
    let supertagId: string
    try {
      supertagId = JSON.parse(prop.value || '')
    } catch {
      continue
    }

    if (typeof supertagId !== 'string' || !supertagId) continue

    // Look up the supertag node
    const supertagNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.id, supertagId))
      .get()

    if (supertagNode) {
      supertags.push({
        id: supertagNode.id,
        systemId: supertagNode.systemId,
        content: supertagNode.content || '',
        order: prop.order || 0,
      })
    }
  }

  return supertags.sort((a, b) => a.order - b.order)
}

/**
 * Get all supertag systemIds for a node (convenience function)
 * Returns array of systemIds like ['supertag:tool', 'supertag:repo']
 */
export function getNodeSupertagSystemIds(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
): string[] {
  const supertags = getNodeSupertags(db, nodeId)
  return supertags
    .filter((st): st is SupertagInfo & { systemId: string } => st.systemId !== null)
    .map((st) => st.systemId)
}

/**
 * Set supertags for a node (replaces all existing supertags)
 * @param db Database instance
 * @param nodeId Node UUID to update
 * @param supertagSystemIds Array of supertag systemIds (e.g., ['supertag:tool', 'supertag:repo'])
 */
export function setNodeSupertags(
  db: NodeDatabase,
  nodeId: string,
  supertagSystemIds: string[],
): void {
  runMutationTransaction(db, (tx) => {
    // Verify node exists
    const node = tx.select().from(nodes).where(eq(nodes.id, nodeId)).get()
    if (!node) throw new Error(`Node not found: ${nodeId}`)

    // Get current supertags before clearing (for event emission)
    const currentSupertags = getNodeSupertagSystemIds(tx, nodeId)

    // Determine added and removed supertags
    const currentSet = new Set(currentSupertags)
    const newSet = new Set(supertagSystemIds)
    const removedSupertags = currentSupertags.filter((st) => !newSet.has(st))
    const addedSupertags = supertagSystemIds.filter((st) => !currentSet.has(st))

    // Clear existing supertags
    clearProperty(tx, nodeId, SYSTEM_FIELDS.SUPERTAG)

    // Add new supertags
    for (let i = 0; i < supertagSystemIds.length; i++) {
      const supertagSystemId = supertagSystemIds[i]
      const supertagNode = getSystemNode(tx, supertagSystemId)
      if (supertagNode) {
        addPropertyValue(tx, nodeId, SYSTEM_FIELDS.SUPERTAG, supertagNode.id)
      }
    }

    // Update node timestamp
    const now = new Date()
    tx.update(nodes).set({ updatedAt: now }).where(eq(nodes.id, nodeId)).run()

    // Emit supertag:removed events with supertag UUID
    for (const supertagSystemId of removedSupertags) {
      const supertagNode = getSystemNode(tx, supertagSystemId)
      if (supertagNode) {
        emitMutation({
          type: 'supertag:removed',
          timestamp: now,
          nodeId,
          supertagId: supertagNode.id,
        })
      }
    }

    // Emit supertag:added events with supertag UUID
    for (const supertagSystemId of addedSupertags) {
      const supertagNode = getSystemNode(tx, supertagSystemId)
      if (supertagNode) {
        emitMutation({
          type: 'supertag:added',
          timestamp: now,
          nodeId,
          supertagId: supertagNode.id,
        })
      }
    }
  })
}

/**
 * Add a supertag to a node (if not already present)
 * @param db Database instance
 * @param nodeId Node UUID to update
 * @param supertagSystemId Supertag systemId (e.g., 'supertag:tool')
 * @returns true if added, false if already present
 */
export function addNodeSupertag(
  db: NodeDatabase,
  nodeId: string,
  supertagSystemId: string,
): boolean {
  return runMutationTransaction(db, (tx) => {
    // Check if already has this supertag
    const currentSupertags = getNodeSupertagSystemIds(tx, nodeId)
    if (currentSupertags.includes(supertagSystemId)) {
      return false
    }

    const supertagNode = getSystemNode(tx, supertagSystemId)
    if (!supertagNode) throw new Error(`Supertag not found: ${supertagSystemId}`)

    addPropertyValue(tx, nodeId, SYSTEM_FIELDS.SUPERTAG, supertagNode.id)

    // Update node timestamp
    const now = new Date()
    tx.update(nodes).set({ updatedAt: now }).where(eq(nodes.id, nodeId)).run()

    // Emit supertag:added event with supertag UUID
    emitMutation({
      type: 'supertag:added',
      timestamp: now,
      nodeId,
      supertagId: supertagNode.id,
    })

    return true
  })
}

/**
 * Remove a supertag from a node
 * @param db Database instance
 * @param nodeId Node UUID to update
 * @param supertagSystemId Supertag systemId to remove
 * @returns true if removed, false if not found
 */
export function removeNodeSupertag(
  db: NodeDatabase,
  nodeId: string,
  supertagSystemId: string,
): boolean {
  return runMutationTransaction(db, (tx) => {
    const supertagField = getSystemNode(tx, SYSTEM_FIELDS.SUPERTAG)
    const supertagNode = getSystemNode(tx, supertagSystemId)
    if (!supertagField || !supertagNode) return false

    // Find and delete the specific supertag property
    const props = tx
      .select()
      .from(nodeProperties)
      .where(and(
        eq(nodeProperties.nodeId, nodeId),
        eq(nodeProperties.fieldNodeId, supertagField.id),
        eq(nodeProperties.value, JSON.stringify(supertagNode.id)),
      ))
      .all()

    if (props.length === 0) return false

    for (const prop of props) {
      tx.delete(nodeProperties).where(eq(nodeProperties.id, prop.id)).run()
    }

    // Update node timestamp
    const now = new Date()
    tx.update(nodes).set({ updatedAt: now }).where(eq(nodes.id, nodeId)).run()

    // Emit supertag:removed event with supertag UUID
    emitMutation({
      type: 'supertag:removed',
      timestamp: now,
      nodeId,
      supertagId: supertagNode.id,
    })

    return true
  })
}

/**
 * Query nodes by supertag(s)
 * @param db Database instance
 * @param supertagSystemIds Array of supertag systemIds to filter by
 * @param matchAll If true, returns nodes that have ALL supertags (AND). If false, returns nodes that have ANY supertag (OR). Default: false
 * @returns Array of assembled nodes matching the criteria
 */
export function getNodesBySupertags(
  db: ReturnType<typeof getDatabase>,
  supertagSystemIds: string[],
  matchAll: boolean = false,
): AssembledNode[] {
  if (supertagSystemIds.length === 0) return []

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  // Resolve supertag systemIds to node IDs
  const supertagNodeIds = supertagSystemIds
    .map((sysId) => getSystemNode(db, sysId)?.id)
    .filter((id): id is string => id !== null && id !== undefined)

  if (supertagNodeIds.length === 0) return []

  // Get all supertag property assignments
  const allSupertagProps = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, supertagField.id))
    .all()

  // Build a map of nodeId -> set of supertag IDs it has
  const nodeSupertags = new Map<string, Set<string>>()
  for (const prop of allSupertagProps) {
    let supertagId: string
    try {
      supertagId = JSON.parse(prop.value || '')
    } catch {
      continue
    }

    if (typeof supertagId !== 'string') continue

    if (!nodeSupertags.has(prop.nodeId)) {
      nodeSupertags.set(prop.nodeId, new Set())
    }
    nodeSupertags.get(prop.nodeId)!.add(supertagId)
  }

  // Filter nodes based on matchAll flag
  const matchingNodeIds: string[] = []
  for (const [nodeId, tags] of nodeSupertags) {
    if (matchAll) {
      // AND logic: node must have ALL requested supertags
      if (supertagNodeIds.every((stId) => tags.has(stId))) {
        matchingNodeIds.push(nodeId)
      }
    } else {
      // OR logic: node must have ANY requested supertag
      if (supertagNodeIds.some((stId) => tags.has(stId))) {
        matchingNodeIds.push(nodeId)
      }
    }
  }

  // Assemble and return nodes (batch)
  return assembleNodes(db, matchingNodeIds)
}

/**
 * Get all node IDs that have specific supertag(s)
 * This is a lighter-weight version of getNodesBySupertags that doesn't assemble nodes
 */
export function getNodeIdsBySupertags(
  db: ReturnType<typeof getDatabase>,
  supertagSystemIds: string[],
  matchAll: boolean = false,
): string[] {
  if (supertagSystemIds.length === 0) return []

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  // Resolve supertag systemIds to node IDs
  const supertagNodeIds = supertagSystemIds
    .map((sysId) => getSystemNode(db, sysId)?.id)
    .filter((id): id is string => id !== null && id !== undefined)

  if (supertagNodeIds.length === 0) return []

  // Get all supertag property assignments
  const allSupertagProps = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, supertagField.id))
    .all()

  // Build a map of nodeId -> set of supertag IDs it has
  const nodeSupertags = new Map<string, Set<string>>()
  for (const prop of allSupertagProps) {
    let supertagId: string
    try {
      supertagId = JSON.parse(prop.value || '')
    } catch {
      continue
    }

    if (typeof supertagId !== 'string') continue

    if (!nodeSupertags.has(prop.nodeId)) {
      nodeSupertags.set(prop.nodeId, new Set())
    }
    nodeSupertags.get(prop.nodeId)!.add(supertagId)
  }

  // Filter nodes based on matchAll flag
  const matchingNodeIds: string[] = []
  for (const [nodeId, tags] of nodeSupertags) {
    if (matchAll) {
      if (supertagNodeIds.every((stId) => tags.has(stId))) {
        matchingNodeIds.push(nodeId)
      }
    } else {
      if (supertagNodeIds.some((stId) => tags.has(stId))) {
        matchingNodeIds.push(nodeId)
      }
    }
  }

  return matchingNodeIds
}

// ============================================================================
// Supertag <-> ItemType Sync (for legacy system compatibility)
// ============================================================================

/**
 * Mapping from supertag systemIds to ItemType values
 * Used to sync node-based supertags with legacy itemTypes table
 */
export const SUPERTAG_TO_ITEM_TYPE: Record<string, AppType> = {
  [SYSTEM_SUPERTAGS.TOOL]: 'tool',
  [SYSTEM_SUPERTAGS.REPO]: 'remote-repo',
  [SYSTEM_SUPERTAGS.CONCEPT]: 'concept',
  // Generic item supertag maps to 'html' as default
  [SYSTEM_SUPERTAGS.ITEM]: 'html',
}

/**
 * Mapping from ItemType values to supertag systemIds
 */
export const ITEM_TYPE_TO_SUPERTAG: Record<AppType, string> = {
  tool: SYSTEM_SUPERTAGS.TOOL,
  'remote-repo': SYSTEM_SUPERTAGS.REPO,
  concept: SYSTEM_SUPERTAGS.CONCEPT,
  html: SYSTEM_SUPERTAGS.ITEM,
  typescript: SYSTEM_SUPERTAGS.ITEM, // typescript items use generic item supertag
}

/**
 * Convert a node's supertags to ItemType values
 * @param supertags Array of supertag systemIds
 * @returns Array of ItemType values (deduplicated)
 */
export function supertagsToItemTypes(supertags: string[]): AppType[] {
  const types = new Set<AppType>()
  for (const st of supertags) {
    const itemType = SUPERTAG_TO_ITEM_TYPE[st]
    if (itemType) {
      types.add(itemType)
    }
  }
  return Array.from(types)
}

/**
 * Convert ItemType values to supertag systemIds
 * @param itemTypes Array of ItemType values
 * @returns Array of supertag systemIds (deduplicated)
 */
export function itemTypesToSupertags(types: AppType[]): string[] {
  const supertags = new Set<string>()
  for (const t of types) {
    const supertag = ITEM_TYPE_TO_SUPERTAG[t]
    if (supertag) {
      supertags.add(supertag)
    }
  }
  return Array.from(supertags)
}

/**
 * Sync a node's supertags to the itemTypes junction table
 * This function:
 * 1. Reads the node's supertags
 * 2. Converts them to ItemType values
 * 3. Updates the itemTypes table to match
 *
 * @param db Database instance
 * @param nodeId Node UUID
 * @param itemId Legacy item ID (from node's systemId, e.g., 'item:my-app' -> 'my-app')
 * @returns true if sync succeeded, false if node not found
 */
export function syncNodeSupertagsToItemTypes(
  db: NodeDatabase,
  nodeId: string,
  itemId: string,
): boolean {
  return runMutationTransaction(db, (tx) => {
    // Get current supertags from node
    const supertagSystemIds = getNodeSupertagSystemIds(tx, nodeId)
    if (supertagSystemIds.length === 0) return false

    // Convert to ItemTypes
    const types = supertagsToItemTypes(supertagSystemIds)
    if (types.length === 0) return false

    // Delete existing itemTypes entries for this item
    tx.delete(itemTypes).where(eq(itemTypes.itemId, itemId)).run()

    // Insert new itemTypes entries
    // order=0 is the primary/display type (isPrimary column was removed; see
    // item-schema.ts - order now encodes the same "first = primary" concept)
    for (let i = 0; i < types.length; i++) {
      tx.insert(itemTypes)
        .values({
          itemId,
          type: types[i],
          order: i,
        })
        .run()
    }

    return true
  })
}

/**
 * Sync the itemTypes table to a node's supertags
 * This function:
 * 1. Reads the item's types from itemTypes table
 * 2. Converts them to supertag systemIds
 * 3. Updates the node's supertags to match
 *
 * @param db Database instance
 * @param itemId Legacy item ID
 * @param nodeId Node UUID
 * @returns true if sync succeeded, false if item has no types
 */
export function syncItemTypesToNodeSupertags(
  db: ReturnType<typeof getDatabase>,
  itemId: string,
  nodeId: string,
): boolean {
  // Get current types from itemTypes table
  const typeEntries = db
    .select()
    .from(itemTypes)
    .where(eq(itemTypes.itemId, itemId))
    .all()

  if (typeEntries.length === 0) return false

  // Sort by order (order=0 is the primary/display type)
  typeEntries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // Convert to supertag systemIds
  const types = typeEntries.map((e) => e.type)
  const supertagSystemIds = itemTypesToSupertags(types)

  if (supertagSystemIds.length === 0) return false

  // Update node's supertags
  setNodeSupertags(db, nodeId, supertagSystemIds)

  return true
}

/**
 * Get the item ID from a node's systemId
 * Node systemIds follow the pattern 'item:{itemId}'
 *
 * @param nodeSystemId Node's systemId (e.g., 'item:my-app')
 * @returns The item ID (e.g., 'my-app'), or null if not an item node
 */
export function extractItemIdFromNodeSystemId(
  nodeSystemId: string | null,
): string | null {
  if (!nodeSystemId || !nodeSystemId.startsWith('item:')) return null
  return nodeSystemId.slice(5) // Remove 'item:' prefix
}

/**
 * Sync all item nodes' supertags to the itemTypes table
 * This is useful for batch migration or consistency checks
 *
 * @param db Database instance
 * @returns Number of items synced
 */
export function syncAllNodeSupertagsToItemTypes(
  db: ReturnType<typeof getDatabase>,
): number {
  // Find all item nodes (systemId starts with 'item:')
  const itemNodes = db
    .select()
    .from(nodes)
    .all()
    .filter(
      (n) =>
        n.systemId !== null &&
        n.systemId.startsWith('item:') &&
        n.deletedAt === null,
    )

  let syncedCount = 0
  for (const node of itemNodes) {
    const itemId = extractItemIdFromNodeSystemId(node.systemId)
    if (itemId) {
      const success = syncNodeSupertagsToItemTypes(db, node.id, itemId)
      if (success) syncedCount++
    }
  }

  return syncedCount
}
