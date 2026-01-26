/**
 * node.service.ts - Core node operations
 *
 * Provides CRUD and query functions for the node-based architecture.
 *
 * For NEW mini-apps: Use the Write API directly (createNode, setProperty, etc.)
 * For LEGACY migration: Use adapters from ./adapters.ts
 */

import { and, eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { getDatabase } from '../client/master-client.js'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '../schemas/node-schema.js'
import { itemTypes, type AppType } from '../schemas/item-schema.js'

// ============================================================================
// Types
// ============================================================================

export interface AssembledNode {
  id: string
  content: string | null
  systemId: string | null
  ownerId: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  properties: Record<string, PropertyValue[]>
  supertags: { id: string; content: string; systemId: string | null }[]
}

export interface PropertyValue {
  value: any
  rawValue: string
  fieldNodeId: string
  fieldName: string
  fieldSystemId: string | null
  order: number
}

export interface CreateNodeOptions {
  content: string
  systemId?: string
  ownerId?: string
  supertagSystemId?: string // e.g., 'supertag:note', 'supertag:task'
}

// ============================================================================
// System Node Cache (runtime cache for field/supertag lookups)
// ============================================================================

const systemNodeCache = new Map<string, { id: string; content: string }>()

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
 * Clear system node cache (call after bootstrap or migration)
 */
export function clearSystemNodeCache(): void {
  systemNodeCache.clear()
}

/**
 * Get all ancestor supertags by walking the field:extends chain
 * Returns IDs in order from immediate parent to root ancestor
 */
export function getAncestorSupertags(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
  maxDepth: number = 10,
): string[] {
  const extendsField = getSystemNode(db, SYSTEM_FIELDS.EXTENDS)
  if (!extendsField) return []

  const ancestors: string[] = []
  const visited = new Set<string>()
  let currentId = supertagId

  for (let depth = 0; depth < maxDepth; depth++) {
    if (visited.has(currentId)) break // Prevent cycles
    visited.add(currentId)

    // Find the extends property of the current supertag
    const extendsProp = db
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.nodeId, currentId))
      .all()
      .find((p) => p.fieldNodeId === extendsField.id)

    if (!extendsProp) break

    try {
      const parentId = JSON.parse(extendsProp.value || '')
      if (typeof parentId === 'string' && parentId) {
        ancestors.push(parentId)
        currentId = parentId
      } else {
        break
      }
    } catch {
      break
    }
  }

  return ancestors
}

/**
 * Get field definitions from a supertag (fields that the supertag defines for its instances)
 * Returns map of fieldSystemId -> default value (or undefined if no default)
 */
export function getSupertagFieldDefinitions(
  db: ReturnType<typeof getDatabase>,
  supertagId: string,
): Map<
  string,
  { fieldNodeId: string; fieldName: string; defaultValue?: unknown }
