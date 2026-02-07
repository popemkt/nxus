/**
 * Client-side hook for accessing server-side path constants
 *
 * This hook fetches path values from the server, allowing client components
 * to access paths without directly importing Node.js modules.
 */

import { useQuery } from '@tanstack/react-query'
import type {PathValues} from '@/services/paths/paths.server';
import {
  
  getPathsServerFn
} from '@/services/paths/paths.server'

/**
 * Query key for paths cache
 */
export const pathsQueryKey = ['paths'] as const

/**
 * Hook to fetch path values from the server
 *
 * @example
 * ```tsx
 * const { data: paths } = usePaths()
 *
 * if (!paths) return <div>Loading...</div>
 *
 * console.log(paths.nxusCoreRoot)
 * console.log(paths.defaultAppInstallRoot)
 * ```
 */
export function usePaths() {
  return useQuery({
    queryKey: pathsQueryKey,
    queryFn: async () => {
      const result = await getPathsServerFn()
      return result
    },
    staleTime: Infinity, // Paths never change during runtime
  })
}

/**
 * Hook to get a specific path value
 *
 * @example
 * ```tsx
 * const { data: installPath } = usePath('defaultAppInstallRoot')
 * ```
 */
export function usePath<K extends keyof PathValues>(
  pathKey: K,
): PathValues[K] | undefined {
  const { data } = usePaths()
  return data?.[pathKey]
}
