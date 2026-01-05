import { create } from 'zustand'
import { db, type CachedTag } from '@/lib/db'
import type { Tag, CreateTagInput } from '@/types/tag'
import { generateTagId } from '@/types/tag'
import {
  createTagServerFn,
  updateTagServerFn,
  deleteTagServerFn,
  moveTagServerFn,
  getTagsServerFn,
} from '@/services/tag.server'

/**
 * Tag Data Store - Persistent data synced to Dexie
 * This store handles the actual tag data (CRUD operations)
 */
interface TagDataState {
  // === DATA (persisted to Dexie) ===
  tags: Map<string, CachedTag>
  isInitialized: boolean
  isLoading: boolean

  // === ACTIONS ===
  initialize: () => Promise<void>
  addTag: (input: CreateTagInput) => Promise<CachedTag>
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>
  deleteTag: (id: string, cascade?: boolean) => Promise<void>
  moveTag: (
    id: string,
    newParentId: string | null,
    newOrder: number,
  ) => Promise<void>

  // === SELECTORS ===
  getTag: (id: string) => CachedTag | undefined
  getChildren: (parentId: string | null) => CachedTag[]
  getAncestors: (id: string) => CachedTag[]
  getDescendants: (id: string) => CachedTag[]
  getRootTags: () => CachedTag[]
  getAllTags: () => CachedTag[]
}

