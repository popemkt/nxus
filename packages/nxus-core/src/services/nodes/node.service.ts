/**
 * node.service.ts - Core node operations
 *
 * Provides CRUD and assembly functions for the node-based architecture.
 */

import { eq, or } from 'drizzle-orm'
import { getDatabase } from '../../db/client'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '../../db/node-schema'

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

// ============================================================================
// System Node Cache
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

// ============================================================================
// Core Functions
// ============================================================================

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

  // Get supertag field ID
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
 * Find node by systemId or UUID
 */
export function findNode(
  db: ReturnType<typeof getDatabase>,
  identifier: string,
): AssembledNode | null {
  const node = db
    .select()
    .from(nodes)
    .where(or(eq(nodes.systemId, identifier), eq(nodes.id, identifier)))
    .get()

  if (!node) return null
  return assembleNode(db, node.id)
}

/**
 * Get all node IDs that have a specific supertag (with inheritance)
 *
 * If querying for #Item, also returns nodes with #Tool, #Repo, etc.
 */
export function getNodeIdsBySupertagWithInheritance(
  db: ReturnType<typeof getDatabase>,
  supertagSystemId: string,
): string[] {
  // Get the supertag node
  const targetSupertag = getSystemNode(db, supertagSystemId)
  if (!targetSupertag) return []

  // Get all supertags that extend this one (recursive)
  const extendsField = getSystemNode(db, SYSTEM_FIELDS.EXTENDS)
  if (!extendsField) return []

  const allSupertagIds = new Set<string>([targetSupertag.id])

  // Find all supertags that extend our target
  const allSupertags = db
    .select()
    .from(nodes)
    .where(eq(nodes.systemId, SYSTEM_SUPERTAGS.SUPERTAG))
    .all()

  // This is a simplified approach - in production you'd want recursive CTE
  // For now, do a single level of inheritance lookup
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

  // Get supertag field
  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!supertagField) return []

  // Find all nodes with these supertags
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
      if (!nodeIds.includes(p.nodeId)) {
        nodeIds.push(p.nodeId)
      }
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

/**
 * Get property value from assembled node
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
