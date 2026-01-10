/**
 * Tool Health Utilities
 *
 * Functions for accessing tool health from non-React contexts
 * (command palette, services, etc.)
 */

import type { QueryClient } from '@tanstack/react-query'
import { toolHealthKeys } from './query-keys'
import type { ToolHealthResult } from './types'

/**
 * Get tool health from TanStack Query cache (synchronous)
 *
 * Use this in services that need to check health without React hooks.
 *
 * @param queryClient - TanStack Query client instance
 * @param checkCommand - The check command to look up
 * @returns Cached health result or undefined if not in cache
 *
 * @example
 * ```typescript
 * // In availability.ts
 * const health = getToolHealthFromCache(queryClient, app.checkCommand)
 * if (!health?.isInstalled) {
 *   return { available: false, reason: 'Tool not installed' }
 * }
 * ```
 */
export function getToolHealthFromCache(
  queryClient: QueryClient,
  checkCommand: string,
): ToolHealthResult | undefined {
  return queryClient.getQueryData<ToolHealthResult>(
    toolHealthKeys.command(checkCommand),
  )
}

/**
 * Invalidate tool health in cache (triggers refetch in subscribed components)
 *
 * @param queryClient - TanStack Query client instance
 * @param checkCommand - The check command to invalidate
 *
 * @example
 * ```typescript
 * // In executor.ts after install
 * invalidateToolHealth(queryClient, app.checkCommand)
 * ```
 */
export function invalidateToolHealth(
  queryClient: QueryClient,
  checkCommand: string,
): void {
  queryClient.invalidateQueries({
    queryKey: toolHealthKeys.command(checkCommand),
  })
}

/**
 * Invalidate all tool health checks
 *
 * @param queryClient - TanStack Query client instance
 */
export function invalidateAllToolHealth(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    queryKey: toolHealthKeys.all,
  })
}
