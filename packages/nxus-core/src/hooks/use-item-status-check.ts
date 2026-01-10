import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { App } from '@/types/app'
import {
  itemStatusService,
  useAllItemStatus,
  useItemStatus,
} from '@/services/state/item-status-state'
import { useItemStatusQuery, itemStatusKeys } from './use-item-status-query'
import { checkItemStatus } from '@/services/apps/item-status.server'

/**
 * Hook to check status of a batch of items
 * Pre-fetches queries into TanStack Query cache for all unique check commands
 */
export function useBatchItemStatus(items: App[], enabled = true) {
  const itemStatuses = useAllItemStatus()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || items.length === 0) return

    // Get unique check commands
    const uniqueCommands = new Map<string, App[]>()

    items
      .filter((item) => item.type === 'tool' && (item as any).checkCommand)
      .forEach((item) => {
        const cmd = (item as any).checkCommand!
        itemStatusService.registerItemCommand(item.id, cmd)

        const existing = uniqueCommands.get(cmd) || []
        existing.push(item)
        uniqueCommands.set(cmd, existing)
      })

    // Pre-fetch each unique check command into TanStack Query cache
    // This is NOT a hook, so it's safe to call in a loop!
    uniqueCommands.forEach(async (itemsWithSameCommand, checkCommand) => {
      const firstItem = itemsWithSameCommand[0]

      // Fetch and cache the result
      const result = await queryClient.ensureQueryData({
        queryKey: itemStatusKeys.command(checkCommand),
        queryFn: async () => {
          return await checkItemStatus({ data: { checkCommand } })
        },
        staleTime: 5 * 60 * 1000,
      })

      // Update Zustand store for all items with this command
      itemStatusService.updateStatusesByCommand(checkCommand, result)
    })
  }, [items, enabled, queryClient])

  return itemStatuses
}

/**
 * Hook to check an item's status using TanStack Query
 * Handles undefined app gracefully for SSR
 */
export function useItemStatusCheck(
  item: App | null | undefined,
  enabled = true,
) {
  // Use the Query-based hook
  const query = useItemStatusQuery(
    item?.id ?? '',
    item?.type === 'tool' ? item.checkCommand : undefined,
    { enabled: enabled && !!item && item.type === 'tool' },
  )

  // Also subscribe to Zustand for immediate access
  const currentStatus = useItemStatus(item?.id ?? '')

  return {
    ...currentStatus,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
