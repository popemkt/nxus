import { useEffect } from 'react'
import {
  useCacheStore,
  selectApps,
  selectDependencies,
} from '@/stores/cache.store'
import { initializeCache } from '@/services/cache/cache-sync.service'
import type { GalleryItem } from '@/lib/db'

/**
 * Hook to access cached gallery items with instant reads
 *
 * @example
 * const { items, apps, dependencies, isLoading } = useCachedGallery()
 */
export function useCachedGallery(): {
  items: GalleryItem[]
  apps: GalleryItem[]
  dependencies: GalleryItem[]
  isLoading: boolean
  isInitialized: boolean
} {
  const allItems = useCacheStore((state) =>
    Array.from(state.galleryItems.values()),
  )
  const apps = useCacheStore(selectApps)
  const dependencies = useCacheStore(selectDependencies)
  const isLoading = useCacheStore((state) => state.isLoading)
  const isInitialized = useCacheStore((state) => state.isInitialized)

  // Initialize cache on first access
  useEffect(() => {
    if (!isInitialized) {
      initializeCache()
    }
  }, [isInitialized])

  return {
    items: allItems,
    apps,
    dependencies,
    isLoading,
    isInitialized,
  }
}

/**
 * Hook to get a single gallery item by ID
 */
export function useCachedItem(id: string): {
  item: GalleryItem | undefined
  isLoading: boolean
} {
  const item = useCacheStore((state) => state.galleryItems.get(id))
  const isLoading = useCacheStore((state) => state.isLoading)

  return { item, isLoading }
}

/**
 * Filter gallery items by tag
 */
export function filterByTag(items: GalleryItem[], tag: string): GalleryItem[] {
  return items.filter((item) => item.tags.includes(tag))
}

/**
 * Search gallery items by query
 */
export function searchGallery(
  items: GalleryItem[],
  query: string,
): GalleryItem[] {
  if (!query.trim()) return items

  const lowerQuery = query.toLowerCase()
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.description.toLowerCase().includes(lowerQuery) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
  )
}
