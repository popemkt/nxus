/**
 * Backlink Edge Extractor
 *
 * Extracts incoming edges by finding nodes that reference the target node.
 * Unlike other extractors that iterate through a node's properties,
 * backlinks are computed by scanning other nodes' properties.
 *
 * This is typically called with a pre-computed backlink map to avoid O(n²) lookups.
 */

import type { AssembledNode, PropertyValue } from '@nxus/db'
import { FIELD_NAMES } from '@nxus/db'
import type { EdgeExtractionContext, GraphEdge } from '../types.js'

/** Fields that create explicit relationships (excluded from backlink detection) */
const EXPLICIT_RELATIONSHIP_FIELDS = new Set([
  FIELD_NAMES.DEPENDENCIES,
  FIELD_NAMES.PARENT,
  FIELD_NAMES.TAGS,
  FIELD_NAMES.SUPERTAG,
  FIELD_NAMES.EXTENDS,
])

/**
 * Build a backlink map from all nodes.
 *
 * Scans all nodes' properties to find references to other nodes.
 * Returns a map of targetNodeId -> array of { sourceNodeId, fieldName }
 *
 * @param nodes - All nodes to scan
 * @returns Map of node ID to array of references pointing to it
 */
export function buildBacklinkMap(
  nodes: AssembledNode[],
): Map<string, Array<{ sourceId: string; fieldName: string }>> {
  const backlinkMap = new Map<string, Array<{ sourceId: string; fieldName: string }>>()

  for (const node of nodes) {
    const entries = Object.entries(node.properties) as [string, PropertyValue[]][]
    for (const [fieldKey, propValues] of entries) {
      // Skip explicit relationship fields - they're handled by other extractors
      if (EXPLICIT_RELATIONSHIP_FIELDS.has(fieldKey)) {
        continue
      }

      for (const prop of propValues) {
        const targetIds = parseNodeReferences(prop.value)

        for (const targetId of targetIds) {
          // Don't create self-references
          if (targetId === node.id) {
            continue
          }

          const existing = backlinkMap.get(targetId)
          if (existing) {
            existing.push({ sourceId: node.id, fieldName: prop.fieldName })
          } else {
            backlinkMap.set(targetId, [{ sourceId: node.id, fieldName: prop.fieldName }])
          }
        }
      }
    }
  }

  return backlinkMap
}

/**
 * Extract backlink edges for a node using a pre-computed backlink map.
 *
 * @param node - The target node to find backlinks for
 * @param context - Context with node lookups for validation
 * @param backlinkMap - Pre-computed map of targetId -> references
 * @returns Array of GraphEdge representing incoming references
 */
export function extractBacklinkEdges(
  node: AssembledNode,
  context: EdgeExtractionContext,
  backlinkMap: Map<string, Array<{ sourceId: string; fieldName: string }>>,
): GraphEdge[] {
  const edges: GraphEdge[] = []

  const backlinks = backlinkMap.get(node.id)
  if (!backlinks || backlinks.length === 0) {
    return edges
  }

  for (const { sourceId, fieldName } of backlinks) {
    // Only create edge if source exists in our graph
    if (!context.nodeMap.has(sourceId)) {
      continue
    }

    edges.push({
      id: `${sourceId}-backlink-${node.id}`,
      source: sourceId, // The node that references us
      target: node.id, // This node (being referenced)
      type: 'backlink',
      label: fieldName || 'references',
      direction: 'incoming', // This is an incoming reference to the target node
      isHighlighted: false,
      isInLocalGraph: false,
    })
  }

  return edges
}

/**
 * Parse node references from a property value.
 * Attempts to identify UUID-like strings that could be node IDs.
 */
function parseNodeReferences(value: unknown): string[] {
  if (!value) {
    return []
  }

  // UUID pattern (rough match for efficiency)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Already an array
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === 'string' && uuidPattern.test(id))
  }

  // Single string
  if (typeof value === 'string') {
    // Check if it looks like a UUID
    if (uuidPattern.test(value)) {
      return [value]
    }

    // Check if it's a JSON array
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === 'string' && uuidPattern.test(id))
        }
      } catch {
        // Not valid JSON
      }
    }
  }

  return []
}
