import { useMemo, useState, useCallback } from 'react'
import { appRegistryService } from '../services/apps/registry.service'
import type { App, AppStatus, AppType } from '../types/app'

interface UseAppRegistryOptions {
  searchQuery?: string
  filterType?: AppType
  filterStatus?: AppStatus
  filterCategory?: string
  filterTags?: Array<string>
}

interface UseAppRegistryReturn {
  apps: Array<App>
  loading: boolean
  error: Error | null
  categories: Array<string>
  tags: Array<string>
  refetch: () => void
}

/**
 * React hook for accessing and filtering the app registry
 * Uses lazy initialization - no useEffect needed for synchronous data
 */
export function useAppRegistry(
  options: UseAppRegistryOptions = {},
): UseAppRegistryReturn {
  // ✅ Lazy initialization - load data on first render
  const [state, setState] = useState(() => {
    const result = appRegistryService.getAllApps()

    if (!result.success) {
      return {
        apps: [],
        loading: false,
        error: result.error,
        categories: [],
        tags: [],
      }
    }

    const categoriesResult = appRegistryService.getCategories()
    const tagsResult = appRegistryService.getTags()

    return {
      apps: result.data,
      loading: false,
      error: null,
      categories: categoriesResult.success ? categoriesResult.data : [],
      tags: tagsResult.success ? tagsResult.data : [],
    }
  })

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    const result = appRegistryService.getAllApps()

    if (!result.success) {
      setState({
        apps: [],
        loading: false,
        error: result.error,
        categories: [],
        tags: [],
      })
      return
    }

    const categoriesResult = appRegistryService.getCategories()
    const tagsResult = appRegistryService.getTags()

    setState({
      apps: result.data,
      loading: false,
      error: null,
      categories: categoriesResult.success ? categoriesResult.data : [],
      tags: tagsResult.success ? tagsResult.data : [],
    })
  }, [])

  const filteredApps = useMemo(() => {
    let filtered = state.apps

    if (options.searchQuery) {
      const result = appRegistryService.searchApps(options.searchQuery)
      if (result.success) {
        filtered = result.data
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
    loading: state.loading,
    error: state.error,
    categories: state.categories,
    tags: state.tags,
    refetch,
  }
}

/**
 * Hook to get a single app by ID
 * Uses lazy initialization - no useEffect needed for synchronous lookup
 */
export function useApp(id: string) {
  // ✅ Lazy initialization - lookup happens once on first render
  const [state] = useState(() => {
    const result = appRegistryService.getAppById(id)

    if (!result.success) {
      return {
        app: null,
        loading: false,
        error: result.error,
      }
    }

    return {
      app: result.data,
      loading: false,
      error: null,
    }
  })

  return state
}
