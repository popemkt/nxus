/**
 * Dependency Edge Extractor
 *
 * Extracts edges from `field:dependencies` property values.
 * Dependencies represent explicit outgoing relationships from a node
 * to nodes it depends on.
 */

import type { AssembledNode } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'
import type { EdgeExtractionContext, GraphEdge } from '../types.js'

/**
 * Extract dependency edges from a node.
 *
 * @param node - The source node to extract dependencies from
 * @param context - Context with node lookups for validation
 * @returns Array of GraphEdge representing dependencies
 */
export function extractDependencyEdges(
  node: AssembledNode,
  context: EdgeExtractionContext,
): GraphEdge[] {
  const edges: GraphEdge[] = []

  // Get dependencies from the node's properties
  const dependencyField = SYSTEM_FIELDS.DEPENDENCIES
  const dependencyValues = node.properties[dependencyField]

  if (!dependencyValues || dependencyValues.length === 0) {
    return edges
  }

  for (const prop of dependencyValues) {
    // The value can be a single node ID or an array of node IDs
    const targetIds = parseNodeIds(prop.value)

    for (const targetId of targetIds) {
      // Only create edge if target exists in our graph
      if (!context.nodeMap.has(targetId)) {
        continue
      }

      edges.push({
        id: `${node.id}-dependency-${targetId}`,
        source: node.id,
        target: targetId,
        type: 'dependency',
        label: prop.fieldName || 'depends on',
        direction: 'outgoing',
        isHighlighted: false,
        isInLocalGraph: false,
      })
    }
  }

  return edges
}

/**
 * Parse node IDs from a property value.
 * Handles both single ID strings and JSON arrays of IDs.
 */
function parseNodeIds(value: unknown): string[] {
  if (!value) {
    return []
  }

  // Already an array
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
  }

  // Single string ID
  if (typeof value === 'string') {
    // Check if it's a JSON array
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
        }
      } catch {
        // Not valid JSON, treat as single ID
      }
    }
    return value.length > 0 ? [value] : []
  }

  return []
}
