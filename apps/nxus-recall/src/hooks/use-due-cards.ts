/**
 * TanStack Query hook for fetching due cards (concepts ready for review).
 */

import { useQuery } from '@tanstack/react-query'
import { getDueCardsServerFn } from '../server/recall.server.js'
import type { RecallConcept } from '../types/recall.js'

export const recallDueKeys = {
  all: ['recall', 'due'] as const,
  byTopic: (topicId: string) => ['recall', 'due', topicId] as const,
  forScope: (topicId?: string) => ['recall', 'due', topicId ?? 'all'] as const,
}

export function useDueCards(topicId?: string) {
  const query = useQuery({
    queryKey: recallDueKeys.forScope(topicId),
    queryFn: async (): Promise<RecallConcept[]> => {
      const result = await getDueCardsServerFn({ data: { topicId } })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
  })

  return {
    cards: query.data ?? [],
    count: query.data?.length ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
