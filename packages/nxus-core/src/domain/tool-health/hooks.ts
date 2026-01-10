/**
 * Tool Health React Hooks
 *
 * Primary API for checking tool health in React components.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { App } from '@/types/app'
import { toolHealthKeys } from './query-keys'
import { checkToolHealth } from './server'
import type { ToolHealthResult, ToolHealthData } from './types'

/**
 * Check a tool's health/installation status
 *
 * @param app - The app to check (must be a tool with checkCommand)
 * @param enabled - Whether to run the check (default: true)
 * @returns Health data including isInstalled, version, and loading states
 *
 * @example
 * ```typescript
 * const { isInstalled, version, isLoading, refetch } = useToolHealth(app)
 *
 * if (isLoading) return <Spinner />
 * if (isInstalled) return <Badge>v{version}</Badge>
 * return <Badge variant="warning">Not installed</Badge>
 * ```
 */
export function useToolHealth(
  app: App | null | undefined,
  enabled = true,
): ToolHealthData {
  const checkCommand =
    app?.type === 'tool' && 'checkCommand' in app ? app.checkCommand : undefined

  const query = useQuery({
    queryKey: toolHealthKeys.command(checkCommand ?? ''),
    queryFn: async (): Promise<ToolHealthResult> => {
      if (!checkCommand) {
        return { isInstalled: false, error: 'No check command' }
      }
      return checkToolHealth({ data: { checkCommand } })
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: enabled && !!checkCommand,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  return {
    isInstalled: query.data?.isInstalled ?? false,
    version: query.data?.version,
    error: query.data?.error,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/**
 * Hook to invalidate tool health cache
 *
 * Use after actions that might change tool status (install, uninstall, etc.)
 *
 * @example
 * ```typescript
 * const { invalidate, invalidateAll } = useToolHealthInvalidation()
 *
 * const handleInstall = async () => {
 *   await installTool(app)
 *   invalidate(app.checkCommand)  // Force re-check
 * }
 * ```
 */
export function useToolHealthInvalidation() {
  const queryClient = useQueryClient()

  return {
    /** Invalidate a specific tool's health check */
    invalidate: (checkCommand: string) => {
      queryClient.invalidateQueries({
        queryKey: toolHealthKeys.command(checkCommand),
      })
    },

    /** Invalidate all tool health checks */
    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: toolHealthKeys.all,
      })
    },

    /** Reset (clear cache) and refetch a specific tool */
    reset: (checkCommand: string) => {
      queryClient.resetQueries({
        queryKey: toolHealthKeys.command(checkCommand),
      })
    },
  }
}

/**
 * Pre-fetch health status for multiple tools
 *
 * Used by gallery/list views to warm the cache for all visible tools.
 * Individual components should still use useToolHealth for reactivity.
 *
 * @param apps - Array of apps to check
 * @param enabled - Whether to run checks (default: true)
 *
 * @example
 * ```typescript
 * // In gallery component
 * useBatchToolHealth(allApps)
 *
 * // Individual cards still use useToolHealth for their own reactivity
 * function ToolCard({ app }) {
 *   const health = useToolHealth(app)
 *   // ...
 * }
 * ```
 */
export function useBatchToolHealth(apps: App[], enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || apps.length === 0) return

    // Get unique check commands
    const uniqueCommands = new Map<string, string>() // checkCommand → appId

    apps
      .filter(
        (app) =>
          app.type === 'tool' && 'checkCommand' in app && app.checkCommand,
      )
      .forEach((app) => {
        const cmd = (app as any).checkCommand!
        if (!uniqueCommands.has(cmd)) {
          uniqueCommands.set(cmd, app.id)
        }
      })

    // Pre-fetch each unique command into TanStack Query cache
    uniqueCommands.forEach(async (_appId, checkCommand) => {
      await queryClient.ensureQueryData({
        queryKey: toolHealthKeys.command(checkCommand),
        queryFn: async () => {
          return await checkToolHealth({ data: { checkCommand } })
        },
        staleTime: 5 * 60 * 1000,
      })
    })
  }, [apps, enabled, queryClient])
}
