import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'gallery' | 'table' | 'graph'
export type GalleryMode = 'default' | 'compact'
export type GraphLayout = 'hierarchical' | 'force'
export type GraphFilterMode = 'highlight' | 'show-only'
export type GraphNodeStyle = 'detailed' | 'simple'

export interface GraphOptions {
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

  // Graph options
  graphOptions: GraphOptions
  setGraphOptions: (options: Partial<GraphOptions>) => void
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

      // Graph options
      graphOptions: {
        showCommands: false,
        filterMode: 'highlight',
        layout: 'hierarchical',
        nodeStyle: 'detailed',
        nodesLocked: false,
        showLabels: true,
      },
      setGraphOptions: (options) =>
        set((state) => ({
          graphOptions: { ...state.graphOptions, ...options },
        })),
    }),
    {
      name: 'nxus-view-mode',
      partialize: (state) => ({
        viewMode: state.viewMode,
        galleryMode: state.galleryMode,
        graphOptions: state.graphOptions,
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
