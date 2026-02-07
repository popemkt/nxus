/**
 * Dagre Layout Hook
 *
 * Provides hierarchical layout using the dagre library.
 * Best for visualizing dependency trees and organizational structures.
 */

import { useCallback, useRef } from 'react'
import dagre from 'dagre'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'

// ============================================================================
// Types
// ============================================================================

/** Dagre layout direction */
export type DagreDirection = 'TB' | 'BT' | 'LR' | 'RL'

/** Position relative to node edge for handle placement */
export type HandlePosition = 'top' | 'bottom' | 'left' | 'right'

/** Options for the dagre layout hook */
export interface UseDagreLayoutOptions {
  /** Layout direction (default: 'LR' for left-to-right) */
  direction?: DagreDirection
  /** Horizontal spacing between nodes (default: 60) */
  nodeSep?: number
  /** Spacing between ranks/levels (default: 120) */
  rankSep?: number
  /** Margin around the graph (default: 50) */
  marginX?: number
  marginY?: number
}

/** Result of a layout computation */
export interface LayoutResult {
  /** Nodes with computed positions */
  nodes: Node[]
  /** Edges (unchanged but included for convenience) */
  edges: Edge[]
}

/** Node dimensions for layout calculation */
interface NodeDimensions {
  width: number
  height: number
}

// ============================================================================
// Constants
// ============================================================================

/** Default node dimensions for simple nodes */
const DEFAULT_SIMPLE_NODE_SIZE = 32

/** Default node dimensions for detailed nodes */
const DEFAULT_DETAILED_NODE_WIDTH = 200
const DEFAULT_DETAILED_NODE_HEIGHT = 80

