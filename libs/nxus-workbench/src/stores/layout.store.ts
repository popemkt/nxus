/**
 * Layout Store - Persisted panel sizes for the workbench
 *
 * Stores user-resized panel widths so they survive page reloads.
 * Panels that haven't been resized remain `null` (use CSS defaults).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============================================================================
// Types
// ============================================================================

interface PanelSizes {
  /** Supertag sidebar width in list view */
  listSupertag: number | null
  /** Inspector width in list view */
  listInspector: number | null
  /** Inspector width in query view */
  queryInspector: number | null
  /** Overlay inspector width in graph view */
  graphInspector: number | null
}

interface LayoutState extends PanelSizes {
  setPanelSize: (panel: keyof PanelSizes, size: number) => void
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_PANEL_SIZES: PanelSizes = {
  listSupertag: null,
  listInspector: null,
  queryInspector: null,
  graphInspector: null,
}

// ============================================================================
// Store
// ============================================================================

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULT_PANEL_SIZES,

      setPanelSize: (panel, size) =>
        set({ [panel]: Math.round(size) }),
    }),
    {
      name: 'nxus-workbench-layout',
      version: 1,
    },
  ),
)
