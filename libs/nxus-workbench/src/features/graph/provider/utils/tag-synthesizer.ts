/**
 * Tag Synthesizer Utilities
 *
 * Creates virtual tag nodes and tag edges for graph visualization.
 * When includeTags is enabled, tags become first-class nodes in the graph.
 */

import type { AssembledNode } from '@nxus/db'
import { FIELD_NAMES } from '@nxus/db'
import type { GraphEdge, GraphNode } from '../types.js'

/**
 * Result of tag synthesis.
 */
export interface TagSynthesisResult {
  /** Virtual tag nodes to add to the graph */
  tagNodes: GraphNode[]
  /** Tag edges connecting nodes to their tags */
  tagEdges: GraphEdge[]
}

/**
 * Synthesize virtual tag nodes and edges from assembled nodes.
 *
 * This function:
 * 1. Collects all unique tags referenced by nodes
 * 2. Creates virtual GraphNode entries for each tag
 * 3. Creates GraphEdge entries connecting nodes to their tags
 *
 * @param sourceNodes - Original AssembledNodes to extract tags from
 * @param existingNodeIds - Set of node IDs already in the graph (to avoid duplicates)
 * @returns TagSynthesisResult with virtual nodes and edges
 */
export function synthesizeTags(
  sourceNodes: AssembledNode[],
  existingNodeIds: Set<string>,
): TagSynthesisResult {
  // Collect all unique tag IDs and their info
  const tagInfoMap = new Map<
    string,
    { id: string; name: string; referenceCount: number }
  >()

  // Track which nodes reference which tags
  const nodeTagReferences: Array<{ nodeId: string; tagId: string }> = []

  for (const node of sourceNodes) {
    const tagRefs = extractTagReferences(node)

    for (const tagRef of tagRefs) {
      // Skip if this tag ID is already a real node in the graph
      if (existingNodeIds.has(tagRef.id)) {
        continue
      }

      // Track the reference
      nodeTagReferences.push({ nodeId: node.id, tagId: tagRef.id })

      // Update or create tag info
      const existing = tagInfoMap.get(tagRef.id)
      if (existing) {
        existing.referenceCount++
      } else {
        tagInfoMap.set(tagRef.id, {
          id: tagRef.id,
          name: tagRef.name,
          referenceCount: 1,
        })
      }
    }
  }

  // Create virtual tag nodes
  const tagNodes: GraphNode[] = []
  for (const tagInfo of tagInfoMap.values()) {
    tagNodes.push(createVirtualTagNode(tagInfo))
  }

  // Create tag edges
  const tagEdges: GraphEdge[] = []
  for (const ref of nodeTagReferences) {
    tagEdges.push(createTagEdge(ref.nodeId, ref.tagId))
  }

  return { tagNodes, tagEdges }
}

/**
 * Extract tag references from an AssembledNode.
 *
 * Tags can be stored in:
 * - field:tags property (array of node IDs)
 * - Supertags (for supertag-based tagging)
 *
 * @param node - The node to extract tag references from
 * @returns Array of tag references with id and name
 */
function extractTagReferences(
  node: AssembledNode,
): Array<{ id: string; name: string }> {
  const refs: Array<{ id: string; name: string }> = []

  // Extract from field:tags
  const tagsProperty = node.properties[FIELD_NAMES.TAGS]
  if (tagsProperty) {
    for (const prop of tagsProperty) {
      const value = prop.value

      // Could be a single ID or an array
      if (typeof value === 'string' && isValidTagId(value)) {
        refs.push({ id: value, name: extractTagName(value) })
      } else if (Array.isArray(value)) {
        for (const tagId of value) {
          if (typeof tagId === 'string' && isValidTagId(tagId)) {
            refs.push({ id: tagId, name: extractTagName(tagId) })
          }
        }
      }
    }
  }

  return refs
}

/**
 * Check if a value looks like a valid tag ID (UUID format).
 */
function isValidTagId(value: string): boolean {
  // UUIDv4 or UUIDv7 pattern
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidPattern.test(value)
}

/**
 * Extract a display name from a tag ID.
 *
 * In a real implementation, this would look up the tag node's content.
 * For now, we use a placeholder based on the ID.
 */
function extractTagName(tagId: string): string {
  // Short version of the ID for display
  return `Tag ${tagId.substring(0, 8)}`
}

/**
 * Create a virtual GraphNode for a tag.
 */
function createVirtualTagNode(tagInfo: {
  id: string
  name: string
  referenceCount: number
}): GraphNode {
  return {
    id: tagInfo.id,
    label: tagInfo.name,
    type: 'tag',
    isVirtual: true,
    supertag: null, // Tags don't have supertags
    outgoingCount: 0, // Will be computed later
    incomingCount: tagInfo.referenceCount, // Number of nodes referencing this tag
    totalConnections: tagInfo.referenceCount,
    isOrphan: false, // Tags with references are not orphans
    isMatched: false,
    isFocused: false,
    isInLocalGraph: false,
    sourceNode: null, // Virtual nodes don't have source data
  }
}

/**
 * Create a GraphEdge connecting a node to its tag.
 */
function createTagEdge(nodeId: string, tagId: string): GraphEdge {
  return {
    id: `${nodeId}-tag-${tagId}`,
    source: nodeId,
    target: tagId,
    type: 'tag',
    label: 'tag',
    direction: 'outgoing', // Node points to tag
    isHighlighted: false,
    isInLocalGraph: false,
  }
}

/**
 * Merge synthesized tags into existing graph data.
 *
 * @param nodes - Existing graph nodes (will be mutated)
 * @param edges - Existing graph edges (will be mutated)
 * @param synthesis - Tag synthesis result to merge
 */
export function mergeTagSynthesis(
  nodes: GraphNode[],
  edges: GraphEdge[],
  synthesis: TagSynthesisResult,
): void {
  // Add virtual tag nodes
  nodes.push(...synthesis.tagNodes)

  // Add tag edges
  edges.push(...synthesis.tagEdges)

  // Update outgoing counts for nodes that reference tags
  const nodeMap = new Map<string, GraphNode>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  for (const edge of synthesis.tagEdges) {
    const sourceNode = nodeMap.get(edge.source)
    if (sourceNode) {
      sourceNode.outgoingCount++
      sourceNode.totalConnections++
    }
  }
}