> {
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
  ]
  for (const sf of systemFields) {
    const node = getSystemNode(db, sf)
    if (node) systemFieldIds.add(node.id)
  }

  for (const prop of props) {
    if (systemFieldIds.has(prop.fieldNodeId)) continue

    const fieldNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.id, prop.fieldNodeId))
      .get()

    if (fieldNode && fieldNode.systemId) {
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
 * @deprecated Use findNodeById or findNodeBySystemId instead
 */
export function findNode(
  db: ReturnType<typeof getDatabase>,
  identifier: string,
): AssembledNode | null {
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
): AssembledNode | null {
  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) return null

  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()

  // Build field info cache
  const fieldCache = new Map<
    string,
    { content: string; systemId: string | null }
  >()
  for (const prop of props) {
    if (!fieldCache.has(prop.fieldNodeId)) {
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
    const fieldName = fieldInfo?.content || prop.fieldNodeId

    let parsedValue: unknown = prop.value
    try {
      parsedValue = JSON.parse(prop.value || 'null')
    } catch {
      // Keep as string
    }

    const pv: PropertyValue = {
      value: parsedValue,
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
      const stNode = db
        .select()
        .from(nodes)
        .where(eq(nodes.id, parsedValue))
        .get()
      if (stNode) {
        assembled.supertags.push({
          id: stNode.id,
          content: stNode.content || '',
          systemId: stNode.systemId,
        })
      }
    }
  }

  return assembled
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
): AssembledNode | null {
  // Start with base assembled node
  const node = assembleNode(db, nodeId)
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
    // Get all ancestors (immediate supertag + its parents)
    const supertagChain = [
      supertag.id,
      ...getAncestorSupertags(db, supertag.id),
    ]

    // Process from root to leaf (so child supertag values override parent values)
    const reversedChain = [...supertagChain].reverse()

    for (const stId of reversedChain) {
      const fieldDefs = getSupertagFieldDefinitions(db, stId)

      for (const [fieldSystemId, def] of fieldDefs) {
        // Skip if node already has this field
        if (existingFieldSystemIds.has(fieldSystemId)) continue

        // Add inherited field with default value
        if (def.defaultValue !== undefined && def.defaultValue !== null) {
          const inheritedPv: PropertyValue = {
            value: def.defaultValue,
            rawValue: JSON.stringify(def.defaultValue),
            fieldNodeId: def.fieldNodeId,
            fieldName: def.fieldName,
            fieldSystemId: fieldSystemId,
            order: 0,
          }

          if (!node.properties[def.fieldName]) {
            node.properties[def.fieldName] = []
          }
          node.properties[def.fieldName].push(inheritedPv)
          existingFieldSystemIds.add(fieldSystemId)
        }
      }
    }
  }

  return node
}

// ============================================================================
// Write API - Create/Update/Delete nodes (for new mini-apps)
// ============================================================================

/**
 * Create a new node with optional supertag
 */
export function createNode(
  db: ReturnType<typeof getDatabase>,
  options: CreateNodeOptions,
): string {
  const nodeId = uuidv7()
  const now = new Date()

  db.insert(nodes)
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

  // Assign supertag if provided
  if (options.supertagSystemId) {
    const supertag = getSystemNode(db, options.supertagSystemId)
    const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
    if (supertag && supertagField) {
      setProperty(db, nodeId, SYSTEM_FIELDS.SUPERTAG, supertag.id)
    }
  }

  return nodeId
}

/**
 * Update node content
 */
export function updateNodeContent(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  content: string,
): void {
  db.update(nodes)
    .set({
      content,
      contentPlain: content.toLowerCase(),
      updatedAt: new Date(),
    })
    .where(eq(nodes.id, nodeId))
    .run()
}

/**
 * Soft delete a node
 */
export function deleteNode(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
): void {
  db.update(nodes)
    .set({ deletedAt: new Date() })
    .where(eq(nodes.id, nodeId))
    .run()
}

/**
 * Set a property value (creates or updates)
 */
