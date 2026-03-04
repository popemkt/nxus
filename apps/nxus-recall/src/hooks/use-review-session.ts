/**
 * State machine hook for managing a review session.
 *
 * Phases: loading → question → answer → feedback → (next card or complete)
 */

import { useState, useCallback, useRef } from 'react'
import { getDueCardsServerFn } from '../server/recall.server.js'
import { generateQuestionServerFn } from '../server/ai.server.js'
import { evaluateAnswerServerFn } from '../server/ai.server.js'
import { previewIntervalsServerFn } from '../server/fsrs.server.js'
import { rateCardServerFn } from '../server/fsrs.server.js'
import type { RecallConcept, FsrsRating, IntervalsPreview } from '../types/recall.js'
import type { GeneratedQuestion, AnswerEvaluation } from '../types/ai.js'

export type ReviewPhase = 'loading' | 'question' | 'answer' | 'feedback' | 'complete' | 'error' | 'empty'

interface SessionRatingRecord {
  rating: FsrsRating
  conceptTitle: string
}

export interface ReviewSessionState {
  phase: ReviewPhase
  queue: RecallConcept[]
  currentIndex: number
  question: GeneratedQuestion | null
  evaluation: AnswerEvaluation | null
  intervals: IntervalsPreview | null
  userAnswer: string
  error: string | null
  progress: { current: number; total: number }
  ratings: SessionRatingRecord[]
}

const INITIAL_STATE: ReviewSessionState = {
  phase: 'loading',
  queue: [],
  currentIndex: 0,
  question: null,
  evaluation: null,
  intervals: null,
  userAnswer: '',
  error: null,
  progress: { current: 0, total: 0 },
  ratings: [],
}

export function useReviewSession(topicId?: string) {
  const [state, setState] = useState<ReviewSessionState>(INITIAL_STATE)
  const startedRef = useRef(false)

  const currentConcept = state.queue[state.currentIndex] ?? null

  const generateQuestion = useCallback(async (concept: RecallConcept) => {
    setState((s) => ({ ...s, phase: 'question', question: null, evaluation: null, intervals: null, userAnswer: '', error: null }))

    try {
      const result = await generateQuestionServerFn({ data: { conceptId: concept.id } })
      if (!result.success) {
        setState((s) => ({ ...s, phase: 'error', error: result.error }))
        return
      }
      setState((s) => ({ ...s, question: result.data, phase: 'answer' }))
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: String(err) }))
    }
  }, [])

  const startSession = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true

    setState({ ...INITIAL_STATE, phase: 'loading' })

    try {
      const result = await getDueCardsServerFn({ data: { topicId } })
      if (!result.success) {
        setState((s) => ({ ...s, phase: 'error', error: result.error }))
        return
      }

      const cards = result.data
      if (cards.length === 0) {
        setState((s) => ({ ...s, phase: 'empty', queue: [] }))
        return
      }

      const firstCard = cards[0]!
      setState((s) => ({
        ...s,
        queue: cards,
        currentIndex: 0,
        progress: { current: 1, total: cards.length },
      }))

      await generateQuestion(firstCard)
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: String(err) }))
    }
  }, [topicId, generateQuestion])

  const submitAnswer = useCallback(async (answer: string) => {
    const concept = state.queue[state.currentIndex]
    const question = state.question
    if (!concept || !question) return

    setState((s) => ({ ...s, userAnswer: answer, phase: 'loading' }))

    try {
      // Evaluate answer and get interval previews in parallel
      const [evalResult, intervalsResult] = await Promise.all([
        evaluateAnswerServerFn({
          data: {
            conceptId: concept.id,
            questionText: question.questionText,
            questionType: question.questionType,
            userAnswer: answer,
          },
        }),
        previewIntervalsServerFn({ data: { conceptId: concept.id } }),
      ])

      if (!evalResult.success) {
        setState((s) => ({ ...s, phase: 'error', error: evalResult.error }))
        return
      }

      setState((s) => ({
        ...s,
        phase: 'feedback',
        evaluation: evalResult.data,
        intervals: intervalsResult.success ? intervalsResult.data : null,
      }))
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: String(err) }))
    }
  }, [state.queue, state.currentIndex, state.question])

  const rateCard = useCallback(async (rating: FsrsRating) => {
    const concept = state.queue[state.currentIndex]
    const question = state.question
    const evaluation = state.evaluation
    if (!concept || !question || !evaluation) return

    setState((s) => ({ ...s, phase: 'loading' }))

    try {
      const result = await rateCardServerFn({
        data: {
          conceptId: concept.id,
          rating,
          questionText: question.questionText,
          questionType: question.questionType,
          userAnswer: state.userAnswer,
          aiFeedback: evaluation.feedback,
        },
      })

      if (!result.success) {
        setState((s) => ({ ...s, phase: 'error', error: result.error }))
        return
      }

      const newRatings = [...state.ratings, { rating, conceptTitle: concept.title }]
      const nextIndex = state.currentIndex + 1

      if (nextIndex >= state.queue.length) {
        // Session complete
        setState((s) => ({
          ...s,
          phase: 'complete',
          ratings: newRatings,
          currentIndex: nextIndex,
        }))
        return
      }

      // Move to next card
      setState((s) => ({
        ...s,
        ratings: newRatings,
        currentIndex: nextIndex,
        progress: { current: nextIndex + 1, total: s.queue.length },
      }))

      await generateQuestion(state.queue[nextIndex]!)
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: String(err) }))
    }
  }, [state.queue, state.currentIndex, state.question, state.evaluation, state.userAnswer, state.ratings, generateQuestion])

  const retryError = useCallback(async () => {
    const concept = state.queue[state.currentIndex]
    if (!concept) {
      // Try restarting the session
      startedRef.current = false
      await startSession()
      return
    }
    await generateQuestion(concept)
  }, [state.queue, state.currentIndex, generateQuestion, startSession])

  return {
    ...state,
    currentConcept,
    startSession,
    submitAnswer,
    rateCard,
    retryError,
  }
}
