/**
 * Query Store - UI state for the query builder
 *
 * Manages the query builder's ephemeral UI state including:
 * - Current query definition being built
 * - Active/editing filter state
 * - Query builder panel visibility
 */

import { create } from 'zustand'
import type { QueryDefinition, QueryFilter, QuerySort } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

interface QueryUIState {
  // Current query being built/edited
  currentQuery: QueryDefinition

  // UI state
  isBuilderOpen: boolean
  editingFilterId: string | null // Filter currently being edited
  isAddMenuOpen: boolean

  // Actions - Query Management
  setCurrentQuery: (query: QueryDefinition) => void
  resetQuery: () => void

  // Actions - Filter Management
  addFilter: (filter: QueryFilter) => void
  updateFilter: (filterId: string, updates: Partial<QueryFilter>) => void
  removeFilter: (filterId: string) => void

  // Actions - Sort Management
  setSort: (sort: QuerySort | undefined) => void

  // Actions - Limit Management
  setLimit: (limit: number) => void

  // Actions - UI State
  setBuilderOpen: (open: boolean) => void
  setEditingFilterId: (id: string | null) => void
  setAddMenuOpen: (open: boolean) => void

  // Helpers
  getFilterById: (id: string) => QueryFilter | undefined
}

// ============================================================================
// Default Values
// ============================================================================

const createEmptyQuery = (): QueryDefinition => ({
  filters: [],
  sort: undefined,
  limit: 500,
})

/**
 * Generate a short random ID for filters
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

// ============================================================================
// Store
// ============================================================================

export const useQueryStore = create<QueryUIState>((set, get) => ({
  // Initial state
  currentQuery: createEmptyQuery(),
  isBuilderOpen: false,
  editingFilterId: null,
  isAddMenuOpen: false,

  // Query Management
  setCurrentQuery: (query: QueryDefinition) => {
    set({ currentQuery: query })
  },

  resetQuery: () => {
    set({
      currentQuery: createEmptyQuery(),
      editingFilterId: null,
    })
  },

  // Filter Management
  addFilter: (filter: QueryFilter) => {
    const id = filter.id || generateId()
    const filterWithId = { ...filter, id }
    const currentQuery = get().currentQuery

    set({
      currentQuery: {
        ...currentQuery,
        filters: [...(currentQuery.filters ?? []), filterWithId] as QueryFilter[],
      },
      editingFilterId: id, // Start editing the new filter
    })
  },

  updateFilter: (filterId: string, updates: Partial<QueryFilter>) => {
    const currentQuery = get().currentQuery

    set({
      currentQuery: {
        ...currentQuery,
        filters: (currentQuery.filters ?? []).map((f) =>
          f.id === filterId ? ({ ...f, ...updates } as QueryFilter) : f
        ),
      },
    })
  },

  removeFilter: (filterId: string) => {
    const currentQuery = get().currentQuery
    const editingFilterId = get().editingFilterId

    set({
      currentQuery: {
        ...currentQuery,
        filters: (currentQuery.filters ?? []).filter((f) => f.id !== filterId),
      },
      // Clear editing state if removing the filter being edited
      editingFilterId: editingFilterId === filterId ? null : editingFilterId,
    })
  },

  // Sort Management
  setSort: (sort: QuerySort | undefined) => {
    const currentQuery = get().currentQuery
    set({
      currentQuery: {
        ...currentQuery,
        sort,
      },
    })
  },

  // Limit Management
  setLimit: (limit: number) => {
    const currentQuery = get().currentQuery
    set({
      currentQuery: {
        ...currentQuery,
        limit,
      },
    })
  },

  // UI State
  setBuilderOpen: (open: boolean) => {
    set({ isBuilderOpen: open })
  },

  setEditingFilterId: (id: string | null) => {
    set({ editingFilterId: id })
  },

  setAddMenuOpen: (open: boolean) => {
    set({ isAddMenuOpen: open })
  },

  // Helpers
  getFilterById: (id: string) => {
    return (get().currentQuery.filters ?? []).find((f) => f.id === id)
  },
}))
