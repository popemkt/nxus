import { create } from 'zustand'

/**
 * Tag UI Store - Ephemeral UI state (not persisted)
 * Handles expansion, selection, and filter state
 */
interface TagUIState {
  // === UI STATE (not persisted) ===
  expandedIds: Set<string> // Expanded tree nodes
  selectedTagIds: Set<string> // Tags selected for filtering
  includeSubTags: Map<string, boolean> // Per-tag "include sub-tags" toggle
  searchQuery: string // Search input value

  // === ACTIONS ===
  toggleExpanded: (id: string) => void
  setExpanded: (id: string, expanded: boolean) => void
  expandAll: (ids: string[]) => void
  collapseAll: () => void

  toggleSelected: (id: string) => void
  setSelected: (id: string, selected: boolean) => void
  clearSelection: () => void
  setSelectedTags: (ids: string[]) => void

  setIncludeSubTags: (id: string, include: boolean) => void
  getIncludeSubTags: (id: string) => boolean

  setSearchQuery: (query: string) => void
}

export const useTagUIStore = create<TagUIState>((set, get) => ({
  // Initial state
  expandedIds: new Set(),
  selectedTagIds: new Set(),
  includeSubTags: new Map(),
  searchQuery: '',

  // Expansion
  toggleExpanded: (id: string) => {
    const newExpanded = new Set(get().expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    set({ expandedIds: newExpanded })
  },

  setExpanded: (id: string, expanded: boolean) => {
    const newExpanded = new Set(get().expandedIds)
    if (expanded) {
      newExpanded.add(id)
    } else {
      newExpanded.delete(id)
    }
    set({ expandedIds: newExpanded })
  },

  expandAll: (ids: string[]) => {
    const newExpanded = new Set(get().expandedIds)
    ids.forEach((id) => newExpanded.add(id))
    set({ expandedIds: newExpanded })
  },

  collapseAll: () => {
    set({ expandedIds: new Set() })
  },

  // Selection (for filtering)
  toggleSelected: (id: string) => {
    const newSelected = new Set(get().selectedTagIds)
    const newIncludeSubTags = new Map(get().includeSubTags)

    if (newSelected.has(id)) {
      newSelected.delete(id)
      newIncludeSubTags.delete(id)
    } else {
      newSelected.add(id)
      // Default to include sub-tags when selecting
      newIncludeSubTags.set(id, true)
    }
    set({ selectedTagIds: newSelected, includeSubTags: newIncludeSubTags })
  },

  setSelected: (id: string, selected: boolean) => {
    const newSelected = new Set(get().selectedTagIds)
    const newIncludeSubTags = new Map(get().includeSubTags)

    if (selected) {
      newSelected.add(id)
      newIncludeSubTags.set(id, true)
    } else {
      newSelected.delete(id)
      newIncludeSubTags.delete(id)
    }
    set({ selectedTagIds: newSelected, includeSubTags: newIncludeSubTags })
  },

  clearSelection: () => {
    set({ selectedTagIds: new Set(), includeSubTags: new Map() })
  },

  setSelectedTags: (ids: string[]) => {
    const newIncludeSubTags = new Map<string, boolean>()
    ids.forEach((id) => newIncludeSubTags.set(id, true))
    set({
      selectedTagIds: new Set(ids),
      includeSubTags: newIncludeSubTags,
    })
  },

  // Include sub-tags toggle
  setIncludeSubTags: (id: string, include: boolean) => {
    const newIncludeSubTags = new Map(get().includeSubTags)
    newIncludeSubTags.set(id, include)
    set({ includeSubTags: newIncludeSubTags })
  },

  getIncludeSubTags: (id: string) => {
    return get().includeSubTags.get(id) ?? true
  },

  // Search
  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },
}))
