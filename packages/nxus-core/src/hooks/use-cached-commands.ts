import { useEffect } from 'react'
import { useCacheStore, selectAllCommands } from '@/stores/cache.store'
import { initializeCache } from '@/services/cache/cache-sync.service'
import type { CachedCommand } from '@/lib/db'

/**
 * Hook to access cached commands with instant reads
 *
 * @example
 * const { commands, isLoading } = useCachedCommands()
 */
export function useCachedCommands(): {
  commands: CachedCommand[]
  isLoading: boolean
  isInitialized: boolean
} {
  const commands = useCacheStore(selectAllCommands)
  const isLoading = useCacheStore((state) => state.isLoading)
  const isInitialized = useCacheStore((state) => state.isInitialized)

  // Initialize cache on first access
  useEffect(() => {
    if (!isInitialized) {
      initializeCache()
    }
  }, [isInitialized])

  return { commands, isLoading, isInitialized }
}

/**
 * Search commands by query
 */
export function searchCommands(
  commands: CachedCommand[],
  query: string,
): CachedCommand[] {
  if (!query.trim()) return commands

  const lowerQuery = query.toLowerCase()
  return commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.category.toLowerCase().includes(lowerQuery),
  )
}
