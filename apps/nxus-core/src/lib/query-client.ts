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
    },
  },
})
