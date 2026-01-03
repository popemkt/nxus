import { useEffect } from 'react'
import type { App } from '@/types/app'
import { batchCheckToolInstallation } from '@/services/apps/health-check.server'
import {
  toolHealthService,
  useAllToolHealth,
  useToolHealth,
} from '@/services/state/item-status-state'
import { useHealthCheckQuery } from './use-health-check-query'

/**
 * Hook to check health of all tools
 * Useful for checking all tools at once when loading the app
 */
export function useToolHealthCheck(tools: App[], enabled = true) {
  const healthChecks = useAllToolHealth()

  useEffect(() => {
    if (!enabled || tools.length === 0) return

    // Register all tools for command deduplication
    tools
      .filter((tool) => tool.type === 'tool' && tool.checkCommand)
      .forEach((tool) => {
        toolHealthService.registerToolCommand(tool.id, tool.checkCommand!)
      })

    const toolsToCheck = tools
      .filter((tool) => tool.type === 'tool' && tool.checkCommand)
      .map((tool) => ({
        id: tool.id,
        checkCommand: tool.checkCommand!,
      }))

    if (toolsToCheck.length === 0) return

    // Perform health check
    batchCheckToolInstallation({ data: { tools: toolsToCheck } })
      .then((result) => {
        // Update store with results
        Object.entries(result.results).forEach(([toolId, healthResult]) => {
          toolHealthService.updateHealthCheck(toolId, healthResult)
        })
      })
      .catch((error) => {
        console.error('Failed to check tool health:', error)
      })
  }, [tools, enabled])

  return healthChecks
}

/**
 * Hook to check health of a single tool using TanStack Query
 *
 * Key features:
 * - Query keyed by checkCommand for deduplication
 * - Tools with same checkCommand share cache
 * - Syncs to Zustand for unified state
 */
export function useSingleToolHealthCheck(tool: App, enabled = true) {
  // Use the Query-based hook
  const query = useHealthCheckQuery(
    tool.id,
    tool.type === 'tool' ? tool.checkCommand : undefined,
    { enabled: enabled && tool.type === 'tool' },
  )

  // Also subscribe to Zustand for immediate access
  const currentHealth = useToolHealth(tool.id)

  return {
    ...currentHealth,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
