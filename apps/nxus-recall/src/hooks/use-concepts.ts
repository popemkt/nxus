/**
 * TanStack Query hook for fetching concepts by topic.
 */

import { useQuery } from '@tanstack/react-query'
import { getConceptsByTopicServerFn } from '../server/recall.server.js'
import type { RecallConcept } from '../types/recall.js'

export const recallConceptKeys = {
  all: ['recall', 'concepts'] as const,
  byTopic: (topicId: string) => ['recall', 'concepts', topicId] as const,
}

export function useConcepts(topicId: string) {
  const query = useQuery({
    queryKey: recallConceptKeys.byTopic(topicId),
    queryFn: async (): Promise<RecallConcept[]> => {
      const result = await getConceptsByTopicServerFn({ data: { topicId } })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!topicId,
  })

  return {
    concepts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
