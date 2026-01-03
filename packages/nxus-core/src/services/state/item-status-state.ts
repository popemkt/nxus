import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemStatusResult } from '../apps/health-check.server'

/**
 * State for tool health check results
 */
interface ItemStatusState {
  healthChecks: Record<string, ItemStatusResult>
  lastChecked: Record<string, number>
  /** Maps checkCommand → itemIds for shared caching */
  commandToTools: Record<string, string[]>
  actions: {
    updateHealthCheck: (itemId: string, result: ItemStatusResult) => void
    /** Register a tool's checkCommand for deduplication */
    registerToolCommand: (itemId: string, checkCommand: string) => void
    /** Update all tools that share a checkCommand */
    updateHealthChecksByCommand: (
      checkCommand: string,
      result: ItemStatusResult,
    ) => void
    clearHealthCheck: (itemId: string) => void
    /** Clear all tools that share a checkCommand */
    clearHealthChecksByCommand: (checkCommand: string) => void
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
export const useItemStatusStore = create<ItemStatusState>()(
  persist(
    (set, get) => ({
      healthChecks: {},
      lastChecked: {},
      commandToTools: {},
      actions: {
        updateHealthCheck: (itemId, result) =>
          set((state) => ({
            healthChecks: {
              ...state.healthChecks,
              [itemId]: result,
            },
            lastChecked: {
              ...state.lastChecked,
              [itemId]: Date.now(),
            },
          })),
        registerToolCommand: (itemId, checkCommand) =>
          set((state) => {
            const existing = state.commandToTools[checkCommand] || []
            if (existing.includes(itemId)) return state
            return {
              commandToTools: {
                ...state.commandToTools,
                [checkCommand]: [...existing, itemId],
              },
            }
          }),
        updateHealthChecksByCommand: (checkCommand, result) => {
          const itemIds = get().commandToTools[checkCommand] || []
          if (itemIds.length === 0) return

          const now = Date.now()
          set((state) => {
            const healthChecks = { ...state.healthChecks }
            const lastChecked = { ...state.lastChecked }

            itemIds.forEach((itemId) => {
              healthChecks[itemId] = result
              lastChecked[itemId] = now
            })

            return { healthChecks, lastChecked }
          })
        },
        clearHealthCheck: (itemId) =>
          set((state) => {
            const { [itemId]: _, ...healthChecks } = state.healthChecks
            const { [itemId]: __, ...lastChecked } = state.lastChecked
            return { healthChecks, lastChecked }
          }),
        clearHealthChecksByCommand: (checkCommand) => {
          const itemIds = get().commandToTools[checkCommand] || []
          if (itemIds.length === 0) return

          set((state) => {
            const healthChecks = { ...state.healthChecks }
            const lastChecked = { ...state.lastChecked }

            itemIds.forEach((itemId) => {
              delete healthChecks[itemId]
              delete lastChecked[itemId]
            })

            return { healthChecks, lastChecked }
          })
        },
        clearAllHealthChecks: () =>
          set({
            healthChecks: {},
            lastChecked: {},
          }),
      },
    }),
    {
      name: 'item-status-storage',
      partialize: (state) => ({
        healthChecks: state.healthChecks,
        lastChecked: state.lastChecked,
        commandToTools: state.commandToTools,
      }),
    },
  ),
)

/**
 * Hook to get health check result for a tool
 * Returns undefined if cache is stale (>5 minutes old)
 */
export const useItemStatus = (itemId: string) => {
  const healthCheck = useItemStatusStore((state) => state.healthChecks[itemId])
  const lastChecked = useItemStatusStore((state) => state.lastChecked[itemId])

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
export const useAllItemStatus = () => {
  return useItemStatusStore((state) => state.healthChecks)
}

/**
 * Service object for imperative actions
 */
export const itemStatusService = {
  updateHealthCheck: (itemId: string, result: ItemStatusResult) => {
    useItemStatusStore.getState().actions.updateHealthCheck(itemId, result)
  },
  registerToolCommand: (itemId: string, checkCommand: string) => {
    useItemStatusStore
      .getState()
      .actions.registerToolCommand(itemId, checkCommand)
  },
  updateHealthChecksByCommand: (
    checkCommand: string,
    result: ItemStatusResult,
  ) => {
    useItemStatusStore
      .getState()
      .actions.updateHealthChecksByCommand(checkCommand, result)
  },
  clearHealthCheck: (itemId: string) => {
    useItemStatusStore.getState().actions.clearHealthCheck(itemId)
  },
  clearHealthChecksByCommand: (checkCommand: string) => {
    useItemStatusStore
      .getState()
      .actions.clearHealthChecksByCommand(checkCommand)
  },
  clearAllHealthChecks: () => {
    useItemStatusStore.getState().actions.clearAllHealthChecks()
  },
  /**
   * Get health check result for a tool
   */
  getHealthCheck: (itemId: string): ItemStatusResult | undefined => {
    return useItemStatusStore.getState().healthChecks[itemId]
  },
  /**
   * Get checkCommand for a tool (if registered)
   */
  getToolCommand: (itemId: string): string | undefined => {
    const commandToTools = useItemStatusStore.getState().commandToTools
    for (const [cmd, itemIds] of Object.entries(commandToTools)) {
      if (itemIds.includes(itemId)) return cmd
    }
    return undefined
  },
  /**
   * Get stale health checks (older than TTL)
   */
  getStaleHealthChecks: (): string[] => {
    const state = useItemStatusStore.getState()
    const now = Date.now()
    return Object.entries(state.lastChecked)
      .filter(([_, timestamp]) => now - timestamp > CACHE_TTL)
      .map(([itemId]) => itemId)
  },
}

// Deprecated aliases for backward compatibility
/** @deprecated Use itemStatusService instead */
export const toolHealthService = itemStatusService
/** @deprecated Use useItemStatus instead */
export const useToolHealth = useItemStatus
/** @deprecated Use useAllItemStatus instead */
export const useAllToolHealth = useAllItemStatus
/** @deprecated Use useItemStatusStore instead */
export const useToolHealthStore = useItemStatusStore
