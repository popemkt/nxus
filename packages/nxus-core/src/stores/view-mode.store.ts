import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'gallery' | 'table' | 'graph'
export type GalleryMode = 'default' | 'compact'
export type GraphLayout = 'hierarchical' | 'force'
export type GraphFilterMode = 'highlight' | 'show-only'

export interface GraphOptions {
  showCommands: boolean
  filterMode: GraphFilterMode
  layout: GraphLayout
}

interface ViewModeState {
  // Current view mode
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // Gallery options
  galleryMode: GalleryMode
  setGalleryMode: (mode: GalleryMode) => void

  // Graph options
  graphOptions: GraphOptions
  setGraphShowCommands: (show: boolean) => void
  setGraphFilterMode: (mode: GraphFilterMode) => void
  setGraphLayout: (layout: GraphLayout) => void
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
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
      },
      setGraphShowCommands: (show) =>
        set((state) => ({
          graphOptions: { ...state.graphOptions, showCommands: show },
        })),
      setGraphFilterMode: (mode) =>
        set((state) => ({
          graphOptions: { ...state.graphOptions, filterMode: mode },
        })),
      setGraphLayout: (layout) =>
        set((state) => ({
          graphOptions: { ...state.graphOptions, layout: layout },
        })),
    }),
    {
      name: 'nxus-view-mode',
    },
  ),
)
