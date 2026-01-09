import { useMemo, useCallback, useEffect, useState } from 'react'
import { appRegistryService } from '../services/apps/registry.service'
import { getAllAppsServerFn } from '../services/apps/apps.server'
import type { App, AppStatus, AppType } from '../types/app'

interface UseAppRegistryOptions {
  searchQuery?: string
  filterType?: AppType
  filterStatus?: AppStatus
  filterCategory?: string
  filterTags?: Array<string>
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
 * React hook for accessing and filtering the app registry
 * Loads apps from SQLite via server function on first render
 */
export function useAppRegistry(
  options: UseAppRegistryOptions = {},
): UseAppRegistryReturn {
  const [state, setState] = useState<{
    apps: App[]
    loading: boolean
    error: Error | null
    categories: string[]
    tags: string[]
  }>(() => {
    // Check if apps are already loaded in the registry service
    if (appRegistryService.isLoaded()) {
      const result = appRegistryService.getAllApps()
      const categoriesResult = appRegistryService.getCategories()
      const tagsResult = appRegistryService.getTags()

      return {
        apps: result.success ? result.data : [],
        loading: false,
        error: result.success ? null : result.error,
        categories: categoriesResult.success ? categoriesResult.data : [],
        tags: tagsResult.success ? tagsResult.data : [],
      }
    }

    // Start with loading state if not loaded
    return {
      apps: [],
      loading: true,
      error: null,
      categories: [],
      tags: [],
    }
  })

  // Load apps from SQLite on mount
  useEffect(() => {
    if (appRegistryService.isLoaded()) {
      return // Already loaded
    }

    let cancelled = false

    async function loadApps() {
      try {
        const result = await getAllAppsServerFn()

        if (cancelled) return

        if (result.success) {
          // Update the registry service with SQLite data
          appRegistryService.setApps(result.apps)

          const categoriesResult = appRegistryService.getCategories()
          const tagsResult = appRegistryService.getTags()

          setState({
            apps: result.apps,
            loading: false,
            error: null,
            categories: categoriesResult.success ? categoriesResult.data : [],
            tags: tagsResult.success ? tagsResult.data : [],
          })
        } else {
          // Fallback to manifest.json loading if SQLite fails
          console.warn('SQLite load failed, falling back to manifests')
          const fallbackResult = appRegistryService.loadRegistry()

          if (fallbackResult.success) {
            const categoriesResult = appRegistryService.getCategories()
            const tagsResult = appRegistryService.getTags()

            setState({
              apps: fallbackResult.data.apps,
              loading: false,
              error: null,
              categories: categoriesResult.success ? categoriesResult.data : [],
              tags: tagsResult.success ? tagsResult.data : [],
            })
          }
        }
      } catch (error) {
        if (cancelled) return

        console.error('Failed to load apps from SQLite:', error)

        // Fallback to manifest.json loading
        const fallbackResult = appRegistryService.loadRegistry()

        if (fallbackResult.success) {
          const categoriesResult = appRegistryService.getCategories()
          const tagsResult = appRegistryService.getTags()

          setState({
            apps: fallbackResult.data.apps,
            loading: false,
            error: null,
            categories: categoriesResult.success ? categoriesResult.data : [],
            tags: tagsResult.success ? tagsResult.data : [],
          })
        } else {
          setState({
            apps: [],
            loading: false,
            error: error as Error,
            categories: [],
            tags: [],
          })
        }
      }
    }

    loadApps()

    return () => {
      cancelled = true
    }
  }, [])

  // Refetch function for manual refresh
  const refetch = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))

    try {
      const result = await getAllAppsServerFn()

      if (result.success) {
        appRegistryService.setApps(result.apps)

        const categoriesResult = appRegistryService.getCategories()
        const tagsResult = appRegistryService.getTags()

        setState({
          apps: result.apps,
          loading: false,
          error: null,
          categories: categoriesResult.success ? categoriesResult.data : [],
          tags: tagsResult.success ? tagsResult.data : [],
        })
      }
    } catch (error) {
      console.error('Failed to refetch apps:', error)
      setState((prev) => ({ ...prev, loading: false, error: error as Error }))
    }
  }, [])

  const filteredApps = useMemo(() => {
    let filtered = state.apps

    if (options.searchQuery) {
      const lowerQuery = options.searchQuery.toLowerCase().trim()
      if (lowerQuery) {
        filtered = filtered.filter((app) => {
          const nameMatch = app.name.toLowerCase().includes(lowerQuery)
          const descMatch = app.description.toLowerCase().includes(lowerQuery)
          const tagMatch = app.metadata.tags.some((tag) =>
            tag.toLowerCase().includes(lowerQuery),
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
      filtered = filtered.filter((app) =>
        options.filterTags!.some((tag) => app.metadata.tags.includes(tag)),
      )
    }

    return filtered
  }, [
    state.apps,
    options.searchQuery,
    options.filterType,
    options.filterStatus,
    options.filterCategory,
    options.filterTags,
  ])

  return {
    apps: filteredApps,
    allApps: state.apps,
    loading: state.loading,
    error: state.error,
    categories: state.categories,
    tags: state.tags,
    refetch,
  }
}

/**
 * Hook to get a single app by ID
 * Uses the registry service which is populated from SQLite
 */
export function useApp(id: string) {
  const { apps, loading, error } = useAppRegistry({})

  const app = useMemo(() => {
    return apps.find((a) => a.id === id) ?? null
  }, [apps, id])

  return {
    app,
    loading,
    error: app ? null : (error ?? new Error(`App ${id} not found`)),
  }
}
