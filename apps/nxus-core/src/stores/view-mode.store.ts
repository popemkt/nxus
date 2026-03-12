import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'gallery' | 'table' | 'graph'
export type GalleryMode = 'default' | 'compact'
export type GraphFilterMode = 'highlight' | 'show-only'
export type GraphRenderer = 'canvas' | 'blocks'
export type GraphLayout = 'hierarchical' | 'force'
export type GraphNodeStyle = 'detailed' | 'simple'

/** Options for the canvas-based graph (react-force-graph-2d) */
export interface GraphOptions {
  filterMode: GraphFilterMode
  nodesLocked: boolean
  showLabels: boolean
  groupingDimension: string | null
}

/** Options for the React Flow blocks graph */
export interface ReactFlowGraphOptions {
  showCommands: boolean
  filterMode: GraphFilterMode
  layout: GraphLayout
  nodeStyle: GraphNodeStyle
  nodesLocked: boolean
  showLabels: boolean
}

interface ViewModeState {
  // Hydration tracking (not persisted)
  _hasHydrated: boolean
  _setHasHydrated: (hasHydrated: boolean) => void

  // Current view mode
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // Gallery options
  galleryMode: GalleryMode
  setGalleryMode: (mode: GalleryMode) => void

  // Graph renderer toggle
  graphRenderer: GraphRenderer
  setGraphRenderer: (renderer: GraphRenderer) => void

  // Canvas graph options
  graphOptions: GraphOptions
  setGraphOptions: (options: Partial<GraphOptions>) => void

  // React Flow graph options
  reactFlowOptions: ReactFlowGraphOptions
  setReactFlowOptions: (options: Partial<ReactFlowGraphOptions>) => void
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      // Hydration tracking
      _hasHydrated: false,
      _setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),

      // View mode
      viewMode: 'gallery',
      setViewMode: (mode) => set({ viewMode: mode }),

      // Gallery mode
      galleryMode: 'default',
      setGalleryMode: (mode) => set({ galleryMode: mode }),

      // Graph renderer
      graphRenderer: 'canvas',
      setGraphRenderer: (renderer) => set({ graphRenderer: renderer }),

      // Canvas graph options
      graphOptions: {
        filterMode: 'highlight',
        nodesLocked: false,
        showLabels: true,
        groupingDimension: 'supertag',
      },
      setGraphOptions: (options) =>
        set((state) => ({
          graphOptions: { ...state.graphOptions, ...options },
        })),

      // React Flow graph options
      reactFlowOptions: {
        showCommands: false,
        filterMode: 'highlight',
        layout: 'hierarchical',
        nodeStyle: 'detailed',
        nodesLocked: false,
        showLabels: true,
      },
      setReactFlowOptions: (options) =>
        set((state) => ({
          reactFlowOptions: { ...state.reactFlowOptions, ...options },
        })),
    }),
    {
      name: 'nxus-view-mode',
      partialize: (state) => ({
        viewMode: state.viewMode,
        galleryMode: state.galleryMode,
        graphRenderer: state.graphRenderer,
        graphOptions: state.graphOptions,
        reactFlowOptions: state.reactFlowOptions,
      }),
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true)
      },
    },
  ),
)

/**
 * Hook to check if the view mode store has hydrated from localStorage.
 * Use this to prevent flash of default view before saved preference loads.
 */
export const useViewModeHasHydrated = () => {
  return useViewModeStore((state) => state._hasHydrated)
}
