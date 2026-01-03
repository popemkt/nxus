import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ToolHealthCheckResult } from '../services/apps/health-check.server'

/**
 * State for tool health check results
 */
interface ToolHealthState {
  healthChecks: Record<string, ToolHealthCheckResult>
  lastChecked: Record<string, number>
  actions: {
    updateHealthCheck: (toolId: string, result: ToolHealthCheckResult) => void
    clearHealthCheck: (toolId: string) => void
    clearAllHealthChecks: () => void
  }
}

/**
 * Cache TTL in milliseconds (5 minutes)
 */
const CACHE_TTL = 5 * 60 * 1000

/**
 * Store for tool health check results
 * Keeps track of which tools are installed and their versions
 * Persisted to localStorage with TTL
 */
export const useToolHealthStore = create<ToolHealthState>()(
  persist(
    (set) => ({
      healthChecks: {},
      lastChecked: {},
      actions: {
        updateHealthCheck: (toolId, result) =>
          set((state) => ({
            healthChecks: {
              ...state.healthChecks,
              [toolId]: result,
            },
            lastChecked: {
              ...state.lastChecked,
              [toolId]: Date.now(),
            },
          })),
        clearHealthCheck: (toolId) =>
          set((state) => {
            const { [toolId]: _, ...healthChecks } = state.healthChecks
            const { [toolId]: __, ...lastChecked } = state.lastChecked
            return { healthChecks, lastChecked }
          }),
        clearAllHealthChecks: () =>
          set({
            healthChecks: {},
            lastChecked: {},
          }),
      },
    }),
    {
      name: 'tool-health-storage',
      partialize: (state) => ({
        healthChecks: state.healthChecks,
        lastChecked: state.lastChecked,
      }),
    },
  ),
)

/**
 * Hook to get health check result for a tool
 * Returns undefined if cache is stale (>5 minutes old)
 */
export const useToolHealth = (toolId: string) => {
  const healthCheck = useToolHealthStore((state) => state.healthChecks[toolId])
  const lastChecked = useToolHealthStore((state) => state.lastChecked[toolId])

  // Check if cache is stale
  const isStale = lastChecked && Date.now() - lastChecked > CACHE_TTL

  return {
    ...healthCheck,
    lastChecked,
    isStale,
  }
}

/**
 * Hook to get all health check results
 */
export const useAllToolHealth = () => {
  return useToolHealthStore((state) => state.healthChecks)
}

/**
 * Service object for imperative actions
 */
export const toolHealthService = {
  updateHealthCheck: (toolId: string, result: ToolHealthCheckResult) => {
    useToolHealthStore.getState().actions.updateHealthCheck(toolId, result)
  },
  clearHealthCheck: (toolId: string) => {
    useToolHealthStore.getState().actions.clearHealthCheck(toolId)
  },
  clearAllHealthChecks: () => {
    useToolHealthStore.getState().actions.clearAllHealthChecks()
  },
  /**
   * Get health check result for a tool
   */
  getHealthCheck: (toolId: string): ToolHealthCheckResult | undefined => {
    return useToolHealthStore.getState().healthChecks[toolId]
  },
  /**
   * Get stale health checks (older than TTL)
   */
  getStaleHealthChecks: (): string[] => {
    const state = useToolHealthStore.getState()
    const now = Date.now()
    return Object.entries(state.lastChecked)
      .filter(([_, timestamp]) => now - timestamp > CACHE_TTL)
      .map(([toolId]) => toolId)
  },
}
