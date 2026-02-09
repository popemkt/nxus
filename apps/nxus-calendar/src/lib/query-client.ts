import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      // Retry failed queries up to 2 times before surfacing the error
      retry: 2,
      // Keep unused query data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
    },
  },
})
