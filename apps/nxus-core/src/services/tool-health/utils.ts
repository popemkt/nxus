/**
 * Tool Health Utilities
 *
 * Functions for accessing tool health from non-React contexts
 */

import {  toolHealthKeys } from './types'
import type {ToolHealthResult} from './types';
import type { QueryClient } from '@tanstack/react-query'

/**
 * Get tool health from TanStack Query cache (synchronous)
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
 * Invalidate tool health in cache
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
 */
export function invalidateAllToolHealth(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    queryKey: toolHealthKeys.all,
  })
}
