import { getOsInfoServerFn, type OsInfo } from '@/services/shell/os-info.server'
import {
  getDevInfoServerFn,
  type DevInfo,
} from '@/services/shell/dev-info.server'
import {
  appStateService,
  useOsInfo,
  useDevInfo,
  useHasHydrated,
} from '@/services/state/app-state'
import { useCachedQuery } from '@/lib/cached-query'

/**
 * Query keys for system info
 */
export const systemInfoKeys = {
  osInfo: ['osInfo'] as const,
  devInfo: ['devInfo'] as const,
}

/**
 * Hook to fetch and cache OS info
 *
 * Uses the hydration-aware cached query pattern to:
 * 1. Wait for Zustand hydration before checking cache
 * 2. Use persisted data from localStorage when available
 * 3. Only fetch from server when no cached data exists
 *
 * @see lib/cached-query.ts for pattern documentation
 */
export function useSystemOsInfo() {
  const hasHydrated = useHasHydrated()
  const cachedOsInfo = useOsInfo()

  const result = useCachedQuery<OsInfo>({
    queryKey: systemInfoKeys.osInfo,
    queryFn: () => getOsInfoServerFn(),
    cachedValue: cachedOsInfo,
    hasHydrated,
    onFetched: (data) => appStateService.setOsInfo(data),
    queryOptions: {
      // Never refetch - OS info doesn't change
      staleTime: Infinity,
      gcTime: Infinity,
    },
  })

  return {
    osInfo: result.data,
    isLoading: result.isLoading,
    error: result.error,
  }
}

/**
 * Hook to fetch and cache dev info
 *
 * Uses the hydration-aware cached query pattern to:
 * 1. Wait for Zustand hydration before checking cache
 * 2. Use persisted data from localStorage when available
 * 3. Only fetch from server when no cached data exists
 *
 * @see lib/cached-query.ts for pattern documentation
 */
export function useSystemDevInfo() {
  const hasHydrated = useHasHydrated()
  const cachedDevInfo = useDevInfo()

  const result = useCachedQuery<DevInfo>({
    queryKey: systemInfoKeys.devInfo,
    queryFn: () => getDevInfoServerFn(),
    cachedValue: cachedDevInfo,
    hasHydrated,
    onFetched: (data) => appStateService.setDevInfo(data),
    queryOptions: {
      // Never refetch - dev info doesn't change during session
      staleTime: Infinity,
      gcTime: Infinity,
    },
  })

  return {
    devInfo: result.data,
    isLoading: result.isLoading,
    error: result.error,
  }
}

/**
 * Combined hook for both system infos
 */
export function useSystemInfo() {
  const { osInfo, isLoading: osLoading } = useSystemOsInfo()
  const { devInfo, isLoading: devLoading } = useSystemDevInfo()

  return {
    osInfo,
    devInfo,
    isLoading: osLoading || devLoading,
  }
}