export function setProperty(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldSystemId: string,
  value: unknown,
  order: number = 0,
): void {
  const field = getSystemNode(db, fieldSystemId)
  if (!field) throw new Error(`Field not found: ${fieldSystemId}`)

  const jsonValue = JSON.stringify(value)
  const now = new Date()

  // Check if property exists
  const existing = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .find((p) => p.fieldNodeId === field.id && p.order === order)

  if (existing) {
    db.update(nodeProperties)
      .set({ value: jsonValue, updatedAt: now })
      .where(eq(nodeProperties.id, existing.id))
      .run()
  } else {
    db.insert(nodeProperties)
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
}

/**
 * Add a value to a multi-value property (like tags, dependencies)
 */
export function addPropertyValue(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldSystemId: string,
  value: unknown,
): void {
  const field = getSystemNode(db, fieldSystemId)
  if (!field) throw new Error(`Field not found: ${fieldSystemId}`)

  // Get current max order
  const existing = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .filter((p) => p.fieldNodeId === field.id)

  const maxOrder = existing.reduce((max, p) => Math.max(max, p.order || 0), -1)

  db.insert(nodeProperties)
    .values({
      nodeId,
      fieldNodeId: field.id,
      value: JSON.stringify(value),
      order: maxOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
}

/**
 * Remove all property values for a field
 */
export function clearProperty(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldSystemId: string,
): void {
  const field = getSystemNode(db, fieldSystemId)
  if (!field) return

  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .filter((p) => p.fieldNodeId === field.id)

  for (const prop of props) {
    db.delete(nodeProperties).where(eq(nodeProperties.id, prop.id)).run()
  }
}

/**
 * Link two nodes via a field (e.g., set parent, add dependency)
 */
export function linkNodes(
  db: ReturnType<typeof getDatabase>,
  fromNodeId: string,
  fieldSystemId: string,
  toNodeId: string,
  append: boolean = false,
): void {
  if (append) {
    addPropertyValue(db, fromNodeId, fieldSystemId, toNodeId)
  } else {
    setProperty(db, fromNodeId, fieldSystemId, toNodeId)
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
  supertagSystemId: string,
): string[] {
  const targetSupertag = getSystemNode(db, supertagSystemId)
  if (!targetSupertag) return []

  const extendsField = getSystemNode(db, SYSTEM_FIELDS.EXTENDS)
  if (!extendsField) return []

  const allSupertagIds = new Set<string>([targetSupertag.id])

  // Find child supertags (single level for now)
  const childSupertags = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, extendsField.id))
    .all()
    .filter((p) => {
      try {
        return JSON.parse(p.value || '') === targetSupertag.id
      } catch {
        return false
      }
    })

  for (const child of childSupertags) {
    allSupertagIds.add(child.nodeId)
  }

  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  const nodeIds: string[] = []
  for (const stId of allSupertagIds) {
    const withSupertag = db
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.fieldNodeId, supertagField.id))
      .all()
      .filter((p) => {
        try {
          return JSON.parse(p.value || '') === stId
        } catch {
          return false
        }
      })

    for (const p of withSupertag) {
      if (!nodeIds.includes(p.nodeId)) nodeIds.push(p.nodeId)
    }
  }

  return nodeIds
}

/**
 * Get all assembled nodes with a supertag (with inheritance)
 */
export function getNodesBySupertagWithInheritance(
  db: ReturnType<typeof getDatabase>,
  supertagSystemId: string,
): AssembledNode[] {
  const nodeIds = getNodeIdsBySupertagWithInheritance(db, supertagSystemId)
  return nodeIds
    .map((id) => assembleNode(db, id))
    .filter((n): n is AssembledNode => n !== null)
}

// ============================================================================
// Property Helpers (for reading assembled nodes)
// ============================================================================

/**
 * Get single property value from assembled node
 */
export function getProperty<T = unknown>(
  node: AssembledNode,
  fieldName: string,
): T | undefined {
  const props = node.properties[fieldName]
  if (!props || props.length === 0) return undefined
  return props[0].value as T
}

/**
 * Get all property values from assembled node (for multi-value fields)
 */
export function getPropertyValues<T = unknown>(
  node: AssembledNode,
  fieldName: string,
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
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .filter((p) => p.fieldNodeId === supertagField.id)

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
    .filter((st) => st.systemId !== null)
    .map((st) => st.systemId as string)
}

/**
 * Set supertags for a node (replaces all existing supertags)
 * @param db Database instance
 * @param nodeId Node UUID to update
 * @param supertagSystemIds Array of supertag systemIds (e.g., ['supertag:tool', 'supertag:repo'])
 */
