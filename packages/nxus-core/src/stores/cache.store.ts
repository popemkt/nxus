import { create } from 'zustand'
import {
  db,
  type GalleryItem,
  type CachedCommand,
  type CachedDependencyCheck,
} from '@/lib/db'

/**
 * Cache state store using Zustand
 * Provides reactive in-memory access to cached data
 */
interface CacheState {
  // Data
  galleryItems: Map<string, GalleryItem>
  commands: Map<string, CachedCommand>
  dependencyChecks: Map<string, CachedDependencyCheck>

  // State
  isInitialized: boolean
  isLoading: boolean
  lastSyncAt: number | null

  // Actions
  initialize: () => Promise<void>

  // Gallery items
  setGalleryItems: (items: GalleryItem[]) => void
  addGalleryItem: (item: GalleryItem) => void
  updateGalleryItem: (id: string, updates: Partial<GalleryItem>) => void

  // Commands
  setCommands: (commands: CachedCommand[]) => void
  addCommand: (command: CachedCommand) => void

  // Dependency checks
  setDependencyChecks: (checks: CachedDependencyCheck[]) => void
  updateDependencyCheck: (check: CachedDependencyCheck) => void
}

export const useCacheStore = create<CacheState>((set, get) => ({
  // Initial state
  galleryItems: new Map(),
  commands: new Map(),
  dependencyChecks: new Map(),
  isInitialized: false,
  isLoading: false,
  lastSyncAt: null,

  // Initialize from IndexedDB
  initialize: async () => {
    if (get().isInitialized) return

    set({ isLoading: true })

    try {
      // Load all cached data from IndexedDB
      const [galleryItems, commands, dependencyChecks] = await Promise.all([
        db.galleryItems.toArray(),
        db.commands.toArray(),
        db.dependencyChecks.toArray(),
      ])

      // Convert arrays to maps for O(1) lookup
      set({
        galleryItems: new Map(galleryItems.map((item) => [item.id, item])),
        commands: new Map(commands.map((cmd) => [cmd.id, cmd])),
        dependencyChecks: new Map(
          dependencyChecks.map((check) => [check.dependencyId, check]),
        ),
        isInitialized: true,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to initialize cache from IndexedDB:', error)
      set({ isLoading: false })
    }
  },

  // Gallery items
  setGalleryItems: (items) => {
    set({ galleryItems: new Map(items.map((item) => [item.id, item])) })
  },

  addGalleryItem: (item) => {
    const newItems = new Map(get().galleryItems)
    newItems.set(item.id, item)
    set({ galleryItems: newItems })

    // Persist to IndexedDB (async, non-blocking)
    db.galleryItems.put(item).catch(console.error)
  },

  updateGalleryItem: (id, updates) => {
    const current = get().galleryItems.get(id)
    if (!current) return

    const updated = { ...current, ...updates, _updatedAt: Date.now() }
    const newItems = new Map(get().galleryItems)
    newItems.set(id, updated)
    set({ galleryItems: newItems })

    // Persist to IndexedDB
    db.galleryItems.put(updated).catch(console.error)
  },

  // Commands
  setCommands: (commands) => {
    set({ commands: new Map(commands.map((cmd) => [cmd.id, cmd])) })
  },

  addCommand: (command) => {
    const newCommands = new Map(get().commands)
    newCommands.set(command.id, command)
    set({ commands: newCommands })

    db.commands.put(command).catch(console.error)
  },

  // Dependency checks
  setDependencyChecks: (checks) => {
    set({
      dependencyChecks: new Map(
        checks.map((check) => [check.dependencyId, check]),
      ),
    })
  },

  updateDependencyCheck: (check) => {
    const newChecks = new Map(get().dependencyChecks)
    newChecks.set(check.dependencyId, check)
    set({ dependencyChecks: newChecks })

    db.dependencyChecks.put(check).catch(console.error)
  },
}))

/**
 * Selectors for common queries
 */
export const selectGalleryItemsByType =
  (type: GalleryItem['type']) => (state: CacheState) =>
    Array.from(state.galleryItems.values()).filter((item) => item.type === type)

export const selectDependencies = (state: CacheState) =>
  Array.from(state.galleryItems.values()).filter(
    (item) => item.type === 'dependency',
  )

export const selectApps = (state: CacheState) =>
  Array.from(state.galleryItems.values()).filter((item) => item.type === 'app')

export const selectAllCommands = (state: CacheState) =>
  Array.from(state.commands.values())

export const selectDependencyCheck =
  (dependencyId: string) => (state: CacheState) =>
    state.dependencyChecks.get(dependencyId)
