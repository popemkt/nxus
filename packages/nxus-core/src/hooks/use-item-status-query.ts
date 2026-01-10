/**
 * useItemStatusQuery - TanStack Query hook for item status checks
 *
 * This hook uses TanStack Query for fetching, keying by checkCommand
 * for automatic deduplication. Results sync to Zustand for unified state.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  checkItemStatus,
  type ItemStatusResult,
} from '@/services/apps/item-status.server'
import { itemStatusService } from '@/services/state/item-status-state'

/**
 * Query key factory for item status checks
 */
export const itemStatusKeys = {
  all: ['item-status'] as const,
  command: (checkCommand: string) => ['item-status', checkCommand] as const,
}

/**
 * Hook to check an item's status using TanStack Query
 */
export function useItemStatusQuery(
  itemId: string,
  checkCommand: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false && !!checkCommand

  // Register this item's command for shared updates
  useEffect(() => {
    if (checkCommand) {
      itemStatusService.registerItemCommand(itemId, checkCommand)
    }
  }, [itemId, checkCommand])

  const query = useQuery({
    queryKey: itemStatusKeys.command(checkCommand ?? ''),
    queryFn: async (): Promise<ItemStatusResult> => {
      if (!checkCommand) {
        return { isInstalled: false, error: 'No check command' }
      }
      return checkItemStatus({ data: { checkCommand } })
    },
    staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
    enabled,
    refetchOnMount: false, // Don't refetch when component remounts (rely on staleTime)
    refetchOnWindowFocus: false, // Don't refetch on window focus (like navigation)
    refetchOnReconnect: false, // Don't refetch on network reconnect
  })

  // Sync query result to Zustand for all items with this command
  useEffect(() => {
    if (query.data && checkCommand) {
      itemStatusService.updateStatusesByCommand(checkCommand, query.data)
    }
  }, [query.data, checkCommand])

  return query
}

/**
 * Hook to invalidate item status checks
 */
export function useInvalidateItemStatus() {
  const queryClient = useQueryClient()

  return {
    invalidateByCommand: (checkCommand: string) => {
      itemStatusService.clearStatusesByCommand(checkCommand)
      queryClient.invalidateQueries({
        queryKey: itemStatusKeys.command(checkCommand),
      })
    },
    invalidateByItemId: (itemId: string) => {
      const checkCommand = itemStatusService.getCheckCommand(itemId)
      if (checkCommand) {
        itemStatusService.clearStatusesByCommand(checkCommand)
        queryClient.invalidateQueries({
          queryKey: itemStatusKeys.command(checkCommand),
        })
      } else {
        itemStatusService.clearItemStatus(itemId)
      }
    },
    invalidateAll: () => {
      itemStatusService.clearAllItemStatuses()
      queryClient.invalidateQueries({
        queryKey: itemStatusKeys.all,
      })
    },
  }
}
