import { useEffect } from 'react'
import type { App } from '@/types/app'
import { batchCheckItemStatus } from '@/services/apps/item-status.server'
import {
  itemStatusService,
  useAllItemStatus,
  useItemStatus,
} from '@/services/state/item-status-state'
import { useItemStatusQuery } from './use-item-status-query'

/**
 * Hook to check status of a batch of items
 */
export function useBatchItemStatus(items: App[], enabled = true) {
  const itemStatuses = useAllItemStatus()

  useEffect(() => {
    if (!enabled || items.length === 0) return

    // Register all items for command deduplication
    items
      .filter((item) => item.type === 'tool' && (item as any).checkCommand)
      .forEach((item) => {
        itemStatusService.registerItemCommand(
          item.id,
          (item as any).checkCommand!,
        )
      })

    const itemsToCheck = items
      .filter((item) => item.type === 'tool' && item.checkCommand)
      .map((item) => ({
        id: item.id,
        checkCommand: (item as any).checkCommand!, // Type narrowing with filter is tricky for TS
      }))

    if (itemsToCheck.length === 0) return

    // Perform status check
    batchCheckItemStatus({ data: { items: itemsToCheck } })
      .then((result) => {
        // Update store with results
        Object.entries(result.results).forEach(([itemId, statusResult]) => {
          itemStatusService.updateItemStatus(itemId, statusResult)
        })
      })
      .catch((error) => {
        console.error('Failed to check item status:', error)
      })
  }, [items, enabled])

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
