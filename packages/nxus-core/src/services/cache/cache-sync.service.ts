import { db, type GalleryItem, type CachedCommand } from '@/lib/db'
import { useCacheStore } from '@/stores/cache.store'
import { dependencyRegistry, getDependency } from '@/data/dependency-registry'
import { commandRegistry } from '@/data/command-registry'

/**
 * Cache sync service
 * Handles initial population and background sync with server
 */

/**
 * Initialize the cache from seed data and server
 * Called once on app boot
 */
export async function initializeCache(): Promise<void> {
  const store = useCacheStore.getState()

  // Already initialized
  if (store.isInitialized) return

  console.log('[CacheSync] Initializing cache...')

  // 1. First, try to load from IndexedDB (instant)
  await store.initialize()

  // 2. Check if we have any data
  const hasData = store.galleryItems.size > 0 || store.commands.size > 0

  if (!hasData) {
    // First boot - populate from seed data
    console.log('[CacheSync] First boot - seeding from registries...')
    await seedFromRegistries()
  }

  // 3. Background sync with server (future: when we have SQLite)
  // For now, seed data is the source of truth
  console.log('[CacheSync] Cache initialized with', {
    galleryItems: store.galleryItems.size,
    commands: store.commands.size,
  })
}

/**
 * Seed cache from TypeScript registries (dependency-registry.ts, command-registry.ts)
 * This is the initial data population on first boot
 */
async function seedFromRegistries(): Promise<void> {
  const now = Date.now()

  // Convert dependencies to gallery items
  const dependencyItems: GalleryItem[] = dependencyRegistry.map((dep) => ({
    id: dep.id,
    name: dep.name,
    description: dep.description,
    type: 'dependency' as const,
    tags: ['Dependency'],
    checkConfig: dep.checkConfig,
    installInstructions: dep.installInstructions,
    installUrl: dep.installUrl,
    _syncStatus: 'synced' as const,
    _updatedAt: now,
  }))

  // Convert commands
  const commandItems: CachedCommand[] = commandRegistry.map((cmd) => ({
    ...cmd,
    _syncStatus: 'synced' as const,
    _updatedAt: now,
  }))

  // Bulk insert to IndexedDB
  await db.galleryItems.bulkPut(dependencyItems)
  await db.commands.bulkPut(commandItems)

  // Update Zustand store
  const store = useCacheStore.getState()
  store.setGalleryItems(dependencyItems)
  store.setCommands(commandItems)
}

/**
 * Add a new gallery item (optimistic)
 * Writes to store immediately, then syncs to server in background
 */
export async function addGalleryItem(
  item: Omit<GalleryItem, '_syncStatus' | '_updatedAt'>,
): Promise<void> {
  const fullItem: GalleryItem = {
    ...item,
    _syncStatus: 'pending',
    _updatedAt: Date.now(),
  }

  // Optimistic update
  useCacheStore.getState().addGalleryItem(fullItem)

  // TODO: When we have server, sync here
  // try {
  //   await serverFn.addGalleryItem(fullItem)
  //   await db.galleryItems.update(item.id, { _syncStatus: 'synced' })
  // } catch (error) {
  //   console.error('Failed to sync gallery item:', error)
  // }
}

/**
 * Add a new command (optimistic)
 */
export async function addCommand(
  command: Omit<CachedCommand, '_syncStatus' | '_updatedAt'>,
): Promise<void> {
  const fullCommand: CachedCommand = {
    ...command,
    _syncStatus: 'pending',
    _updatedAt: Date.now(),
  }

  useCacheStore.getState().addCommand(fullCommand)
}

/**
 * Refresh dependency check for an item
 * Uses server to check, then caches result
 */
export async function refreshDependencyCheck(
  dependencyId: string,
): Promise<void> {
  const dep = getDependency(dependencyId)
  if (!dep) return

  // Import dynamically to avoid circular dependency
  const { checkDependencyServerFn } = await import(
    '@/services/commands/dependency.server'
  )

  const result = await checkDependencyServerFn({
    data: {
      dependencyId,
      checkConfig: dep.checkConfig,
    },
  })

  // Cache for 5 minutes
  useCacheStore.getState().updateDependencyCheck({
    ...result,
    _expiresAt: Date.now() + 5 * 60 * 1000,
  })
}
