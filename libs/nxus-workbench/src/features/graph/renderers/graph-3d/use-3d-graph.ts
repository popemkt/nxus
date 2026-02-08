/**
 * Hook for managing 3d-force-graph instance
 *
 * Wraps the 3d-force-graph library with React lifecycle management,
 * handles physics updates, and provides a clean API for the Graph3D component.
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import type { ForceGraph3DInstance } from '3d-force-graph'
import type { NodeObject, LinkObject } from 'three-forcegraph'
import type { GraphPhysicsOptions } from '../../store/types'
import type { ForceGraph3DConstructor } from './lazy-loader'

// ============================================================================
// Types
// ============================================================================

/**
 * Extended node type for 3d-force-graph
 * Includes all GraphNode properties plus 3d-force-graph's mutable properties
 */
export interface Graph3DNode extends NodeObject {
  // Required by 3d-force-graph
  id: string

  // From GraphNode
  label: string
  type: 'node' | 'tag' | 'supertag'
  isVirtual: boolean
  supertag: {
    id: string
    name: string
    color: string
  } | null
  outgoingCount: number
  incomingCount: number
  totalConnections: number
  isOrphan: boolean
  isMatched: boolean
  isFocused: boolean
  isInLocalGraph: boolean
  isHighlighted?: boolean

  // Display options
  nodeSize: 'uniform' | 'connections'
  isHovered?: boolean

  // 3d-force-graph adds these at runtime
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
  fx?: number
  fy?: number
  fz?: number
}

/**
 * Extended link type for 3d-force-graph
 * Includes all GraphEdge properties plus 3d-force-graph's mutable properties
 */
export interface Graph3DLink extends LinkObject<Graph3DNode> {
  // Required by 3d-force-graph (source/target can be string or object)
  source: string | Graph3DNode
  target: string | Graph3DNode

  // From GraphEdge
  id: string
  type: 'dependency' | 'backlink' | 'reference' | 'hierarchy' | 'tag'
  label?: string
  direction: 'outgoing' | 'incoming'
  isHighlighted: boolean
  isInLocalGraph: boolean

  // Display options
  isHovered?: boolean

  // 3d-force-graph adds these at runtime
  __curve?: object
  __lineObj?: object
}

/**
 * Graph data format expected by 3d-force-graph
 */
export interface Graph3DData {
  nodes: Graph3DNode[]
  links: Graph3DLink[]
}

/**
 * Options for the use3DGraph hook
 */
export interface Use3DGraphOptions {
  /** ForceGraph3D constructor from lazy loader */
  ForceGraph3D: ForceGraph3DConstructor<Graph3DNode, Graph3DLink>
  /** Physics parameters from store */
  physics: GraphPhysicsOptions
  /** Called when a node is clicked */
  onNodeClick?: (node: Graph3DNode) => void
  /** Called when a node is right-clicked */
  onNodeRightClick?: (node: Graph3DNode) => void
  /** Called when a node is double-clicked */
  onNodeDoubleClick?: (node: Graph3DNode) => void
  /** Called when the background is clicked */
  onBackgroundClick?: () => void
  /** Called when node hover state changes */
  onNodeHover?: (node: Graph3DNode | null) => void
  /** Called when link hover state changes */
  onLinkHover?: (link: Graph3DLink | null) => void
}

/**
 * Return value of the use3DGraph hook
 */
export interface Use3DGraphResult {
  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement>
  /** The 3d-force-graph instance (null until mounted) */
  graphInstance: ForceGraph3DInstance<Graph3DNode, Graph3DLink> | null
  /** Update the graph data */
  setGraphData: (data: Graph3DData) => void
  /** Focus camera on a specific node */
  focusOnNode: (nodeId: string, distance?: number) => void
  /** Reset camera to default position */
  resetCamera: () => void
  /** Pause the physics simulation */
  pauseSimulation: () => void
  /** Resume the physics simulation */
  resumeSimulation: () => void
  /** Reheat the simulation (restart with high energy) */
  reheatSimulation: () => void
  /** Refresh node/link visual styles without resetting positions */
  refreshStyles: () => void
  /** Whether the simulation is currently paused */
  isPaused: boolean
}

