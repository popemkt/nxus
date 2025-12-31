import { create } from 'zustand'
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
 * Store for tool health check results
 * Keeps track of which tools are installed and their versions
 */
export const useToolHealthStore = create<ToolHealthState>((set) => ({
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
}))

/**
 * Hook to get health check result for a tool
 */
export const useToolHealth = (toolId: string) => {
  const healthCheck = useToolHealthStore((state) => state.healthChecks[toolId])
  const lastChecked = useToolHealthStore((state) => state.lastChecked[toolId])

  return {
    ...healthCheck,
    lastChecked,
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
}
