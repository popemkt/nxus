import { useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAllAppsServerFn } from '../services/apps/apps.server'
import { appRegistryService } from '../services/apps/registry.service'
import type { App, AppStatus, AppType } from '../types/app'

interface UseAppRegistryOptions {
  searchQuery?: string
  filterType?: AppType
  filterStatus?: AppStatus
  filterCategory?: string
  filterTags?: Array<{ id: number; name: string }>
}

interface UseAppRegistryReturn {
  apps: Array<App> // Filtered apps based on options
  allApps: Array<App> // All apps (unfiltered) - useful for graph highlight mode
  loading: boolean
  error: Error | null
  categories: Array<string>
  tags: Array<string>
  refetch: () => void
}

/**
 * Query key for apps - used for cache invalidation
 */
export const appsQueryKey = ['apps'] as const

/**
 * React hook for accessing and filtering the app registry
 * Uses TanStack Query for caching and automatic refetching
 */
export function useAppRegistry(
  options: UseAppRegistryOptions = {},
): UseAppRegistryReturn {
  // Load apps from SQLite via TanStack Query
  const {
    data,
    isLoading,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: appsQueryKey,
    queryFn: async () => {
      const result = await getAllAppsServerFn()
      if (!result.success) {
        throw new Error('Failed to load apps from database')
      }
      return result.apps
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - apps don't change often
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  })

  const apps = data ?? []

  // Keep appRegistryService in sync for backward compatibility with sync consumers
  useEffect(() => {
    if (apps.length > 0) {
      appRegistryService.setApps(apps)
    }
  }, [apps])

  // Derive categories from apps
  const categories = useMemo(() => {
    const categorySet = new Set<string>()
    for (const app of apps) {
      if (app.metadata.category) {
        categorySet.add(app.metadata.category)
      }
    }
    return Array.from(categorySet).sort()
  }, [apps])

  // Derive tags from apps
  const tags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const app of apps) {
      for (const tag of app.metadata.tags) {
        tagSet.add(tag.name)
      }
    }
    return Array.from(tagSet).sort()
  }, [apps])

  // Filter apps based on options
  const filteredApps = useMemo(() => {
    let filtered = apps

    if (options.searchQuery) {
      const lowerQuery = options.searchQuery.toLowerCase().trim()
      if (lowerQuery) {
        filtered = filtered.filter((app) => {
          const nameMatch = app.name.toLowerCase().includes(lowerQuery)
          const descMatch = app.description.toLowerCase().includes(lowerQuery)
          const tagMatch = app.metadata.tags.some((tag) =>
            tag.name.toLowerCase().includes(lowerQuery),
          )
          const categoryMatch = app.metadata.category
            .toLowerCase()
            .includes(lowerQuery)
          return nameMatch || descMatch || tagMatch || categoryMatch
        })
      }
    }

    if (options.filterType) {
      filtered = filtered.filter((app) => app.type === options.filterType)
    }

    if (options.filterStatus) {
      filtered = filtered.filter((app) => app.status === options.filterStatus)
    }

    if (options.filterCategory) {
      filtered = filtered.filter(
        (app) => app.metadata.category === options.filterCategory,
      )
    }

    if (options.filterTags && options.filterTags.length > 0) {
      const filterTagIds = new Set(options.filterTags.map((t) => t.id))
      filtered = filtered.filter((app) =>
        app.metadata.tags.some((tag) => filterTagIds.has(tag.id)),
      )
    }

    return filtered
  }, [
    apps,
    options.searchQuery,
    options.filterType,
    options.filterStatus,
    options.filterCategory,
    options.filterTags,
  ])

  return {
    apps: filteredApps,
    allApps: apps,
    loading: isLoading,
    error: error as Error | null,
    categories,
    tags,
    refetch: () => queryRefetch(),
  }
}

/**
 * Hook to get a single app by ID
 */
export function useApp(id: string) {
  const { allApps, loading, error } = useAppRegistry({})

  const app = useMemo(() => {
    return allApps.find((a) => a.id === id) ?? null
  }, [allApps, id])

  return {
    app,
    loading,
    error: app ? null : (error ?? new Error(`App ${id} not found`)),
  }
}
