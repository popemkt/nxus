import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getOsInfoServerFn, type OsInfo } from '@/services/shell/os-info.server'
import {
  getDevInfoServerFn,
  type DevInfo,
} from '@/services/shell/dev-info.server'
import {
  appStateService,
  useOsInfo,
  useDevInfo,
} from '@/services/state/app-state'

/**
 * Query keys for system info
 */
export const systemInfoKeys = {
  osInfo: ['osInfo'] as const,
  devInfo: ['devInfo'] as const,
}

/**
 * Hook to fetch and cache OS info using React Query
 * Also persists to Zustand for offline access
 */
export function useSystemOsInfo() {
  const cachedOsInfo = useOsInfo()

  const query = useQuery<OsInfo>({
    queryKey: systemInfoKeys.osInfo,
    queryFn: () => getOsInfoServerFn(),
    // Never refetch - OS info doesn't change
    staleTime: Infinity,
    gcTime: Infinity,
    // Use cached value from Zustand as initial data
    initialData: cachedOsInfo ?? undefined,
    // Only fetch if not already cached
    enabled: !cachedOsInfo,
  })

  // Persist to Zustand when fetched
  useEffect(() => {
    if (query.data && !cachedOsInfo) {
      appStateService.setOsInfo(query.data)
    }
  }, [query.data, cachedOsInfo])

  return {
    osInfo: query.data ?? cachedOsInfo,
    isLoading: query.isLoading && !cachedOsInfo,
    error: query.error,
  }
}

/**
 * Hook to fetch and cache dev info using React Query
 * Also persists to Zustand for offline access
 */
export function useSystemDevInfo() {
  const cachedDevInfo = useDevInfo()

  const query = useQuery<DevInfo>({
    queryKey: systemInfoKeys.devInfo,
    queryFn: () => getDevInfoServerFn(),
    // Never refetch - dev info doesn't change during session
    staleTime: Infinity,
    gcTime: Infinity,
    // Use cached value from Zustand as initial data
    initialData: cachedDevInfo ?? undefined,
    // Only fetch if not already cached
    enabled: !cachedDevInfo,
  })

  // Persist to Zustand when fetched
  useEffect(() => {
    if (query.data && !cachedDevInfo) {
      appStateService.setDevInfo(query.data)
    }
  }, [query.data, cachedDevInfo])

  return {
    devInfo: query.data ?? cachedDevInfo,
    isLoading: query.isLoading && !cachedDevInfo,
    error: query.error,
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
