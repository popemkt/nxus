import Dexie, { type Table } from 'dexie'
import type { Command } from '@/types/command'
import type { Dependency, DependencyCheckResult } from '@/types/dependency'
import type { App } from '@/types/app'
import type { Tag } from '@/types/tag'

/**
 * Sync status for optimistic updates
 */
export type SyncStatus = 'synced' | 'pending' | 'error'

/**
 * Gallery item - unified type for apps, dependencies, and tools
 * All items in the gallery are stored here with different types
 */
export interface GalleryItem {
  id: string
  name: string
  description: string
  type: 'app' | 'dependency' | 'tool'
  tags: string[]

  // App-specific fields (when type === 'app')
  appType?: App['type']
  path?: string
  homepage?: string
  thumbnail?: string
  metadata?: App['metadata']
  installConfig?: App['installConfig']
  status?: App['status']

  // Dependency-specific fields (when type === 'dependency')
  checkConfig?: Dependency['checkConfig']
  installInstructions?: string
  installUrl?: string

  // Sync metadata
  _syncStatus: SyncStatus
  _updatedAt: number
}

/**
 * Cached command with sync status
 */
export interface CachedCommand extends Command {
  _syncStatus: SyncStatus
  _updatedAt: number
}

/**
 * Cached dependency check result
 */
export interface CachedDependencyCheck extends DependencyCheckResult {
  _expiresAt: number // Cache expiry
}

/**
 * Installation record for machine-specific paths
 */
export interface Installation {
  id: string
  itemId: string
  path: string
  installedAt: number
  _syncStatus: SyncStatus
}

/**
 * Cached tag with sync status
 */
export interface CachedTag extends Tag {
  _syncStatus: SyncStatus
  _updatedAt: number
}

/**
 * NxusDB - Client-side IndexedDB database
 *
 * Provides instant reads with background sync to server.
 * Uses Dexie for typed table access.
 */
export class NxusDB extends Dexie {
  galleryItems!: Table<GalleryItem, string>
  commands!: Table<CachedCommand, string>
  dependencyChecks!: Table<CachedDependencyCheck, string>
  installations!: Table<Installation, string>
  tags!: Table<CachedTag, string>

  constructor() {
    super('NxusDB')

    // Version 1 schema
    this.version(1).stores({
      // id is primary key
      // *tags means multi-entry index (searchable by any tag)
      galleryItems: 'id, type, *tags, _syncStatus',
      commands: 'id, category, *dependencies, _syncStatus',
      dependencyChecks: 'dependencyId, checkedAt, _expiresAt',
      installations: 'id, itemId, _syncStatus',
    })

    // Version 2: Add tags table
    this.version(2).stores({
      galleryItems: 'id, type, *tags, _syncStatus',
      commands: 'id, category, *dependencies, _syncStatus',
      dependencyChecks: 'dependencyId, checkedAt, _expiresAt',
      installations: 'id, itemId, _syncStatus',
      tags: 'id, parentId, order, _syncStatus',
    })
  }
}

// Singleton database instance
export const db = new NxusDB()

/**
 * Clear all cached data (useful for debugging/reset)
 */
export async function clearAllCaches(): Promise<void> {
  await db.galleryItems.clear()
  await db.commands.clear()
  await db.dependencyChecks.clear()
  await db.installations.clear()
  await db.tags.clear()
}

/**
 * Get pending items that need to be synced to server
 */
export async function getPendingItems(): Promise<{
  galleryItems: GalleryItem[]
  commands: CachedCommand[]
  installations: Installation[]
}> {
  const [galleryItems, commands, installations] = await Promise.all([
    db.galleryItems.where('_syncStatus').equals('pending').toArray(),
    db.commands.where('_syncStatus').equals('pending').toArray(),
    db.installations.where('_syncStatus').equals('pending').toArray(),
  ])

  return { galleryItems, commands, installations }
}
