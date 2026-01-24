/**
 * node.service.ts - Core node operations
 *
 * Provides CRUD and query functions for the node-based architecture.
 *
 * For NEW mini-apps: Use the Write API directly (createNode, setProperty, etc.)
 * For LEGACY migration: Use adapters from ./adapters.ts
 */

import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { getDatabase } from '../client/master-client.js'
import { nodeProperties, nodes, SYSTEM_FIELDS } from '../schemas/node-schema.js'

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
  value: unknown
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
