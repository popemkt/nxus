import { useEffect, useMemo } from 'react'
import type { App } from '@/types/app'
import {
  itemStatusService,
  useAllItemStatus,
  useItemStatus,
} from '@/services/state/item-status-state'
import { useItemStatusQuery } from './use-item-status-query'

/**
 * Hook to check status of a batch of items
 * Uses TanStack Query for caching - triggers individual queries for each unique checkCommand
 */
export function useBatchItemStatus(items: App[], enabled = true) {
  const itemStatuses = useAllItemStatus()

  // Group items by their unique checkCommand to avoid duplicates
  const checkCommands = useMemo(() => {
    const commandMap = new Map<string, App[]>()

    items
      .filter((item) => item.type === 'tool' && (item as any).checkCommand)
      .forEach((item) => {
        const cmd = (item as any).checkCommand!
        const existing = commandMap.get(cmd) || []
        existing.push(item)
        commandMap.set(cmd, existing)
      })

    return commandMap
  }, [items])

  // Trigger a query for each unique checkCommand
  // This leverages TanStack Query's caching - if data exists, it won't refetch
  checkCommands.forEach((itemsWithSameCommand, checkCommand) => {
    const firstItem = itemsWithSameCommand[0]
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useItemStatusQuery(firstItem.id, checkCommand, { enabled })
  })

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