// ============================================================================
// Constants
// ============================================================================

/** Default camera distance for focusing on nodes */
const DEFAULT_FOCUS_DISTANCE = 200

/** Default camera position */
const DEFAULT_CAMERA_POSITION = { x: 0, y: 0, z: 500 }

/** Convert a hex color to rgba string with given opacity (cached to avoid per-frame alloc) */
const rgbaCache = new Map<string, string>()
function hexToRgba(hex: string, opacity: number): string {
  const key = hex + opacity
  let result = rgbaCache.get(key)
  if (result) return result
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  result = `rgba(${r}, ${g}, ${b}, ${opacity})`
  rgbaCache.set(key, result)
  return result
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing a 3d-force-graph instance.
 *
 * @example
 * ```tsx
 * const { containerRef, setGraphData, focusOnNode } = use3DGraph({
 *   ForceGraph3D,
 *   physics,
 *   onNodeClick: (node) => setSelectedNode(node.id),
 * })
 *
 * useEffect(() => {
 *   setGraphData({ nodes, links })
 * }, [nodes, links])
 *
 * return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
 * ```
 */
export function use3DGraph(options: Use3DGraphOptions): Use3DGraphResult {
  const {
    ForceGraph3D,
    physics,
    onNodeClick,
    onNodeRightClick,
    onNodeDoubleClick,
    onBackgroundClick,
    onNodeHover,
    onLinkHover,
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraph3DInstance<Graph3DNode, Graph3DLink> | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Store callbacks in refs to avoid re-initializing graph on every render
  const callbackRefs = useRef({
    onNodeClick,
    onNodeRightClick,
    onNodeDoubleClick,
    onBackgroundClick,
    onNodeHover,
    onLinkHover,
  })

  // Update callback refs
  useEffect(() => {
    callbackRefs.current = {
      onNodeClick,
      onNodeRightClick,
      onNodeDoubleClick,
      onBackgroundClick,
      onNodeHover,
      onLinkHover,
    }
  }, [onNodeClick, onNodeRightClick, onNodeDoubleClick, onBackgroundClick, onNodeHover, onLinkHover])

  // Initialize graph instance
  useEffect(() => {
    const container = containerRef.current
    if (!container || !ForceGraph3D) return

    // Create the graph instance
    const graph = new ForceGraph3D(container)
      // Node appearance
      .nodeLabel((node: Graph3DNode) => node.label)
      .nodeVal((node: Graph3DNode) => {
        // Size based on connections
        if (node.nodeSize === 'connections') {
          return 1 + Math.min(node.totalConnections * 0.5, 10)
        }
        return 2
      })
      .nodeColor((node: Graph3DNode) => {
        // Determine base color
        let color: string
        if (node.isFocused) {
          color = '#f59e0b' // Amber-500
        } else if (node.isVirtual) {
          color = '#a855f7' // Purple
        } else {
          color = node.supertag?.color ?? '#6b7280'
        }
        // Apply dimming via RGBA when not in local graph (nodeOpacity doesn't support per-node fn)
        if (!node.isInLocalGraph && !node.isFocused) {
          return hexToRgba(color, 0.3)
        }
        return color
      })
      .nodeOpacity(0.9)
      // Link appearance
      .linkLabel((link: Graph3DLink) => link.label ?? '')
      .linkColor((link: Graph3DLink) => {
        // Dimmed if not in local graph
        if (!link.isInLocalGraph && !link.isHighlighted) {
          return 'rgba(107, 114, 128, 0.15)'
        }
        // Color by direction
        if (link.direction === 'outgoing') {
          return '#14b8a6' // Teal
        }
        return '#8b5cf6' // Violet
      })
      .linkWidth((link: Graph3DLink) => (link.isHighlighted ? 2 : 1))
      .linkOpacity(0.6)
      .linkDirectionalParticles((link: Graph3DLink) => (link.isHighlighted ? 4 : 2))
      .linkDirectionalParticleSpeed(0.005)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor((link: Graph3DLink) => {
        if (link.direction === 'outgoing') {
          return '#14b8a6'
        }
        return '#8b5cf6'
      })
      // Arrow heads
      .linkDirectionalArrowLength(6)
      .linkDirectionalArrowRelPos(1)
      // Interactions
      .onNodeClick((node: Graph3DNode) => {
        callbackRefs.current.onNodeClick?.(node)
      })
      .onNodeRightClick((node: Graph3DNode) => {
        callbackRefs.current.onNodeRightClick?.(node)
      })
      .onNodeHover((node: Graph3DNode | null) => {
        callbackRefs.current.onNodeHover?.(node)
      })
      .onLinkHover((link: Graph3DLink | null) => {
        callbackRefs.current.onLinkHover?.(link)
      })
      .onBackgroundClick(() => {
        callbackRefs.current.onBackgroundClick?.()
      })
      // Enable navigation controls
      .enableNavigationControls(true)
      .enablePointerInteraction(true)
      // Background color
      .backgroundColor('rgba(0, 0, 0, 0)')

    // Store reference
    graphRef.current = graph

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry && graph) {
        graph.width(entry.contentRect.width)
        graph.height(entry.contentRect.height)
      }
    })
    resizeObserver.observe(container)

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      // Note: 3d-force-graph doesn't have a destroy method,
      // but removing the container element should clean up
      graphRef.current = null
    }
  }, [ForceGraph3D])

  // Update physics when they change
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    // Map our physics params to 3d-force-graph's d3Force API
    graph.d3Force('charge')?.strength(-physics.repelForce)
    graph.d3Force('link')?.distance(physics.linkDistance)
    graph.d3Force('center')?.strength?.(physics.centerForce)

    // Reheat simulation to apply changes
    graph.d3ReheatSimulation()
  }, [physics.centerForce, physics.repelForce, physics.linkForce, physics.linkDistance])

  // Set graph data
  const setGraphData = useCallback((data: Graph3DData) => {
    const graph = graphRef.current
    if (!graph) return

    graph.graphData(data)
  }, [])

  // Focus camera on a node
  const focusOnNode = useCallback((nodeId: string, distance: number = DEFAULT_FOCUS_DISTANCE) => {
    const graph = graphRef.current
    if (!graph) return

    const graphData = graph.graphData()
    const node = graphData.nodes.find((n: Graph3DNode) => n.id === nodeId)
    if (node && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
      graph.cameraPosition(
        { x: node.x, y: node.y, z: node.z + distance },
        { x: node.x, y: node.y, z: node.z },
        1000, // Animation duration in ms
      )
    }
  }, [])

  // Reset camera to default position
  const resetCamera = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return

    graph.cameraPosition(
      DEFAULT_CAMERA_POSITION,
      { x: 0, y: 0, z: 0 },
      1000,
    )
  }, [])

  // Pause simulation
  const pauseSimulation = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return

    graph.pauseAnimation()
    setIsPaused(true)
  }, [])

  // Resume simulation
  const resumeSimulation = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return

    graph.resumeAnimation()
    setIsPaused(false)
  }, [])

  // Reheat simulation
  const reheatSimulation = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return

    graph.d3ReheatSimulation()
  }, [])

  // Refresh node/link visual styles without resetting positions or simulation
  const refreshStyles = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return

    // Re-trigger accessor evaluation (pattern from 3d-force-graph docs)
    graph.nodeColor(graph.nodeColor())
  }, [])

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    graphInstance: graphRef.current,
    setGraphData,
    focusOnNode,
    pauseSimulation,
    resumeSimulation,
    reheatSimulation,
    resetCamera,
    refreshStyles,
    isPaused,
  }
}
