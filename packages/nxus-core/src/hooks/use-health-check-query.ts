/**
 * useHealthCheckQuery - TanStack Query hook for tool health checks
 *
 * This hook uses TanStack Query for fetching, keying by checkCommand
 * for automatic deduplication. Results sync to Zustand for unified state.
 *
 * @example
 * ```tsx
 * // Both will share the same query since they have same checkCommand
 * useHealthCheckQuery('claude-code', 'claude --version')
 * useHealthCheckQuery('claude-code-glm', 'claude --version')
 * ```
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  checkToolInstallation,
  type ToolHealthCheckResult,
} from '@/services/apps/health-check.server'
import { toolHealthService } from '@/services/state/item-status-state'

/**
 * Query key factory for health checks
 */
export const healthCheckKeys = {
  all: ['health-check'] as const,
  command: (checkCommand: string) => ['health-check', checkCommand] as const,
}

/**
 * Hook to check a tool's health using TanStack Query
 *
 * Key features:
 * - Query keyed by checkCommand (not toolId) for deduplication
 * - Results synced to Zustand for imperative access
 * - Automatic refetch on stale
 */
export function useHealthCheckQuery(
  toolId: string,
  checkCommand: string | undefined,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient()
  const enabled = options?.enabled !== false && !!checkCommand

  // Register this tool's command for shared updates
  useEffect(() => {
    if (checkCommand) {
      toolHealthService.registerToolCommand(toolId, checkCommand)
    }
  }, [toolId, checkCommand])

  const query = useQuery({
    queryKey: healthCheckKeys.command(checkCommand ?? ''),
    queryFn: async (): Promise<ToolHealthCheckResult> => {
      if (!checkCommand) {
        return { isInstalled: false, error: 'No check command' }
      }
      return checkToolInstallation({ data: { checkCommand } })
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache 10 minutes
    enabled,
    refetchOnWindowFocus: false,
  })

  // Sync query result to Zustand for all tools with this command
  useEffect(() => {
    if (query.data && checkCommand) {
      // Update ALL tools that share this checkCommand
      toolHealthService.updateHealthChecksByCommand(checkCommand, query.data)
    }
  }, [query.data, checkCommand])

  return query
}

/**
 * Hook to invalidate health checks for a command
 * Use this after install/uninstall operations
 */
export function useInvalidateHealthCheck() {
  const queryClient = useQueryClient()

  return {
    /**
     * Invalidate health check by checkCommand
     * This will refetch and update all tools with this command
     */
    invalidateByCommand: (checkCommand: string) => {
      // Clear from Zustand first
      toolHealthService.clearHealthChecksByCommand(checkCommand)
      // Then invalidate Query to trigger refetch
      queryClient.invalidateQueries({
        queryKey: healthCheckKeys.command(checkCommand),
      })
    },
    /**
     * Invalidate health check by toolId
     * Looks up the checkCommand and invalidates
     */
    invalidateByToolId: (toolId: string) => {
      const checkCommand = toolHealthService.getToolCommand(toolId)
      if (checkCommand) {
        toolHealthService.clearHealthChecksByCommand(checkCommand)
        queryClient.invalidateQueries({
          queryKey: healthCheckKeys.command(checkCommand),
        })
      } else {
        // Fallback: just clear from Zustand
        toolHealthService.clearHealthCheck(toolId)
      }
    },
    /**
     * Invalidate all health checks
     */
    invalidateAll: () => {
      toolHealthService.clearAllHealthChecks()
      queryClient.invalidateQueries({
        queryKey: healthCheckKeys.all,
      })
    },
  }
}
