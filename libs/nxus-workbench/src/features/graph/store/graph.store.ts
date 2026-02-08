/**
 * Graph Store
 *
 * Zustand store for shared graph options across 2D and 3D renderers.
 * Persists to localStorage for user preference retention.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_GRAPH_STORE_STATE } from './defaults'
import type { WorkbenchGraphStore } from './types'

/**
 * Main graph store hook.
 *
 * @example
 * ```tsx
 * const { physics, setPhysics } = useGraphStore()
 *
 * // Update center force
 * setPhysics({ centerForce: 0.7 })
 *
 * // Access current renderer
 * const { view } = useGraphStore()
 * console.log(view.renderer) // '2d' | '3d'
 * ```
 */
export const useGraphStore = create<WorkbenchGraphStore>()(
  persist(
    (set) => ({
      ...DEFAULT_GRAPH_STORE_STATE,

      setPhysics: (options) =>
        set((state) => ({
          physics: { ...state.physics, ...options },
        })),

      setDisplay: (options) =>
        set((state) => ({
          display: { ...state.display, ...options },
        })),

      setFilter: (options) =>
        set((state) => ({
          filter: { ...state.filter, ...options },
        })),

      setLocalGraph: (options) =>
        set((state) => ({
          localGraph: { ...state.localGraph, ...options },
        })),

      setView: (options) =>
        set((state) => ({
          view: { ...state.view, ...options },
        })),

      resetToDefaults: () => set(DEFAULT_GRAPH_STORE_STATE),
    }),
    {
      name: 'nxus-graph-options',
      version: 1,
    },
  ),
)

// ============================================================================
// Selector Hooks (for performance optimization)
// ============================================================================

/**
 * Select only physics options.
 * Use this when you only need physics values to avoid re-renders from other changes.
 */
export const useGraphPhysics = () => useGraphStore((state) => state.physics)

/**
 * Select only display options.
 */
export const useGraphDisplay = () => useGraphStore((state) => state.display)

/**
 * Select only filter options.
 */
export const useGraphFilter = () => useGraphStore((state) => state.filter)

/**
 * Select only local graph options.
 */
export const useGraphLocalGraph = () =>
  useGraphStore((state) => state.localGraph)

/**
 * Select only view options.
 */
export const useGraphView = () => useGraphStore((state) => state.view)

// ============================================================================
// Actions (for imperative access)
// ============================================================================

/**
 * Imperative service for accessing graph store outside of React components.
 * Useful for event handlers, callbacks, and non-React code.
 */
export const graphStoreService = {
  getState: () => useGraphStore.getState(),

  // Physics
  getPhysics: () => useGraphStore.getState().physics,
  setPhysics: (options: Parameters<WorkbenchGraphStore['setPhysics']>[0]) =>
    useGraphStore.getState().setPhysics(options),

  // Display
  getDisplay: () => useGraphStore.getState().display,
  setDisplay: (options: Parameters<WorkbenchGraphStore['setDisplay']>[0]) =>
    useGraphStore.getState().setDisplay(options),

  // Filter
  getFilter: () => useGraphStore.getState().filter,
  setFilter: (options: Parameters<WorkbenchGraphStore['setFilter']>[0]) =>
    useGraphStore.getState().setFilter(options),

  // Local Graph
  getLocalGraph: () => useGraphStore.getState().localGraph,
  setLocalGraph: (
    options: Parameters<WorkbenchGraphStore['setLocalGraph']>[0],
  ) => useGraphStore.getState().setLocalGraph(options),

  // View
  getView: () => useGraphStore.getState().view,
  setView: (options: Parameters<WorkbenchGraphStore['setView']>[0]) =>
    useGraphStore.getState().setView(options),

  // Reset
  resetToDefaults: () => useGraphStore.getState().resetToDefaults(),

  // Convenience methods
  setFocusNode: (nodeId: string | null) =>
    useGraphStore.getState().setLocalGraph({ focusNodeId: nodeId }),

  enableLocalGraph: (nodeId: string) =>
    useGraphStore.getState().setLocalGraph({
      enabled: true,
      focusNodeId: nodeId,
    }),

  disableLocalGraph: () =>
    useGraphStore.getState().setLocalGraph({
      enabled: false,
      focusNodeId: null,
    }),

  toggleRenderer: () => {
    const current = useGraphStore.getState().view.renderer
    useGraphStore.getState().setView({
      renderer: current === '2d' ? '3d' : '2d',
    })
  },
}