/** Default layout options */
const DEFAULT_OPTIONS: Required<UseDagreLayoutOptions> = {
  direction: 'LR',
  nodeSep: 60,
  rankSep: 120,
  marginX: 50,
  marginY: 50,
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get node dimensions based on node type.
 */
function getNodeDimensions(node: Node): NodeDimensions {
  const nodeType = node.type || 'simple'

  if (nodeType === 'simple') {
    return {
      width: DEFAULT_SIMPLE_NODE_SIZE,
      height: DEFAULT_SIMPLE_NODE_SIZE,
    }
  }

  return {
    width: DEFAULT_DETAILED_NODE_WIDTH,
    height: DEFAULT_DETAILED_NODE_HEIGHT,
  }
}

/**
 * Get handle positions based on layout direction.
 */
function getHandlePositions(direction: DagreDirection): {
  targetPosition: HandlePosition
  sourcePosition: HandlePosition
} {
  switch (direction) {
    case 'TB': // Top to Bottom
      return { targetPosition: 'top', sourcePosition: 'bottom' }
    case 'BT': // Bottom to Top
      return { targetPosition: 'bottom', sourcePosition: 'top' }
    case 'LR': // Left to Right
      return { targetPosition: 'left', sourcePosition: 'right' }
    case 'RL': // Right to Left
      return { targetPosition: 'right', sourcePosition: 'left' }
    default:
      return { targetPosition: 'left', sourcePosition: 'right' }
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for computing hierarchical graph layouts using dagre.
 *
 * @param options - Layout configuration options
 * @returns Layout computation functions and utilities
 *
 * @example
 * ```tsx
 * const { computeLayout, runLayout } = useDagreLayout({ direction: 'TB' })
 *
 * // Compute layout without updating React Flow
 * const { nodes, edges } = computeLayout(nodes, edges)
 *
 * // Compute layout and update React Flow with animation
 * runLayout()
 * ```
 */
export function useDagreLayout(options: UseDagreLayoutOptions = {}) {
  const { fitView, setNodes, getNodes, getEdges } = useReactFlow()

  // Merge options with defaults
  const config = { ...DEFAULT_OPTIONS, ...options }

  // Cache last computed positions for smoother transitions
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map())

  /**
   * Compute dagre layout for the given nodes and edges.
   * Does not modify React Flow state - returns new positioned nodes.
   */
  const computeLayout = useCallback(
    (inputNodes: Node[], inputEdges: Edge[]): LayoutResult => {
      if (inputNodes.length === 0) {
        positionCache.current.clear()
        return { nodes: [], edges: inputEdges }
      }

      // Create dagre graph
      const dagreGraph = new dagre.graphlib.Graph()
      dagreGraph.setDefaultEdgeLabel(() => ({}))
      dagreGraph.setGraph({
        rankdir: config.direction,
        nodesep: config.nodeSep,
        ranksep: config.rankSep,
        marginx: config.marginX,
        marginy: config.marginY,
      })

      // Add nodes to dagre graph with dimensions
      for (const node of inputNodes) {
        const { width, height } = getNodeDimensions(node)
        dagreGraph.setNode(node.id, { width, height })
      }

      // Add edges to dagre graph
      for (const edge of inputEdges) {
        // Only add edge if both nodes exist
        if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
          dagreGraph.setEdge(edge.source, edge.target)
        }
      }

      // Run dagre layout algorithm
      dagre.layout(dagreGraph)

      // Get handle positions based on direction
      const { targetPosition, sourcePosition } = getHandlePositions(
        config.direction,
      )

      // Map positioned nodes
      const positionedNodes = inputNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        const { width, height } = getNodeDimensions(node)

        // dagre returns center coordinates, convert to top-left
        const position = {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        }

        // Cache position for potential reuse
        positionCache.current.set(node.id, position)

        return {
          ...node,
          position,
          targetPosition,
          sourcePosition,
        } as Node
      })

      return { nodes: positionedNodes, edges: inputEdges }
    },
    [config.direction, config.nodeSep, config.rankSep, config.marginX, config.marginY],
  )

  /**
   * Run layout on current React Flow nodes and edges.
   * Updates React Flow state and fits view with animation.
   */
  const runLayout = useCallback(
    (newDirection?: DagreDirection) => {
      const currentNodes = getNodes()
      const currentEdges = getEdges()

      // Use provided direction or current config
      const direction = newDirection ?? config.direction

      // Temporarily override direction if provided
      const layoutConfig = { ...config, direction }

      // Create dagre graph with potentially new direction
      const dagreGraph = new dagre.graphlib.Graph()
      dagreGraph.setDefaultEdgeLabel(() => ({}))
      dagreGraph.setGraph({
        rankdir: layoutConfig.direction,
        nodesep: layoutConfig.nodeSep,
        ranksep: layoutConfig.rankSep,
        marginx: layoutConfig.marginX,
        marginy: layoutConfig.marginY,
      })

      for (const node of currentNodes) {
        const { width, height } = getNodeDimensions(node)
        dagreGraph.setNode(node.id, { width, height })
      }

      for (const edge of currentEdges) {
        if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
          dagreGraph.setEdge(edge.source, edge.target)
        }
      }

      dagre.layout(dagreGraph)

      const { targetPosition, sourcePosition } = getHandlePositions(
        layoutConfig.direction,
      )

      const positionedNodes = currentNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        const { width, height } = getNodeDimensions(node)

        const position = {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        }

        positionCache.current.set(node.id, position)

        return {
          ...node,
          position,
          targetPosition,
          sourcePosition,
        } as Node
      })

      // Update React Flow state
      setNodes(positionedNodes)

      // Fit view with animation after a short delay
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 })
      }, 50)
    },
    [config, getNodes, getEdges, setNodes, fitView],
  )

  /**
   * Get cached position for a node (useful for incremental updates).
   */
  const getCachedPosition = useCallback((nodeId: string) => {
    return positionCache.current.get(nodeId)
  }, [])

  /**
   * Clear the position cache (useful when graph structure changes significantly).
   */
  const clearCache = useCallback(() => {
    positionCache.current.clear()
  }, [])

  return {
    computeLayout,
    runLayout,
    getCachedPosition,
    clearCache,
    direction: config.direction,
  }
}
