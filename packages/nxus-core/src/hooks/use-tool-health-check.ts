import { useEffect } from 'react'
import type { App } from '@/types/app'
import { batchCheckToolInstallation } from '@/services/apps/health-check.server'
import {
  toolHealthService,
  useAllToolHealth,
  useToolHealth,
} from '@/services/state/tool-health-state'

/**
 * Hook to check health of all tools
 * Useful for checking all tools at once when loading the app
 */
export function useToolHealthCheck(tools: App[], enabled = true) {
  const healthChecks = useAllToolHealth()

  useEffect(() => {
    if (!enabled || tools.length === 0) return

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
 * Hook to check health of a single tool
 * Re-runs automatically when the cached result is cleared (invalidated)
 */
export function useSingleToolHealthCheck(tool: App, enabled = true) {
  // Subscribe to current health check result - this creates reactivity
  const currentHealth = useToolHealth(tool.id)

  useEffect(() => {
    if (!enabled || tool.type !== 'tool' || !tool.checkCommand) return

    // Only run check if we don't have a cached result
    // This triggers on: 1) initial mount, 2) after cache is cleared
    if (currentHealth?.isInstalled !== undefined) return

    const checkHealth = async () => {
      try {
        const result = await batchCheckToolInstallation({
          data: {
            tools: [
              {
                id: tool.id,
                checkCommand: tool.checkCommand!,
              },
            ],
          },
        })

        const healthResult = result.results[tool.id]
        if (healthResult) {
          toolHealthService.updateHealthCheck(tool.id, healthResult)
        }
      } catch (error) {
        console.error(`Failed to check health for ${tool.name}:`, error)
      }
    }

    checkHealth()
  }, [
    tool.id,
    tool.name,
    tool.type,
    tool.checkCommand,
    enabled,
    currentHealth?.isInstalled,
  ])
}
