/**
 * Hydration-aware cached query utilities
 *
 * This module provides utilities for creating React Query hooks that:
 * 1. Wait for Zustand stores to hydrate from localStorage before fetching
 * 2. Use cached data as initial data to prevent flash of loading state
 * 3. Only fetch from server when cached data is not available
 *
 * @example
 * ```typescript
 * // Creating a hydration-aware query hook
 * import { createCachedQueryHook } from '@/lib/cached-query'
 * import { useHasHydrated, useOsInfo, appStateService } from '@/services/state/app-state'
 *
 * export function useSystemOsInfo() {
 *   return useCachedQuery({
 *     queryKey: ['osInfo'],
 *     queryFn: () => getOsInfoServerFn(),
 *     // Get cached value from Zustand
 *     getCachedValue: useOsInfo,
 *     // Check if store has hydrated
 *     hasHydrated: useHasHydrated(),
 *     // Persist fetched value to Zustand
 *     onFetched: (data) => appStateService.setOsInfo(data),
 *   })
 * }
 * ```
 *
 * ## Why is this needed?
 *
 * Zustand's persist middleware hydrates from localStorage asynchronously.
 * Without waiting for hydration:
 * 1. React Query starts fetching immediately (cache appears empty)
 * 2. Server receives unnecessary requests
 * 3. UI may flash between loading and cached states
 *
 * ## Best Practices
 *
 * 1. **Always use `useCachedQuery`** for queries that have Zustand-persisted cache
 * 2. **Never call `enabled: !cachedValue`** without checking `hasHydrated` first
 * 3. **Test with cleared localStorage** to ensure fetch works when cache is empty
 */

import {  useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type {UseQueryOptions} from '@tanstack/react-query';

export interface CachedQueryOptions<TData> {
  /** React Query key */
  queryKey: ReadonlyArray<unknown>
  /** Function to fetch data from server */
  queryFn: () => Promise<TData>
  /** Hook to get cached value from Zustand (call the hook, don't pass it) */
  cachedValue: TData | null | undefined
  /** Whether Zustand has finished hydrating from localStorage */
  hasHydrated: boolean
  /** Callback when fresh data is fetched (to persist to Zustand) */
  onFetched?: (data: TData) => void
  /** Additional React Query options */
  queryOptions?: Omit<
    UseQueryOptions<TData>,
    'queryKey' | 'queryFn' | 'enabled' | 'initialData'
  >
}

export interface CachedQueryResult<TData> {
  /** The data (either cached or freshly fetched) */
  data: TData | undefined
  /** True while waiting for hydration OR while fetching (when no cache) */
  isLoading: boolean
  /** Error from the query */
  error: Error | null
  /** True if currently fetching from server */
  isFetching: boolean
  /** True if data came from cache (not fresh fetch) */
  isFromCache: boolean
}

/**
 * Hook for creating hydration-aware cached queries
 *
 * This is the recommended way to create queries that use Zustand-persisted cache.
 * It automatically:
 * - Waits for Zustand hydration before checking cache
 * - Uses cached data as initial data
 * - Only fetches from server when no cached data exists
 * - Persists fresh data back to Zustand
 *
 * @example
 * ```typescript
 * function useSystemOsInfo() {
 *   const hasHydrated = useHasHydrated()
 *   const cachedOsInfo = useOsInfo()
 *
 *   const result = useCachedQuery({
 *     queryKey: ['osInfo'],
 *     queryFn: () => getOsInfoServerFn(),
 *     cachedValue: cachedOsInfo,
 *     hasHydrated,
 *     onFetched: (data) => appStateService.setOsInfo(data),
 *   })
 *
 *   return {
 *     osInfo: result.data,
 *     isLoading: result.isLoading,
 *     error: result.error,
 *   }
 * }
 * ```
 */
export function useCachedQuery<TData>({
  queryKey,
  queryFn,
  cachedValue,
  hasHydrated,
  onFetched,
  queryOptions = {},
}: CachedQueryOptions<TData>): CachedQueryResult<TData> {
  const hasCachedData = cachedValue != null

  const query = useQuery<TData>({
    queryKey,
    queryFn,
    // Only fetch if:
    // 1. Store has hydrated (so we know if cache exists)
    // 2. AND no cached data exists
    enabled: hasHydrated && !hasCachedData,
    // Use cached value as initial data to prevent flash
    initialData: cachedValue ?? undefined,
    // Spread additional options
    ...queryOptions,
  })

  // Persist fetched data back to Zustand
  useEffect(() => {
    if (query.data && !hasCachedData && onFetched) {
      onFetched(query.data)
    }
  }, [query.data, hasCachedData, onFetched])

  return {
    data: query.data ?? cachedValue ?? undefined,
    // Loading if:
    // 1. Not yet hydrated
    // 2. OR actively fetching (when no cache)
    isLoading: !hasHydrated || (query.isLoading && !hasCachedData),
    error: query.error,
    isFetching: query.isFetching,
    isFromCache: hasCachedData && !query.isFetching,
  }
}

/**
 * Type helper for creating cached query hooks
 *
 * Use this when you want to create a reusable hook pattern.
 */
export type CreateCachedQueryHook<TData, TParams = void> = (
  params: TParams,
) => CachedQueryResult<TData>
