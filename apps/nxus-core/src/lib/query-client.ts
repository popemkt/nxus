import { QueryClient } from '@tanstack/react-query'

/**
 * Global QueryClient instance
 *
 * Exported as a singleton so it can be imported by imperative services
 * (like commandExecutor) to trigger invalidations outside of React hooks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale time of 1 minute (less aggressive than before)
      staleTime: 60 * 1000,
      // Retry failed queries up to 2 times before surfacing the error
      retry: 2,
      // Keep unused query data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
    },
  },
})
