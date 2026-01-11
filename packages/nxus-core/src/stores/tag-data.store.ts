import { create } from 'zustand'
import type { Tag, CreateTagInput } from '@/types/tag'
import {
  createTagServerFn,
  updateTagServerFn,
  deleteTagServerFn,
  moveTagServerFn,
  getTagsServerFn,
} from '@/services/tag.server'

/**
 * Tag Data Store - In-memory cache synced with SQLite
 * Uses integer IDs for tags
 */
interface TagDataState {
  // === DATA (in-memory cache, source is SQLite) ===
  tags: Map<number, Tag>
  isInitialized: boolean
  isLoading: boolean

  // === ACTIONS ===
  initialize: () => Promise<void>
  addTag: (input: CreateTagInput) => Promise<Tag>
  updateTag: (id: number, updates: Partial<Tag>) => Promise<void>
  deleteTag: (id: number, cascade?: boolean) => Promise<void>
  moveTag: (
    id: number,
    newParentId: number | null,
    newOrder: number,
  ) => Promise<void>

  // === SELECTORS ===
  getTag: (id: number) => Tag | undefined
  getChildren: (parentId: number | null) => Tag[]
  getAncestors: (id: number) => Tag[]
  getDescendants: (id: number) => Tag[]
  getRootTags: () => Tag[]
  getAllTags: () => Tag[]
}

export const useTagDataStore = create<TagDataState>((set, get) => ({
  // Initial state
  tags: new Map(),
  isInitialized: false,
  isLoading: false,

  // Initialize from SQLite
  initialize: async () => {
    if (get().isInitialized) return

    set({ isLoading: true })

    try {
      const result = await getTagsServerFn()

      if (result.success && result.data.length > 0) {
        const tagsMap = new Map(result.data.map((t) => [t.id, t]))
        set({
          tags: tagsMap,
          isInitialized: true,
          isLoading: false,
        })
        console.log(
          '[TagDataStore] Loaded',
          result.data.length,
          'tags from SQLite',
        )
      } else {
        set({
          tags: new Map(),
          isInitialized: true,
          isLoading: false,
        })
        console.log('[TagDataStore] No tags found, initialized empty')
      }
    } catch (error) {
      console.error('[TagDataStore] Failed to initialize:', error)
      set({ isLoading: false, isInitialized: true })
    }
  },

  // Add a new tag
  addTag: async (input: CreateTagInput): Promise<Tag> => {
    const now = new Date()
    const slug = input.slug || generateSlug(input.name)

    // Get siblings to calculate order
    const siblings = get().getChildren(input.parentId ?? null)
    const maxOrder =
      siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1

    // Sync to SQLite first to get the generated ID
    try {
      const result = await createTagServerFn({
        data: {
          slug,
          name: input.name,
          parentId: input.parentId ?? null,
          order: maxOrder + 1,
          color: input.color,
          icon: input.icon,
        },
      })

      if (!result.success || !result.id) {
        throw new Error('Failed to create tag')
      }

      const tag: Tag = {
        id: result.id,
        slug,
        name: input.name,
        parentId: input.parentId ?? null,
        order: maxOrder + 1,
        color: input.color ?? null,
        icon: input.icon ?? null,
        createdAt: now,
        updatedAt: now,
      }

      // Update local cache
      const newTags = new Map(get().tags)
      newTags.set(tag.id, tag)
      set({ tags: newTags })

      return tag
    } catch (err) {
      console.error('[TagDataStore] Failed to create tag:', err)
      throw err
    }
  },

  // Update tag properties
  updateTag: async (id: number, updates: Partial<Tag>) => {
    const existing = get().tags.get(id)
    if (!existing) return

    const now = new Date()
    const updated: Tag = {
      ...existing,
      ...updates,
      id, // Prevent id override
      updatedAt: now,
    }

    const newTags = new Map(get().tags)
    newTags.set(id, updated)
    set({ tags: newTags })

    // Sync to SQLite
    try {
      await updateTagServerFn({ data: { id, ...updates } })
    } catch (err) {
      console.error('[TagDataStore] SQLite sync failed:', err)
    }
  },

  // Delete a tag (optionally cascade to children)
  deleteTag: async (id: number, cascade = false) => {
    const newTags = new Map(get().tags)
    const tag = get().tags.get(id)

    if (cascade) {
      // Delete all descendants
      const descendants = get().getDescendants(id)
      for (const desc of descendants) {
        newTags.delete(desc.id)
      }
    } else if (tag) {
      // Move children to parent's parent
      const children = get().getChildren(id)
      for (const child of children) {
        const updated: Tag = {
          ...child,
          parentId: tag.parentId,
          updatedAt: new Date(),
        }
        newTags.set(child.id, updated)
      }
    }

    newTags.delete(id)
    set({ tags: newTags })

    // Sync to SQLite
    try {
      await deleteTagServerFn({ data: { id, cascade } })
    } catch (err) {
      console.error('[TagDataStore] SQLite delete failed:', err)
    }
  },

  // Move tag to new parent and/or reorder
  moveTag: async (id: number, newParentId: number | null, newOrder: number) => {
    const tag = get().tags.get(id)
    if (!tag) return

    // Prevent circular references
    if (newParentId !== null) {
      const ancestors = get().getAncestors(newParentId)
      if (ancestors.some((a) => a.id === id)) {
        console.error('[TagDataStore] Cannot move tag into its own descendant')
        return
      }
    }

    const now = new Date()
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
      const updated: Tag = {
        ...sibling,
        parentId: sibling.id === id ? newParentId : sibling.parentId,
        order: i,
        updatedAt: now,
      }
      newTags.set(sibling.id, updated)
    }

    set({ tags: newTags })

    // Sync to SQLite
    try {
      await moveTagServerFn({ data: { id, newParentId, newOrder } })
    } catch (err) {
      console.error('[TagDataStore] SQLite move failed:', err)
    }
  },

  // === SELECTORS ===
  getTag: (id: number) => get().tags.get(id),

  getChildren: (parentId: number | null) => {
    return Array.from(get().tags.values())
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.order - b.order)
  },

  getAncestors: (id: number) => {
    const ancestors: Tag[] = []
    let current = get().tags.get(id)

    while (current?.parentId !== null && current?.parentId !== undefined) {
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

  getDescendants: (id: number) => {
    const descendants: Tag[] = []
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
  tag: Tag
  children: TagTreeNode[]
}

export function buildTagTree(store: TagDataState): TagTreeNode[] {
  const buildNode = (tag: Tag): TagTreeNode => ({
    tag,
    children: store.getChildren(tag.id).map(buildNode),
  })

  return store.getRootTags().map(buildNode)
}
