import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemStatusResult } from '../apps/item-status.server'

/**
 * State for item status results
 */
interface ItemStatusState {
  itemStatuses: Record<string, ItemStatusResult>
  lastChecked: Record<string, number>
  /** Maps checkCommand → itemIds for shared caching */
  commandToItems: Record<string, string[]>
  actions: {
    updateItemStatus: (itemId: string, result: ItemStatusResult) => void
    /** Register an item's checkCommand for deduplication */
    registerItemCommand: (itemId: string, checkCommand: string) => void
    /** Update all items that share a checkCommand */
    updateStatusesByCommand: (
      checkCommand: string,
      result: ItemStatusResult,
    ) => void
    clearItemStatus: (itemId: string) => void
    /** Clear all items that share a checkCommand */
    clearStatusesByCommand: (checkCommand: string) => void
    clearAllItemStatuses: () => void
  }
}

/**
 * Cache TTL in milliseconds (5 minutes)
 */
const CACHE_TTL = 5 * 60 * 1000

/**
 * Store for item status results
 * Keeps track of which items are ready/installed and their versions
 * Persisted to localStorage with TTL
 */
export const useItemStatusStore = create<ItemStatusState>()(
  persist(
    (set, get) => ({
      itemStatuses: {},
      lastChecked: {},
      commandToItems: {},
      actions: {
        updateItemStatus: (itemId, result) =>
          set((state) => ({
            itemStatuses: {
              ...state.itemStatuses,
              [itemId]: result,
            },
            lastChecked: {
              ...state.lastChecked,
              [itemId]: Date.now(),
            },
          })),
        registerItemCommand: (itemId, checkCommand) =>
          set((state) => {
            const existing = state.commandToItems[checkCommand] || []
            if (existing.includes(itemId)) return state
            return {
              commandToItems: {
                ...state.commandToItems,
                [checkCommand]: [...existing, itemId],
              },
            }
          }),
        updateStatusesByCommand: (checkCommand, result) => {
          const itemIds = get().commandToItems[checkCommand] || []
          if (itemIds.length === 0) return

          const now = Date.now()
          set((state) => {
            const itemStatuses = { ...state.itemStatuses }
            const lastChecked = { ...state.lastChecked }

            itemIds.forEach((itemId) => {
              itemStatuses[itemId] = result
              lastChecked[itemId] = now
            })

            return { itemStatuses, lastChecked }
          })
        },
        clearItemStatus: (itemId) =>
          set((state) => {
            const { [itemId]: _, ...itemStatuses } = state.itemStatuses
            const { [itemId]: __, ...lastChecked } = state.lastChecked
            return { itemStatuses, lastChecked }
          }),
        clearStatusesByCommand: (checkCommand) => {
          const itemIds = get().commandToItems[checkCommand] || []
          if (itemIds.length === 0) return

          set((state) => {
            const itemStatuses = { ...state.itemStatuses }
            const lastChecked = { ...state.lastChecked }

            itemIds.forEach((itemId) => {
              delete itemStatuses[itemId]
              delete lastChecked[itemId]
            })

            return { itemStatuses, lastChecked }
          })
        },
        clearAllItemStatuses: () =>
          set({
            itemStatuses: {},
            lastChecked: {},
          }),
      },
    }),
    {
      name: 'item-status-storage',
      partialize: (state) => ({
        itemStatuses: state.itemStatuses,
        lastChecked: state.lastChecked,
        commandToItems: state.commandToItems,
      }),
    },
  ),
)

/**
 * Hook to get status result for an item
 * Returns undefined if cache is stale (>5 minutes old)
 */
export const useItemStatus = (itemId: string) => {
  const status = useItemStatusStore((state) => state.itemStatuses[itemId])
  const lastChecked = useItemStatusStore((state) => state.lastChecked[itemId])

  // Check if cache is stale
  const isStale = lastChecked && Date.now() - lastChecked > CACHE_TTL

  return {
    ...status,
    lastChecked,
    isStale,
  }
}

/**
 * Hook to get all item status results
 */
export const useAllItemStatus = () => {
  return useItemStatusStore((state) => state.itemStatuses)
}

/**
 * Service object for imperative actions
 */
export const itemStatusService = {
  updateItemStatus: (itemId: string, result: ItemStatusResult) => {
    useItemStatusStore.getState().actions.updateItemStatus(itemId, result)
  },
  registerItemCommand: (itemId: string, checkCommand: string) => {
    useItemStatusStore
      .getState()
      .actions.registerItemCommand(itemId, checkCommand)
  },
  updateStatusesByCommand: (checkCommand: string, result: ItemStatusResult) => {
    useItemStatusStore
      .getState()
      .actions.updateStatusesByCommand(checkCommand, result)
  },
  clearItemStatus: (itemId: string) => {
    useItemStatusStore.getState().actions.clearItemStatus(itemId)
  },
  clearStatusesByCommand: (checkCommand: string) => {
    useItemStatusStore.getState().actions.clearStatusesByCommand(checkCommand)
  },
  clearAllItemStatuses: () => {
    useItemStatusStore.getState().actions.clearAllItemStatuses()
  },
  /**
   * Get status result for an item
   */
  getItemStatus: (itemId: string): ItemStatusResult | undefined => {
    return useItemStatusStore.getState().itemStatuses[itemId]
  },
  /**
   * Get item readiness (if registered)
   */
  getCheckCommand: (itemId: string): string | undefined => {
    const commandToItems = useItemStatusStore.getState().commandToItems
    for (const [cmd, itemIds] of Object.entries(commandToItems)) {
      if (itemIds.includes(itemId)) return cmd
    }
    return undefined
  },
  /**
   * Get stale item statuses (older than TTL)
   */
  getStaleStatuses: (): string[] => {
    const state = useItemStatusStore.getState()
    const now = Date.now()
    return Object.entries(state.lastChecked)
      .filter(([_, timestamp]) => now - timestamp > CACHE_TTL)
      .map(([itemId]) => itemId)
  },
}