export const useTagDataStore = create<TagDataState>((set, get) => ({
  // Initial state
  tags: new Map(),
  isInitialized: false,
  isLoading: false,

  // Initialize from Dexie, seeding from SQLite if empty
  initialize: async () => {
    if (get().isInitialized) return

    set({ isLoading: true })

    try {
      // First try to load from Dexie (instant)
      const localTags = await db.tags.toArray()

      if (localTags.length > 0) {
        // Have local data, use it
        set({
          tags: new Map(localTags.map((t) => [t.id, t])),
          isInitialized: true,
          isLoading: false,
        })
        console.log(
          '[TagDataStore] Loaded',
          localTags.length,
          'tags from Dexie',
        )
      } else {
        // No local data - fetch from SQLite and seed Dexie
        console.log('[TagDataStore] Dexie empty, fetching from SQLite...')
        const result = await getTagsServerFn()

        if (result.success && result.data.length > 0) {
          const now = Date.now()
          const cachedTags: CachedTag[] = result.data.map((tag) => ({
            ...tag,
            // Convert null to undefined for optional fields
            color: tag.color ?? undefined,
            icon: tag.icon ?? undefined,
            createdAt: tag.createdAt?.toString() ?? new Date(now).toISOString(),
            updatedAt: tag.updatedAt?.toString() ?? new Date(now).toISOString(),
            _syncStatus: 'synced' as const,
            _updatedAt: now,
          }))

          // Bulk insert to Dexie for future reads
          await db.tags.bulkPut(cachedTags)

          set({
            tags: new Map(cachedTags.map((t) => [t.id, t])),
            isInitialized: true,
            isLoading: false,
          })
          console.log(
            '[TagDataStore] Seeded',
            cachedTags.length,
            'tags from SQLite',
          )
        } else {
          // No tags in SQLite either, just initialize empty
          set({
            tags: new Map(),
            isInitialized: true,
            isLoading: false,
          })
          console.log('[TagDataStore] No tags found, initialized empty')
        }
      }
    } catch (error) {
      console.error('[TagDataStore] Failed to initialize:', error)
      set({ isLoading: false, isInitialized: true })
    }
  },

  // Add a new tag
  addTag: async (input: CreateTagInput): Promise<CachedTag> => {
    const now = Date.now()
    const id = generateTagId(input.name)

    // Get siblings to calculate order
    const siblings = get().getChildren(input.parentId)
    const maxOrder =
      siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1

    const tag: CachedTag = {
      id,
      name: input.name,
      parentId: input.parentId,
      order: maxOrder + 1,
      color: input.color,
      icon: input.icon,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      _syncStatus: 'pending',
      _updatedAt: now,
    }

    // Optimistic update
    const newTags = new Map(get().tags)
    newTags.set(id, tag)
    set({ tags: newTags })

    // Persist to Dexie
    await db.tags.put(tag)

    // Sync to SQLite (background)
    createTagServerFn({
      data: {
        id,
        name: input.name,
        parentId: input.parentId,
        order: maxOrder + 1,
        color: input.color,
        icon: input.icon,
      },
    })
      .then(() => {
        // Mark as synced
        const updated = { ...tag, _syncStatus: 'synced' as const }
        db.tags.put(updated)
        const updatedTags = new Map(get().tags)
        updatedTags.set(id, updated)
        set({ tags: updatedTags })
      })
      .catch((err) => console.error('[TagDataStore] SQLite sync failed:', err))

    return tag
  },

  // Update tag properties
  updateTag: async (id: string, updates: Partial<Tag>) => {
    const existing = get().tags.get(id)
    if (!existing) return

    const now = Date.now()
    const updated: CachedTag = {
      ...existing,
      ...updates,
      id, // Prevent id override
      updatedAt: new Date(now).toISOString(),
      _syncStatus: 'pending',
      _updatedAt: now,
    }

    const newTags = new Map(get().tags)
    newTags.set(id, updated)
    set({ tags: newTags })

    await db.tags.put(updated)

    // Sync to SQLite
    updateTagServerFn({ data: { id, ...updates } })
      .then(() => {
        const synced = { ...updated, _syncStatus: 'synced' as const }
        db.tags.put(synced)
      })
      .catch((err) => console.error('[TagDataStore] SQLite sync failed:', err))
  },

  // Delete a tag (optionally cascade to children)
  deleteTag: async (id: string, cascade = false) => {
    const newTags = new Map(get().tags)

    if (cascade) {
      // Delete all descendants
      const descendants = get().getDescendants(id)
      for (const desc of descendants) {
        newTags.delete(desc.id)
        await db.tags.delete(desc.id)
      }
    } else {
      // Move children to parent's parent
      const tag = get().tags.get(id)
      if (tag) {
        const children = get().getChildren(id)
        for (const child of children) {
          const updated: CachedTag = {
            ...child,
            parentId: tag.parentId,
            _syncStatus: 'pending',
            _updatedAt: Date.now(),
          }
          newTags.set(child.id, updated)
          await db.tags.put(updated)
        }
      }
    }

    newTags.delete(id)
    set({ tags: newTags })

    await db.tags.delete(id)

    // Sync to SQLite
    deleteTagServerFn({ data: { id, cascade } }).catch((err) =>
      console.error('[TagDataStore] SQLite delete failed:', err),
    )
  },

  // Move tag to new parent and/or reorder
  moveTag: async (id: string, newParentId: string | null, newOrder: number) => {
    const tag = get().tags.get(id)
    if (!tag) return

    // Prevent circular references
    if (newParentId) {
      const ancestors = get().getAncestors(newParentId)
      if (ancestors.some((a) => a.id === id)) {
        console.error('[TagDataStore] Cannot move tag into its own descendant')
        return
      }
    }

    const now = Date.now()
    const newTags = new Map(get().tags)

    // Get siblings (excluding the moved tag) and reorder them
    const siblings = get()
      .getChildren(newParentId)
      .filter((s) => s.id !== id)

    // Insert at new position
    siblings.splice(newOrder, 0, tag)

    // Update all sibling orders
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i]
      const updated: CachedTag = {
        ...sibling,
        parentId: sibling.id === id ? newParentId : sibling.parentId,
        order: i,
        updatedAt: new Date(now).toISOString(),
        _syncStatus: 'pending',
        _updatedAt: now,
      }
      newTags.set(sibling.id, updated)
      await db.tags.put(updated)
    }

    set({ tags: newTags })

    // Sync to SQLite (only if we have valid params)
    const syncParams = { id, newParentId: newParentId ?? null, newOrder }
    console.log('[TagDataStore] moveTag sync params:', syncParams)

    if (syncParams.id && typeof syncParams.newOrder === 'number') {
      try {
        await moveTagServerFn({ data: syncParams })
      } catch (err) {
        console.error('[TagDataStore] SQLite move failed:', err)
      }
    } else {
      console.warn(
        '[TagDataStore] Skipping SQLite sync - invalid params:',
        syncParams,
      )
    }
  },

  // === SELECTORS ===
  getTag: (id: string) => get().tags.get(id),

  getChildren: (parentId: string | null) => {
    return Array.from(get().tags.values())
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.order - b.order)
  },

  getAncestors: (id: string) => {
    const ancestors: CachedTag[] = []
    let current = get().tags.get(id)

    while (current?.parentId) {
      const parent = get().tags.get(current.parentId)
      if (parent) {
        ancestors.push(parent)
        current = parent
      } else {
        break
      }
    }

    return ancestors
  },

  getDescendants: (id: string) => {
    const descendants: CachedTag[] = []
    const stack = [id]

    while (stack.length > 0) {
      const currentId = stack.pop()!
      const children = get().getChildren(currentId)
      for (const child of children) {
        descendants.push(child)
        stack.push(child.id)
      }
    }

    return descendants
  },

  getRootTags: () => get().getChildren(null),

  getAllTags: () => Array.from(get().tags.values()),
}))

/**
 * Selector: Get tags as a tree structure (for rendering)
 */
export interface TagTreeNode {
  tag: CachedTag
  children: TagTreeNode[]
}

export function buildTagTree(store: TagDataState): TagTreeNode[] {
  const buildNode = (tag: CachedTag): TagTreeNode => ({
    tag,
    children: store.getChildren(tag.id).map(buildNode),
  })

  return store.getRootTags().map(buildNode)
}