export function setNodeSupertags(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  supertagSystemIds: string[],
): void {
  // Verify node exists
  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) throw new Error(`Node not found: ${nodeId}`)

  // Clear existing supertags
  clearProperty(db, nodeId, SYSTEM_FIELDS.SUPERTAG)

  // Add new supertags
  for (let i = 0; i < supertagSystemIds.length; i++) {
    const supertagSystemId = supertagSystemIds[i]
    const supertagNode = getSystemNode(db, supertagSystemId)
    if (supertagNode) {
      addPropertyValue(db, nodeId, SYSTEM_FIELDS.SUPERTAG, supertagNode.id)
    }
  }

  // Update node timestamp
  db.update(nodes).set({ updatedAt: new Date() }).where(eq(nodes.id, nodeId)).run()
}

/**
 * Add a supertag to a node (if not already present)
 * @param db Database instance
 * @param nodeId Node UUID to update
 * @param supertagSystemId Supertag systemId (e.g., 'supertag:tool')
 * @returns true if added, false if already present
 */
export function addNodeSupertag(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  supertagSystemId: string,
): boolean {
  // Check if already has this supertag
  const currentSupertags = getNodeSupertagSystemIds(db, nodeId)
  if (currentSupertags.includes(supertagSystemId)) {
    return false
  }

  const supertagNode = getSystemNode(db, supertagSystemId)
  if (!supertagNode) throw new Error(`Supertag not found: ${supertagSystemId}`)

  addPropertyValue(db, nodeId, SYSTEM_FIELDS.SUPERTAG, supertagNode.id)

  // Update node timestamp
  db.update(nodes).set({ updatedAt: new Date() }).where(eq(nodes.id, nodeId)).run()

  return true
}

/**
 * Remove a supertag from a node
 * @param db Database instance
 * @param nodeId Node UUID to update
 * @param supertagSystemId Supertag systemId to remove
 * @returns true if removed, false if not found
 */
export function removeNodeSupertag(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  supertagSystemId: string,
): boolean {
  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  const supertagNode = getSystemNode(db, supertagSystemId)
  if (!supertagField || !supertagNode) return false

  // Find and delete the specific supertag property
  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .filter((p) => {
      if (p.fieldNodeId !== supertagField.id) return false
      try {
        return JSON.parse(p.value || '') === supertagNode.id
      } catch {
        return false
      }
    })

  if (props.length === 0) return false

  for (const prop of props) {
    db.delete(nodeProperties).where(eq(nodeProperties.id, prop.id)).run()
  }

  // Update node timestamp
  db.update(nodes).set({ updatedAt: new Date() }).where(eq(nodes.id, nodeId)).run()

  return true
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

  // Assemble and return nodes
  return matchingNodeIds
    .map((id) => assembleNode(db, id))
    .filter((n): n is AssembledNode => n !== null)
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
  // Generic item supertag maps to 'html' as default
  [SYSTEM_SUPERTAGS.ITEM]: 'html',
}

/**
 * Mapping from ItemType values to supertag systemIds
 */
export const ITEM_TYPE_TO_SUPERTAG: Record<AppType, string> = {
  tool: SYSTEM_SUPERTAGS.TOOL,
  'remote-repo': SYSTEM_SUPERTAGS.REPO,
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
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  itemId: string,
): boolean {
  // Get current supertags from node
  const supertagSystemIds = getNodeSupertagSystemIds(db, nodeId)
  if (supertagSystemIds.length === 0) return false

  // Convert to ItemTypes
  const types = supertagsToItemTypes(supertagSystemIds)
  if (types.length === 0) return false

  // Delete existing itemTypes entries for this item
  db.delete(itemTypes).where(eq(itemTypes.itemId, itemId)).run()

  // Insert new itemTypes entries
  // First type is primary by default
  for (let i = 0; i < types.length; i++) {
    db.insert(itemTypes)
      .values({
        itemId,
        type: types[i],
        isPrimary: i === 0,
        order: i,
      })
      .run()
  }

  return true
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

  // Sort by order, primary first
  typeEntries.sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1
    if (!a.isPrimary && b.isPrimary) return 1
    return (a.order ?? 0) - (b.order ?? 0)
  })

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
