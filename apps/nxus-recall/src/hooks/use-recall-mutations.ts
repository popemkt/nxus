/**
 * TanStack Query mutation hooks for recall operations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveConceptServerFn, createManualConceptServerFn } from '../server/recall.server.js'
import { rateCardServerFn } from '../server/fsrs.server.js'
import { recallTopicKeys } from './use-topics.js'
import { recallConceptKeys } from './use-concepts.js'
import { recallDueKeys } from './use-due-cards.js'
import type { SaveConceptInput, CreateManualConceptInput, RateCardInput } from '../types/schemas.js'
import type { RecallConcept, RecallCard } from '../types/recall.js'

/** Invalidate all recall-related queries. */
function invalidateAllRecall(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      return Array.isArray(key) && key[0] === 'recall'
    },
  })
}

export function useSaveConcept() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: SaveConceptInput): Promise<RecallConcept> => {
      const result = await saveConceptServerFn({ data: input })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      invalidateAllRecall(queryClient)
    },
  })

  return {
    saveConcept: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

export function useCreateManualConcept() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: CreateManualConceptInput): Promise<RecallConcept> => {
      const result = await createManualConceptServerFn({ data: input })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: recallTopicKeys.all })
      queryClient.invalidateQueries({ queryKey: recallConceptKeys.byTopic(variables.topicId) })
      queryClient.invalidateQueries({ queryKey: recallDueKeys.all })
    },
  })

  return {
    createConcept: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

export function useRateCard() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: RateCardInput): Promise<RecallCard> => {
      const result = await rateCardServerFn({ data: input })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      invalidateAllRecall(queryClient)
    },
  })

  return {
    rateCard: mutation.mutateAsync,
    isRating: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}
