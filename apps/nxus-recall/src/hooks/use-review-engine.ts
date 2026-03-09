import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitReviewServerFn, previewIntervalsServerFn } from '@/services/review.server'
import { generateQuestionServerFn, prefetchQuestionServerFn } from '@/services/generate-question.server'
import { evaluateAnswerServerFn } from '@/services/evaluate-answer.server'
import { getConceptsByTopicServerFn } from '@/services/concepts.server'
import type { RecallConcept } from '@nxus/db'
import type { GeneratedQuestion, AnswerEvaluation } from '@nxus/mastra'

export type ReviewPhase = 'loading' | 'question' | 'answering' | 'evaluating' | 'feedback' | 'complete'

export interface UseReviewEngineOptions {
  /** Extra fields to include in the submit payload (e.g. reschedule, timeSpentMs) */
  getExtraSubmitData?: () => Record<string, unknown>
  /** Called after each card is reviewed, before moving to next */
  onCardReviewed?: (rating: 1 | 2 | 3 | 4, concept: RecallConcept) => void
  /** Called when a new card starts (for timer reset, etc.) */
  onNewCard?: () => void
}

export function useReviewEngine(options: UseReviewEngineOptions = {}) {
  const { getExtraSubmitData, onCardReviewed, onNewCard } = options
  const queryClient = useQueryClient()

  const [queue, setQueue] = useState<RecallConcept[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<ReviewPhase>('loading')
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null)
  const [userAnswer, _setUserAnswer] = useState('')
  const userAnswerRef = useRef('')
  const setUserAnswer = useCallback((v: string) => {
    userAnswerRef.current = v
    _setUserAnswer(v)
  }, [])
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null)
  const [intervals, setIntervals] = useState<Record<1 | 2 | 3 | 4, number> | null>(null)
  const [reviewedCount, setReviewedCount] = useState(0)
  const prefetchInFlightRef = useRef<Map<string, Promise<void>>>(new Map())

  const currentConcept = queue[currentIndex] ?? null

  // --- Core callbacks ---

  const getAdjacentConcepts = useCallback(
    async (concept: RecallConcept, allCards?: RecallConcept[]) => {
      if (!concept.topicId) return []
      const pool = allCards ?? queue
      if (pool.length > 1) {
        return pool
          .filter((c) => c.id !== concept.id)
          .slice(0, 3)
          .map((c) => ({ title: c.title, summary: c.summary }))
      }
      const conceptsResult = await getConceptsByTopicServerFn({
        data: { topicId: concept.topicId },
      })
      if (conceptsResult.success) {
        return conceptsResult.concepts
          .filter((c: RecallConcept) => c.id !== concept.id)
          .slice(0, 3)
          .map((c: RecallConcept) => ({ title: c.title, summary: c.summary }))
      }
      return []
    },
    [queue],
  )

  const triggerPrefetch = useCallback(
    (concept: RecallConcept, allCards?: RecallConcept[]) => {
      if (prefetchInFlightRef.current.has(concept.id)) return
      const promise = (async () => {
        try {
          const adjacentConcepts = await getAdjacentConcepts(concept, allCards)
          await prefetchQuestionServerFn({
            data: {
              conceptId: concept.id,
              conceptTitle: concept.title,
              conceptSummary: concept.summary,
              bloomsLevel: concept.bloomsLevel,
              currentBloomsLevel: concept.card?.currentBloomsLevel ?? null,
              adjacentConcepts,
            },
          })
        } catch {
          // non-critical
        }
      })()
      prefetchInFlightRef.current.set(concept.id, promise)
    },
    [getAdjacentConcepts],
  )

  const generateQuestionForConcept = useCallback(
    async (concept: RecallConcept) => {
      setPhase('question')
      setQuestion(null)
      setUserAnswer('')
      setEvaluation(null)
      setIntervals(null)
      onNewCard?.()

      try {
        const inFlight = prefetchInFlightRef.current.get(concept.id)
        if (inFlight) await inFlight

        const adjacentConcepts = await getAdjacentConcepts(concept)

        const result = await generateQuestionServerFn({
          data: {
            conceptId: concept.id,
            conceptTitle: concept.title,
            conceptSummary: concept.summary,
            bloomsLevel: concept.bloomsLevel,
            currentBloomsLevel: concept.card?.currentBloomsLevel ?? null,
            adjacentConcepts,
          },
        })

        if (result.success) {
          setQuestion(result.question)
          setPhase('answering')

          previewIntervalsServerFn({
            data: { conceptId: concept.id },
          }).then((r) => {
            if (r.success) setIntervals(r.intervals)
          }).catch(() => {})
        } else {
          // Generation returned an error — fall back to generic question
          throw new Error('Question generation failed')
        }
      } catch {
        setQuestion({
          questionText: `Explain the concept "${concept.title}" and why it matters.`,
          questionType: 'free-response',
          modelAnswer: concept.summary,
          hints: [],
        })
        setPhase('answering')
      }
    },
    [getAdjacentConcepts, onNewCard, setUserAnswer],
  )

  // --- Actions ---

  const initSession = useCallback(
    (cards: RecallConcept[]) => {
      setReviewedCount(0)
      setQuestion(null)
      setEvaluation(null)
      setIntervals(null)
      setUserAnswer('')
      prefetchInFlightRef.current.clear()

      if (cards.length === 0) {
        setQueue([])
        setPhase('complete')
        return
      }
      setQueue(cards)
      setCurrentIndex(0)
      setPhase('question')
      generateQuestionForConcept(cards[0]!)
      for (let i = 1; i <= 2 && i < cards.length; i++) {
        triggerPrefetch(cards[i]!, cards)
      }
    },
    [generateQuestionForConcept, triggerPrefetch, setUserAnswer],
  )

  const handleSkip = useCallback(() => {
    // After splice, the card at currentIndex is the next card to show
    // (unless we're at the end, in which case the spliced array is shorter)
    const isLastCard = currentIndex >= queue.length - 1
    const nextCard = isLastCard ? queue[0]! : queue[currentIndex + 1]!
    setQueue((prev) => {
      const next = [...prev]
      const skipped = next.splice(currentIndex, 1)[0]!
      next.push(skipped)
      return next
    })
    // When skipping the last card, the new queue has the skipped card at end
    // and currentIndex would be out of bounds, so reset to 0
    if (isLastCard) {
      setCurrentIndex(0)
    }
    generateQuestionForConcept(nextCard)
  }, [currentIndex, queue, generateQuestionForConcept])

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      if (!question) return null
      const concept = queue[currentIndex]
      if (!concept) return null
      const answer = userAnswerRef.current

      // Deterministic question types: evaluate client-side
      if (question.questionType === 'multiple-choice' && 'correctIndex' in question) {
        const isCorrect = answer === String(question.correctIndex)
        return {
          rating: isCorrect ? ('good' as const) : ('again' as const),
          score: isCorrect ? 80 : 10,
          feedback: isCorrect
            ? 'Correct! ' + question.modelAnswer
            : 'Incorrect. ' + question.modelAnswer,
          keyInsightsMissed: isCorrect ? [] : ['Review the correct answer above'],
          strongPoints: isCorrect ? ['Selected the correct answer'] : [],
        }
      }

      if (question.questionType === 'true-false' && 'correctAnswer' in question) {
        const isCorrect = answer === String(question.correctAnswer)
        return {
          rating: isCorrect ? ('good' as const) : ('again' as const),
          score: isCorrect ? 80 : 10,
          feedback: isCorrect
            ? 'Correct! ' + question.modelAnswer
            : 'Incorrect. ' + question.modelAnswer,
          keyInsightsMissed: isCorrect ? [] : ['Review the correct answer above'],
          strongPoints: isCorrect ? ['Correctly identified the statement'] : [],
        }
      }

      if (question.questionType === 'fill-blank' && 'blankAnswer' in question) {
        const normalize = (s: string) => s.trim().toLowerCase()
        const isCorrect = normalize(answer) === normalize(question.blankAnswer)
        const isClose = !isCorrect && normalize(question.blankAnswer).includes(normalize(answer))
        return {
          rating: isCorrect ? ('good' as const) : isClose ? ('hard' as const) : ('again' as const),
          score: isCorrect ? 80 : isClose ? 40 : 10,
          feedback: isCorrect
            ? 'Correct! ' + question.modelAnswer
            : `The answer is "${question.blankAnswer}". ${question.modelAnswer}`,
          keyInsightsMissed: isCorrect ? [] : [`The blank should be filled with "${question.blankAnswer}"`],
          strongPoints: isCorrect ? ['Filled in the correct answer'] : isClose ? ['Close, but not exact'] : [],
        }
      }

      // Free-response: server-side AI evaluation
      setPhase('evaluating')
      const result = await evaluateAnswerServerFn({
        data: {
          questionText: question.questionText,
          modelAnswer: question.modelAnswer,
          userAnswer: answer,
          conceptTitle: concept.title,
          questionType: question.questionType,
        },
      })
      if (result.success) {
        return result.evaluation
      }
      throw new Error('Evaluation failed')
    },
    onSuccess: (eval_) => {
      if (eval_) {
        setEvaluation(eval_)
        setPhase('feedback')
      }
    },
    onError: () => {
      // Evaluation failed — fall back to a generous self-assessment prompt
      setEvaluation({
        rating: 'good',
        score: 50,
        feedback: 'Could not evaluate your answer automatically. Please self-assess using the rating buttons below.',
        keyInsightsMissed: [],
        strongPoints: [],
      })
      setPhase('feedback')
    },
  })

  const submitRatingMutation = useMutation({
    mutationFn: async (rating: 1 | 2 | 3 | 4) => {
      const concept = queue[currentIndex]
      if (!concept || !question || !evaluation) return

      const extraData = getExtraSubmitData?.() ?? {}
      await submitReviewServerFn({
        data: {
          conceptId: concept.id,
          questionText: question.questionText,
          questionType: question.questionType,
          userAnswer: userAnswerRef.current,
          aiFeedback: evaluation.feedback,
          rating,
          ...extraData,
        },
      })
    },
    onSuccess: (_data, rating) => {
      const concept = queue[currentIndex]
      setReviewedCount((c) => c + 1)

      if (concept) {
        onCardReviewed?.(rating, concept)
      }

      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })

      const nextIndex = currentIndex + 1
      if (nextIndex < queue.length) {
        setCurrentIndex(nextIndex)
        generateQuestionForConcept(queue[nextIndex]!)
        for (let i = 1; i <= 2; i++) {
          const futureCard = queue[nextIndex + i]
          if (futureCard) triggerPrefetch(futureCard)
        }
      } else {
        setPhase('complete')
      }
    },
  })

  // --- Keyboard shortcuts ---

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter' && !e.shiftKey && phase === 'answering' && userAnswerRef.current.trim()) {
          e.preventDefault()
          evaluateMutation.mutate()
        }
        return
      }

      if (phase === 'answering' && userAnswerRef.current.trim() && e.key === 'Enter') {
        e.preventDefault()
        evaluateMutation.mutate()
      }

      if (phase === 'feedback' && !submitRatingMutation.isPending) {
        const ratingKey = Number(e.key)
        if (ratingKey >= 1 && ratingKey <= 4) {
          e.preventDefault()
          submitRatingMutation.mutate(ratingKey as 1 | 2 | 3 | 4)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, evaluateMutation, submitRatingMutation])

  return {
    // State
    queue,
    currentIndex,
    phase,
    question,
    evaluation,
    intervals,
    userAnswer,
    setUserAnswer,
    userAnswerRef,
    reviewedCount,
    currentConcept,
    // Actions
    initSession,
    evaluateMutation,
    submitRatingMutation,
    handleSkip,
  }
}
