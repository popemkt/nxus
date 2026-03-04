/**
 * TanStack Query hook for fetching recall topics.
 */

import { useQuery } from '@tanstack/react-query'
import { getTopicsServerFn } from '../server/recall.server.js'
import type { RecallTopic } from '../types/recall.js'

export const recallTopicKeys = {
  all: ['recall', 'topics'] as const,
}

export function useTopics() {
  const query = useQuery({
    queryKey: recallTopicKeys.all,
    queryFn: async (): Promise<RecallTopic[]> => {
      const result = await getTopicsServerFn({ data: {} })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
  })

  return {
    topics: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  }
}
