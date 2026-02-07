/**
 * Hierarchy Edge Extractor
 *
 * Extracts parent-child relationship edges from `field:parent` property.
 * Also uses the `ownerId` field on AssembledNode for hierarchy relationships.
 *
 * The hierarchy edge direction follows the convention:
 * - Child -> Parent is "outgoing" (child depends on / belongs to parent)
 * - Parent -> Child is "incoming" (parent contains child)
 */

import type { AssembledNode } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'
import type { EdgeExtractionContext, GraphEdge } from '../types.js'

/**
 * Extract hierarchy edges from a node.
 *
 * Creates edges for:
 * 1. `field:parent` property (explicit parent relationship)
 * 2. `ownerId` field (database-level hierarchy)
 *
 * @param node - The child node to extract parent relationships from
 * @param context - Context with node lookups for validation
 * @returns Array of GraphEdge representing hierarchy relationships
 */
export function extractHierarchyEdges(
  node: AssembledNode,
  context: EdgeExtractionContext,
): GraphEdge[] {
  const edges: GraphEdge[] = []
  const addedParents = new Set<string>()

  // 1. Check field:parent property
  const parentField = SYSTEM_FIELDS.PARENT
  const parentValues = node.properties[parentField]

  if (parentValues && parentValues.length > 0) {
    for (const prop of parentValues) {
      const parentId = parseParentId(prop.value)

      if (parentId && context.nodeMap.has(parentId) && !addedParents.has(parentId)) {
        addedParents.add(parentId)
        edges.push({
          id: `${node.id}-hierarchy-${parentId}`,
          source: node.id, // Child
          target: parentId, // Parent
          type: 'hierarchy',
          label: 'child of',
          direction: 'outgoing', // Child points to parent
          isHighlighted: false,
          isInLocalGraph: false,
        })
      }
    }
  }

  // 2. Check ownerId (database-level hierarchy)
  if (node.ownerId && context.nodeMap.has(node.ownerId) && !addedParents.has(node.ownerId)) {
    addedParents.add(node.ownerId)
    edges.push({
      id: `${node.id}-hierarchy-${node.ownerId}`,
      source: node.id, // Child
      target: node.ownerId, // Parent (owner)
      type: 'hierarchy',
      label: 'owned by',
      direction: 'outgoing', // Child points to parent
      isHighlighted: false,
      isInLocalGraph: false,
    })
  }

  return edges
}

/**
 * Build a parent-to-children map for reverse hierarchy lookups.
 *
 * @param nodes - All nodes to scan
 * @returns Map of parent ID to array of child IDs
 */
export function buildChildrenMap(nodes: AssembledNode[]): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>()

  for (const node of nodes) {
    const parentIds = new Set<string>()

    // Check field:parent
    const parentField = SYSTEM_FIELDS.PARENT
    const parentValues = node.properties[parentField]

    if (parentValues) {
      for (const prop of parentValues) {
        const parentId = parseParentId(prop.value)
        if (parentId) {
          parentIds.add(parentId)
        }
      }
    }

    // Check ownerId
    if (node.ownerId) {
      parentIds.add(node.ownerId)
    }

    // Add to children map
    for (const parentId of parentIds) {
      const existing = childrenMap.get(parentId)
      if (existing) {
        existing.push(node.id)
      } else {
        childrenMap.set(parentId, [node.id])
      }
    }
  }

  return childrenMap
}

/**
 * Parse a parent ID from a property value.
 */
function parseParentId(value: unknown): string | null {
  if (!value) {
    return null
  }

  // UUID pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (typeof value === 'string' && uuidPattern.test(value)) {
    return value
  }

  // Handle array (take first element)
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]
    if (typeof first === 'string' && uuidPattern.test(first)) {
      return first
    }
  }

  return null
}
