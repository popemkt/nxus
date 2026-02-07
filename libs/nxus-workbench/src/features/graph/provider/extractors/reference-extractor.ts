/**
 * Reference Edge Extractor
 *
 * Extracts edges from generic node-type properties.
 * These are properties that reference other nodes but aren't explicit
 * dependencies, hierarchy, or tags.
 *
 * Examples: field:commands, field:requires, or custom node-type fields.
 */

import type { AssembledNode, PropertyValue } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'
import type { EdgeExtractionContext, GraphEdge } from '../types.js'

/** Fields handled by dedicated extractors (excluded from generic reference extraction) */
const DEDICATED_EXTRACTORS_FIELDS = new Set([
  // Handled by dependency-extractor
  SYSTEM_FIELDS.DEPENDENCIES,
  // Handled by hierarchy-extractor
  SYSTEM_FIELDS.PARENT,
  // Handled by tag extraction (virtual nodes)
  SYSTEM_FIELDS.TAGS,
  // System fields that aren't visualized as graph edges
  SYSTEM_FIELDS.SUPERTAG,
  SYSTEM_FIELDS.EXTENDS,
  SYSTEM_FIELDS.FIELD_TYPE,
])

/** Fields that are known to contain node references */
const KNOWN_REFERENCE_FIELDS = new Set([
  SYSTEM_FIELDS.COMMANDS,
  SYSTEM_FIELDS.REQUIRES,
  SYSTEM_FIELDS.TARGET,
])

/**
 * Extract reference edges from node-type properties.
 *
 * @param node - The source node to extract references from
 * @param context - Context with node lookups for validation
 * @returns Array of GraphEdge representing references
 */
export function extractReferenceEdges(
  node: AssembledNode,
  context: EdgeExtractionContext,
): GraphEdge[] {
  const edges: GraphEdge[] = []
  const entries = Object.entries(node.properties) as [string, PropertyValue[]][]

  for (const [fieldKey, propValues] of entries) {
    // Skip fields handled by dedicated extractors
    if (DEDICATED_EXTRACTORS_FIELDS.has(fieldKey)) {
      continue
    }

    // Skip non-reference fields (scalar types like text, number, etc.)
    // We use the known fields set plus UUID detection heuristic
    const isKnownReferenceField = KNOWN_REFERENCE_FIELDS.has(fieldKey)

    for (const prop of propValues) {
      const targetIds = parseNodeReferences(prop.value, isKnownReferenceField)

      for (const targetId of targetIds) {
        // Don't create self-references
        if (targetId === node.id) {
          continue
        }

        // Only create edge if target exists in our graph
        if (!context.nodeMap.has(targetId)) {
          continue
        }

        edges.push({
          id: `${node.id}-reference-${fieldKey}-${targetId}`,
          source: node.id,
          target: targetId,
          type: 'reference',
          label: prop.fieldName || fieldKey.replace('field:', ''),
          direction: 'outgoing',
          isHighlighted: false,
          isInLocalGraph: false,
        })
      }
    }
  }

  return edges
}

/**
 * Parse node references from a property value.
 * Uses UUID pattern detection to identify potential node IDs.
 *
 * @param value - The property value to parse
 * @param isKnownReferenceField - If true, be more lenient with ID detection
 */
function parseNodeReferences(value: unknown, isKnownReferenceField: boolean): string[] {
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

    // For known reference fields, also try comma-separated IDs
    if (isKnownReferenceField && value.includes(',')) {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter((id) => uuidPattern.test(id))
    }
  }

  return []
}
