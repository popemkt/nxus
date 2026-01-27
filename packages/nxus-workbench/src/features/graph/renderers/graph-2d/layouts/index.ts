/**
 * Graph Layouts
 *
 * Layout hooks for the 2D graph renderer.
 * Provides hierarchical (dagre) and force-directed (d3-force) layouts.
 */

export {
  useDagreLayout,
  type DagreDirection,
  type HandlePosition,
  type UseDagreLayoutOptions,
} from './use-dagre-layout'

export {
  useForceLayout,
  type UseForceLayoutOptions,
  type SimulationState,
} from './use-force-layout'

export type { LayoutResult } from './use-dagre-layout'

// Re-export common layout types
import type { LayoutType } from '../../../store/types'
export type { LayoutType }

// ============================================================================
// Layout Selector Hook
// ============================================================================

import { useCallback, useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { useDagreLayout } from './use-dagre-layout'
import { useForceLayout } from './use-force-layout'
import type { GraphPhysicsOptions } from '../../../store/types'
import type { UseDagreLayoutOptions } from './use-dagre-layout'

/** Options for the unified layout hook */
export interface UseGraphLayoutOptions {
  /** Current layout type */
  layout: LayoutType
  /** Physics options (for force layout) */
  physics?: Partial<GraphPhysicsOptions>
  /** Dagre direction (for hierarchical layout) */
  dagreDirection?: UseDagreLayoutOptions['direction']
  /** Canvas center X coordinate */
  centerX?: number
  /** Canvas center Y coordinate */
  centerY?: number
}

/**
 * Unified layout hook that switches between dagre and force layouts.
 *
 * @param options - Layout configuration
 * @returns Layout functions that delegate to the appropriate layout engine
 *
 * @example
 * ```tsx
 * const { computeLayout, runLayout, updatePhysics } = useGraphLayout({
 *   layout: 'force',
 *   physics: { repelForce: 200 },
 * })
 *
 * // Compute layout
 * const { nodes, edges } = computeLayout(nodes, edges)
 *
 * // Switch layout and recompute
 * setLayout('hierarchical')
 * runLayout()
 * ```
 */
export function useGraphLayout(options: UseGraphLayoutOptions) {
  const { layout, physics, dagreDirection, centerX, centerY } = options

  // Initialize both layout engines
  const dagre = useDagreLayout({
    direction: dagreDirection ?? 'LR',
  })

  const force = useForceLayout({
    physics,
    centerX,
    centerY,
  })

  /**
   * Compute layout using the current layout engine.
   */
  const computeLayout = useCallback(
    (inputNodes: Node[], inputEdges: Edge[]) => {
      if (layout === 'hierarchical') {
        return dagre.computeLayout(inputNodes, inputEdges)
      }
      return force.computeLayout(inputNodes, inputEdges)
    },
    [layout, dagre, force],
  )

  /**
   * Run layout on current React Flow nodes.
   */
  const runLayout = useCallback(() => {
    if (layout === 'hierarchical') {
      dagre.runLayout()
    } else {
      force.runLayout()
    }
  }, [layout, dagre, force])

  /**
   * Clear position caches in both layouts.
   */
  const clearCache = useCallback(() => {
    dagre.clearCache()
    force.clearCache()
  }, [dagre, force])

  /**
   * Get cached position from the current layout engine.
   */
  const getCachedPosition = useCallback(
    (nodeId: string) => {
      if (layout === 'hierarchical') {
        return dagre.getCachedPosition(nodeId)
      }
      return force.getCachedPosition(nodeId)
    },
    [layout, dagre, force],
  )

  // Memoize the current layout info
  const layoutInfo = useMemo(
    () => ({
      type: layout,
      isForce: layout === 'force',
      isHierarchical: layout === 'hierarchical',
    }),
    [layout],
  )

  return {
    // Common interface
    computeLayout,
    runLayout,
    clearCache,
    getCachedPosition,
    layoutInfo,

    // Force-specific (only meaningful when layout === 'force')
    updatePhysics: force.updatePhysics,
    startSimulation: force.startSimulation,
    stopSimulation: force.stopSimulation,
    reheatSimulation: force.reheatSimulation,
    simulationState: force.simulationState,
    pinNode: force.pinNode,
    unpinNode: force.unpinNode,

    // Dagre-specific (only meaningful when layout === 'hierarchical')
    runDagreLayout: dagre.runLayout,
    dagreDirection: dagre.direction,
  }
}
