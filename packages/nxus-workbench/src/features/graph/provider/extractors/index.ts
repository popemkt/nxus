/**
 * Edge Extractors
 *
 * Modular functions for extracting graph edges from different relationship types.
 * Each extractor is independently testable and handles a specific edge type.
 */

import type { AssembledNode } from '@nxus/db'
import type { EdgeExtractionContext, GraphEdge } from '../types.js'

// Individual extractors
export { extractDependencyEdges } from './dependency-extractor.js'
export {
  extractBacklinkEdges,
  buildBacklinkMap,
} from './backlink-extractor.js'
export { extractReferenceEdges } from './reference-extractor.js'
export {
  extractHierarchyEdges,
  buildChildrenMap,
} from './hierarchy-extractor.js'

// Import for internal use
import { extractDependencyEdges } from './dependency-extractor.js'
import { extractBacklinkEdges, buildBacklinkMap } from './backlink-extractor.js'
import { extractReferenceEdges } from './reference-extractor.js'
import { extractHierarchyEdges } from './hierarchy-extractor.js'

/**
 * Options for edge extraction.
 * Maps to relevant GraphDataOptions fields.
 */
export interface ExtractEdgesOptions {
  /** Include reference edges (node-type properties) */
  includeRefs: boolean
  /** Include hierarchy edges (parent/child relationships) */
  includeHierarchy: boolean
}

/**
 * Extract all edges from a collection of nodes.
 *
 * This is the main entry point for edge extraction. It:
 * 1. Pre-computes the backlink map for efficient backlink detection
 * 2. Iterates through all nodes, applying each extractor
 * 3. Deduplicates edges (same source-target-type combination)
 *
 * @param nodes - All AssembledNodes to extract edges from
 * @param context - Context with node lookups
 * @param options - Options controlling which edge types to include
 * @returns Deduplicated array of all edges
 */
export function extractAllEdges(
  nodes: AssembledNode[],
  context: EdgeExtractionContext,
  options: ExtractEdgesOptions,
): GraphEdge[] {
  const allEdges: GraphEdge[] = []
  const seenEdgeIds = new Set<string>()

  // Pre-compute backlink map for efficient backlink extraction
  const backlinkMap = buildBacklinkMap(nodes)

  for (const node of nodes) {
    // 1. Always extract dependency edges (explicit relationships)
    const dependencyEdges = extractDependencyEdges(node, context)
    for (const edge of dependencyEdges) {
      if (!seenEdgeIds.has(edge.id)) {
        seenEdgeIds.add(edge.id)
        allEdges.push(edge)
      }
    }

    // 2. Extract backlink edges (incoming references)
    // These complement dependencies by showing who references this node
    const backlinkEdges = extractBacklinkEdges(node, context, backlinkMap)
    for (const edge of backlinkEdges) {
      if (!seenEdgeIds.has(edge.id)) {
        seenEdgeIds.add(edge.id)
        allEdges.push(edge)
      }
    }

    // 3. Optionally extract reference edges (generic node-type properties)
    if (options.includeRefs) {
      const referenceEdges = extractReferenceEdges(node, context)
      for (const edge of referenceEdges) {
        if (!seenEdgeIds.has(edge.id)) {
          seenEdgeIds.add(edge.id)
          allEdges.push(edge)
        }
      }
    }

    // 4. Optionally extract hierarchy edges (parent/child)
    if (options.includeHierarchy) {
      const hierarchyEdges = extractHierarchyEdges(node, context)
      for (const edge of hierarchyEdges) {
        if (!seenEdgeIds.has(edge.id)) {
          seenEdgeIds.add(edge.id)
          allEdges.push(edge)
        }
      }
    }
  }

  return allEdges
}

/**
 * Create extraction context from nodes.
 *
 * Utility function to build the context object needed by extractors.
 *
 * @param nodes - AssembledNodes to process
 * @param graphNodeMap - Map of node ID to GraphNode (already created)
 * @returns EdgeExtractionContext for use with extractors
 */
export function createExtractionContext(
  nodes: AssembledNode[],
  graphNodeMap: Map<string, { id: string }>,
): EdgeExtractionContext {
  const sourceNodeMap = new Map<string, AssembledNode>()

  for (const node of nodes) {
    sourceNodeMap.set(node.id, node)
  }

  return {
    nodeMap: graphNodeMap as EdgeExtractionContext['nodeMap'],
    sourceNodeMap,
  }
}
