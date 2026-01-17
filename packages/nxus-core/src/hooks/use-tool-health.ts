/**
 * Tool Health React Hooks
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Item } from '@/types/item'
import {
  toolHealthKeys,
  type ToolHealthResult,
  type ToolHealthData,
} from '@/services/tool-health/types'
import { checkToolHealth } from '@/services/tool-health/tool-health.server'

/**
 * Check a tool's health/installation status
 */
export function useToolHealth(
  app: Item | null | undefined,
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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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
 */
export function useToolHealthInvalidation() {
  const queryClient = useQueryClient()

  return {
    invalidate: (checkCommand: string) => {
      queryClient.invalidateQueries({
        queryKey: toolHealthKeys.command(checkCommand),
      })
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: toolHealthKeys.all,
      })
    },
    reset: (checkCommand: string) => {
      queryClient.resetQueries({
        queryKey: toolHealthKeys.command(checkCommand),
      })
    },
  }
}

/**
 * Pre-fetch health status for multiple tools
 */
export function useBatchToolHealth(apps: Item[], enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || apps.length === 0) return

    const uniqueCommands = new Map<string, string>()

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
