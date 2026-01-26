/**
 * Force Layout Hook
 *
 * Provides force-directed layout using d3-force.
 * Supports physics parameters from the graph store for interactive tuning.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'
import type { GraphPhysicsOptions } from '../../../store/types'
import { DEFAULT_PHYSICS } from '../../../store/defaults'

// ============================================================================
// Types
// ============================================================================

/** Extended node datum for d3-force simulation */
interface ForceNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
  /** Fixed position (if pinned) */
  fx?: number | null
  fy?: number | null
}

/** Link datum for d3-force simulation */
interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
}

/** Options for the force layout hook */
export interface UseForceLayoutOptions {
  /** Physics parameters (default: from store defaults) */
  physics?: Partial<GraphPhysicsOptions>
  /** Whether to run continuous simulation (default: false for static layout) */
  continuous?: boolean
  /** Number of iterations for static layout (default: 300) */
  iterations?: number
  /** Canvas center X coordinate (default: 400) */
  centerX?: number
  /** Canvas center Y coordinate (default: 300) */
  centerY?: number
}

/** Result of a layout computation */
export interface LayoutResult {
  /** Nodes with computed positions */
  nodes: Node[]
  /** Edges (unchanged but included for convenience) */
  edges: Edge[]
}

/** Simulation state for continuous mode */
export interface SimulationState {
  /** Whether the simulation is currently running */
  isRunning: boolean
  /** Simulation alpha (1.0 = hot, 0 = cool/stopped) */
  alpha: number
  /** Number of ticks performed */
  tickCount: number
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
const DEFAULT_OPTIONS: Required<UseForceLayoutOptions> = {
  physics: DEFAULT_PHYSICS,
  continuous: true, // Default to continuous for Obsidian-like feel
  iterations: 300,
  centerX: 400,
  centerY: 300,
}

/**
 * Simulation tuning constants for smooth, Obsidian-like behavior.
 * Based on Logseq's graph implementation which uses d3-force.
 */
const SIMULATION_CONFIG = {
  // High velocity decay (0.5) = more damped, settles quickly, feels controlled
  velocityDecay: 0.5,
  // Low alpha decay = simulation cools slowly, keeps subtle adjusting
  alphaDecay: 0.02,
  // Alpha min = when to stop the simulation (low value keeps it running longer)
  alphaMin: 0.001,
  // Initial alpha for starting simulation
  alphaStart: 1,
  // Alpha for reheating during interactions
  alphaReheat: 0.3,
  // Barnes-Hut approximation theta (0.5 = good balance of speed vs accuracy)
  theta: 0.5,
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get node dimensions based on node type.
 */
function getNodeDimensions(node: Node): { width: number; height: number } {
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
 * Get collision radius for a node.
 * Uses the larger of width/height plus padding.
 */
function getCollisionRadius(node: { width: number; height: number }): number {
  return Math.max(node.width, node.height) / 2 + 20
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for computing force-directed graph layouts using d3-force.
 *
 * @param options - Layout configuration options
 * @returns Layout computation functions and simulation state
 *
 * @example
 * ```tsx
 * const { computeLayout, runLayout, simulationState } = useForceLayout({
 *   physics: { repelForce: 250, linkDistance: 120 },
 *   continuous: false,
 * })
 *
 * // Compute static layout
 * const { nodes, edges } = computeLayout(nodes, edges)
 *
 * // Update physics parameters
 * updatePhysics({ repelForce: 300 })
 * ```
 */
export function useForceLayout(options: UseForceLayoutOptions = {}) {
  const { fitView, setNodes, getNodes, getEdges } = useReactFlow()

  // Merge options with defaults
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
    physics: { ...DEFAULT_PHYSICS, ...options.physics },
  }

  // Simulation state
  const [simulationState, setSimulationState] = useState<SimulationState>({
    isRunning: false,
    alpha: 0,
    tickCount: 0,
  })

  // Refs for simulation and position cache
  const simulationRef = useRef<Simulation<ForceNode, ForceLink> | null>(null)
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map())
  const physicsRef = useRef(config.physics)

  // Keep physics ref up to date
  useEffect(() => {
    physicsRef.current = config.physics
  }, [config.physics])

  /**
   * Create and configure a d3-force simulation.
   * Tuned for smooth, Obsidian-like behavior.
   */
  const createSimulation = useCallback(
    (forceNodes: ForceNode[], forceLinks: ForceLink[]): Simulation<ForceNode, ForceLink> => {
      const physics = physicsRef.current

      const simulation = forceSimulation(forceNodes)
        // Configure simulation behavior for smooth feel (Logseq-inspired)
        .velocityDecay(SIMULATION_CONFIG.velocityDecay)
        .alphaDecay(SIMULATION_CONFIG.alphaDecay)
        .alphaMin(SIMULATION_CONFIG.alphaMin)
        // Link force: pulls connected nodes together
        .force(
          'link',
          forceLink<ForceNode, ForceLink>(forceLinks)
            .id((d) => d.id)
            .distance(physics.linkDistance)
            .strength(physics.linkForce),
        )
        // Many-body force: repels nodes from each other
        .force(
          'charge',
          forceManyBody<ForceNode>()
            .strength(-physics.repelForce)
            .theta(SIMULATION_CONFIG.theta) // Barnes-Hut approximation for performance
            .distanceMin(1)
            .distanceMax(400), // Localized forces improve perception
        )
        // Center force: pulls graph toward center
        .force(
          'center',
          forceCenter(config.centerX, config.centerY)
            .strength(physics.centerForce),
        )
        // X positioning force (very weak - lets links dominate)
        .force(
          'x',
          forceX<ForceNode>(config.centerX)
            .strength(physics.centerForce * 0.02),
        )
        // Y positioning force (very weak - lets links dominate)
        .force(
          'y',
          forceY<ForceNode>(config.centerY)
            .strength(physics.centerForce * 0.02),
        )
        // Collision force: prevents node overlap
        .force(
          'collide',
          forceCollide<ForceNode>()
            .radius(getCollisionRadius)
            .strength(0.7)
            .iterations(2), // Balance accuracy vs performance
        )

      return simulation
    },
    [config.centerX, config.centerY],
  )

  /**
   * Compute force layout for the given nodes and edges (static mode).
   * Runs simulation to completion without animation.
   */
  const computeLayout = useCallback(
    (inputNodes: Node[], inputEdges: Edge[]): LayoutResult => {
      if (inputNodes.length === 0) {
        positionCache.current.clear()
        return { nodes: [], edges: inputEdges }
      }

      // Create force nodes with initial positions from cache or random
      const forceNodes: ForceNode[] = inputNodes.map((node) => {
        const cached = positionCache.current.get(node.id)
        const { width, height } = getNodeDimensions(node)

        return {
          id: node.id,
          // Use cached position or random initial position
          x: cached?.x ?? config.centerX + (Math.random() - 0.5) * 200,
          y: cached?.y ?? config.centerY + (Math.random() - 0.5) * 200,
          width,
          height,
        }
      })

      // Create force links
      const nodeIds = new Set(forceNodes.map((n) => n.id))
      const forceLinks: ForceLink[] = inputEdges
        .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .map((edge) => ({
          source: edge.source,
          target: edge.target,
        }))

      // Create and run simulation
      const simulation = createSimulation(forceNodes, forceLinks)
      simulation.stop()

      // Run simulation to completion
      for (let i = 0; i < config.iterations; i++) {
        simulation.tick()
      }

      // Create node map for position lookup
      const nodeMap = new Map(forceNodes.map((n) => [n.id, n]))

      // Map positioned nodes
      const positionedNodes = inputNodes.map((node) => {
        const forceNode = nodeMap.get(node.id)
        const position = {
          x: forceNode?.x ?? 0,
          y: forceNode?.y ?? 0,
        }

        // Cache position for future use
        positionCache.current.set(node.id, position)

        return {
          ...node,
          position,
        } as Node
      })

      return { nodes: positionedNodes, edges: inputEdges }
    },
    [config.iterations, config.centerX, config.centerY, createSimulation],
  )

  /**
   * Run layout on current React Flow nodes and edges.
   * Updates React Flow state and fits view with animation.
   */
  const runLayout = useCallback(() => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()

    const { nodes: positionedNodes } = computeLayout(currentNodes, currentEdges)

    // Update React Flow state
    setNodes(positionedNodes)

    // Fit view with animation
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 })
    }, 50)
  }, [getNodes, getEdges, computeLayout, setNodes, fitView])

  /**
   * Start continuous simulation (interactive mode).
   * Nodes will continue to move until simulation cools down.
   */
  const startSimulation = useCallback(
    (inputNodes: Node[], inputEdges: Edge[]) => {
      // Stop any existing simulation
      if (simulationRef.current) {
        simulationRef.current.stop()
      }

      // Create force nodes
      const forceNodes: ForceNode[] = inputNodes.map((node) => {
        const cached = positionCache.current.get(node.id)
        const { width, height } = getNodeDimensions(node)

        return {
          id: node.id,
          x: cached?.x ?? node.position?.x ?? config.centerX + (Math.random() - 0.5) * 200,
          y: cached?.y ?? node.position?.y ?? config.centerY + (Math.random() - 0.5) * 200,
          width,
          height,
        }
      })

      // Create force links
      const nodeIds = new Set(forceNodes.map((n) => n.id))
      const forceLinks: ForceLink[] = inputEdges
        .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .map((edge) => ({
          source: edge.source,
          target: edge.target,
        }))

      // Create simulation
      const simulation = createSimulation(forceNodes, forceLinks)
      simulationRef.current = simulation

      let tickCount = 0

      // On each tick, update node positions
      simulation.on('tick', () => {
        tickCount++
        const nodeMap = new Map(forceNodes.map((n) => [n.id, n]))

        const updatedNodes = inputNodes.map((node) => {
          const forceNode = nodeMap.get(node.id)
          const position = {
            x: forceNode?.x ?? 0,
            y: forceNode?.y ?? 0,
          }
          positionCache.current.set(node.id, position)

          return {
            ...node,
            position,
          } as Node
        })

        setNodes(updatedNodes)

        setSimulationState({
          isRunning: true,
          alpha: simulation.alpha(),
          tickCount,
        })
      })

      // When simulation ends
      simulation.on('end', () => {
        setSimulationState((prev) => ({
          ...prev,
          isRunning: false,
        }))
      })

      // Start simulation with configured alpha
      simulation.alpha(SIMULATION_CONFIG.alphaStart).restart()

      setSimulationState({
        isRunning: true,
        alpha: SIMULATION_CONFIG.alphaStart,
        tickCount: 0,
      })
    },
    [config.centerX, config.centerY, createSimulation, setNodes],
  )

  /**
   * Stop the current simulation.
   */
  const stopSimulation = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.stop()
      setSimulationState((prev) => ({
        ...prev,
        isRunning: false,
      }))
    }
  }, [])

  /**
   * Reheat the simulation (restart with configured alpha).
   */
  const reheatSimulation = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.alpha(SIMULATION_CONFIG.alphaReheat).restart()
      setSimulationState((prev) => ({
        ...prev,
        isRunning: true,
        alpha: SIMULATION_CONFIG.alphaReheat,
      }))
    }
  }, [])

  /**
   * Update physics parameters on the running simulation.
   */
  const updatePhysics = useCallback(
    (newPhysics: Partial<GraphPhysicsOptions>) => {
      const physics = { ...physicsRef.current, ...newPhysics }
      physicsRef.current = physics

      if (simulationRef.current) {
        // Update link force
        const linkForce = simulationRef.current.force('link') as ReturnType<typeof forceLink>
        if (linkForce) {
          linkForce.distance(physics.linkDistance)
          linkForce.strength(physics.linkForce)
        }

        // Update charge force
        const chargeForce = simulationRef.current.force('charge') as ReturnType<typeof forceManyBody>
        if (chargeForce) {
          chargeForce.strength(-physics.repelForce)
        }

        // Update center force
        const centerForce = simulationRef.current.force('center') as ReturnType<typeof forceCenter>
        if (centerForce) {
          centerForce.strength(physics.centerForce)
        }

        // Update X/Y forces (keep them weak)
        const xForce = simulationRef.current.force('x') as ReturnType<typeof forceX>
        const yForce = simulationRef.current.force('y') as ReturnType<typeof forceY>
        if (xForce) xForce.strength(physics.centerForce * 0.02)
        if (yForce) yForce.strength(physics.centerForce * 0.02)

        // Reheat simulation to apply changes (use moderate alpha for smooth transition)
        simulationRef.current.alpha(SIMULATION_CONFIG.alphaReheat).restart()
      }
    },
    [],
  )

  /**
   * Pin a node to a fixed position.
   */
  const pinNode = useCallback((nodeId: string, x: number, y: number) => {
    if (simulationRef.current) {
      const nodes = simulationRef.current.nodes()
      const node = nodes.find((n) => n.id === nodeId)
      if (node) {
        node.fx = x
        node.fy = y
        simulationRef.current.alpha(SIMULATION_CONFIG.alphaReheat).restart()
      }
    }
  }, [])

  /**
   * Unpin a node (allow it to move freely).
   */
  const unpinNode = useCallback((nodeId: string) => {
    if (simulationRef.current) {
      const nodes = simulationRef.current.nodes()
      const node = nodes.find((n) => n.id === nodeId)
      if (node) {
        node.fx = null
        node.fy = null
        simulationRef.current.alpha(SIMULATION_CONFIG.alphaReheat).restart()
      }
    }
  }, [])

  /**
   * Get cached position for a node.
   */
  const getCachedPosition = useCallback((nodeId: string) => {
    return positionCache.current.get(nodeId)
  }, [])

  /**
   * Clear the position cache.
   */
  const clearCache = useCallback(() => {
    positionCache.current.clear()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [])

  return {
    // Static layout
    computeLayout,
    runLayout,

    // Continuous simulation
    startSimulation,
    stopSimulation,
    reheatSimulation,
    simulationState,

    // Physics tuning
    updatePhysics,
    physics: physicsRef.current,

    // Node pinning
    pinNode,
    unpinNode,

    // Cache utilities
    getCachedPosition,
    clearCache,
  }
}
