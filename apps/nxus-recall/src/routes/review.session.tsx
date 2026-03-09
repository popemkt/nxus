import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import {
  ArrowLeft,
  Brain,
  Bug,
  Lightning,
  SkipForward,
  SpinnerGap,
  PaperPlaneRight,
  Trophy,
  Warning,
} from '@phosphor-icons/react'
import { getDueCardsServerFn } from '@/services/review.server'
import { useSessionTimer } from '@/lib/use-session-timer'
import { formatElapsed } from '@/lib/format'
import { useReviewEngine } from '@/hooks/use-review-engine'
import { QuestionInput } from '@/components/review/question-input'
import { HintButton } from '@/components/review/hint-button'
import { RatingButtons } from '@/components/review/rating-buttons'
import { FeedbackCard } from '@/components/review/feedback-card'
import { ExplainFurther } from '@/components/review/explain-further'
import { SessionSummaryCard } from '@/components/session/session-summary'
import type { RecallConcept } from '@nxus/db'

export const Route = createFileRoute('/review/session')({
  component: ReviewSessionPage,
  validateSearch: z.object({
    topicId: z.string().optional(),
  }),
})

function ReviewSessionPage() {
  const { topicId } = Route.useSearch()

  const hintsUsedRef = useRef(0)
  const timerRef = useRef<{ resetCardTimer: () => void; getCardElapsedMs: () => number }>({ resetCardTimer: () => {}, getCardElapsedMs: () => 0 })
  const [sessionStats, setSessionStats] = useState({
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>,
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    timeSpentMs: 0,
  })

  const engine = useReviewEngine({
    getExtraSubmitData: () => ({
      timeSpentMs: timerRef.current.getCardElapsedMs(),
      hintsUsed: hintsUsedRef.current,
    }),
    onNewCard: () => {
      timerRef.current.resetCardTimer()
      hintsUsedRef.current = 0
    },
    onCardReviewed: (rating: 1 | 2 | 3 | 4, concept: RecallConcept) => {
      const cardState = concept.card?.state
      setSessionStats((prev) => ({
        ...prev,
        ratingDistribution: {
          ...prev.ratingDistribution,
          [rating]: prev.ratingDistribution[rating] + 1,
        },
        newCount: prev.newCount + (cardState === 0 ? 1 : 0),
        learningCount: prev.learningCount + (cardState === 1 || cardState === 3 ? 1 : 0),
        reviewCount: prev.reviewCount + (cardState === 2 ? 1 : 0),
        timeSpentMs: prev.timeSpentMs + timerRef.current.getCardElapsedMs(),
      }))
    },
  })

  const { elapsedMs, resetCardTimer, getCardElapsedMs } = useSessionTimer(
    engine.phase !== 'loading' && engine.phase !== 'complete',
  )
  timerRef.current = { resetCardTimer, getCardElapsedMs }

  useQuery({
    queryKey: ['due-cards', topicId],
    queryFn: async () => {
      const result = await getDueCardsServerFn({
        data: { topicId, limit: 50 },
      })
      if (result.success) {
        engine.initSession(result.cards)
      } else {
        engine.initSession([])
      }
      return result
    },
  })

  const { phase, question, evaluation, intervals, userAnswer, currentConcept, queue, currentIndex, reviewedCount } = engine

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Lightning size={20} weight="duotone" className="text-primary" />
              Review Session
            </h1>
          </div>
          {queue.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {queue.length} · {reviewedCount} reviewed · {formatElapsed(elapsedMs)}
            </span>
          ) : null}
        </div>
        {queue.length > 0 ? (
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${((currentIndex + (phase === 'feedback' || phase === 'complete' ? 1 : 0)) / queue.length) * 100}%`,
              }}
            />
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Loading */}
        {phase === 'loading' ? (
          <div className="flex flex-col items-center justify-center py-24">
            <SpinnerGap size={32} className="animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading due cards...</p>
          </div>
        ) : null}

        {/* Generating question */}
        {phase === 'question' ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Brain size={32} weight="duotone" className="text-primary mb-4 animate-pulse" />
            <p className="text-muted-foreground">Generating question for: {currentConcept?.title}</p>
          </div>
        ) : null}

        {/* Answering */}
        {phase === 'answering' && question && currentConcept ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              {currentConcept.topicName} · {currentConcept.title}
              {currentConcept.card?.lapses != null && currentConcept.card.lapses >= 8 ? (
                <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 normal-case">
                  <Bug size={12} /> Leech
                </span>
              ) : currentConcept.card?.lapses != null && currentConcept.card.lapses >= 5 ? (
                <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 normal-case">
                  <Warning size={12} /> Difficult
                </span>
              ) : null}
            </div>
            <div className="mb-6 rounded-xl border border-border bg-card p-6">
              <p className="text-lg font-medium leading-relaxed">
                {question.questionText}
              </p>
              {question.questionType === 'true-false' ? (
                <p className="mt-2 text-xs text-muted-foreground">True or False?</p>
              ) : null}
            </div>

            <div className="mb-4">
              <QuestionInput
                question={question}
                value={userAnswer}
                onChange={engine.setUserAnswer}
                onAutoSubmit={() => engine.evaluateMutation.mutate()}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {queue.length > 1 ? (
                  <button
                    onClick={engine.handleSkip}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <SkipForward size={16} />
                    Skip
                  </button>
                ) : null}
                {question.hints.length > 0 ? (
                  <HintButton
                    hints={question.hints}
                    onReveal={() => {
                      hintsUsedRef.current++
                    }}
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to submit
                </span>
                <button
                  onClick={() => engine.evaluateMutation.mutate()}
                  disabled={!userAnswer.trim() || engine.evaluateMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PaperPlaneRight size={16} />
                  Submit Answer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Evaluating */}
        {phase === 'evaluating' ? (
          <div className="flex flex-col items-center justify-center py-24">
            <SpinnerGap size={32} className="animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Evaluating your answer...</p>
          </div>
        ) : null}

        {/* Feedback */}
        {phase === 'feedback' && evaluation && question ? (
          <div>
            <FeedbackCard
              question={question}
              evaluation={evaluation}
              conceptMeta={currentConcept ? { topicName: currentConcept.topicName, title: currentConcept.title } : undefined}
            >
              {evaluation.keyInsightsMissed.length > 0 && currentConcept ? (
                <ExplainFurther
                  conceptTitle={currentConcept.title}
                  questionText={question.questionText}
                  modelAnswer={question.modelAnswer}
                  keyInsightsMissed={evaluation.keyInsightsMissed}
                  userAnswer={engine.userAnswerRef.current}
                />
              ) : null}
            </FeedbackCard>

            <RatingButtons
              intervals={intervals}
              onRate={(rating) => engine.submitRatingMutation.mutate(rating)}
              disabled={engine.submitRatingMutation.isPending}
            />
          </div>
        ) : null}

        {/* Complete */}
        {phase === 'complete' && reviewedCount > 0 ? (
          <div>
            <SessionSummaryCard
              reviewedCount={reviewedCount}
              ratingDistribution={sessionStats.ratingDistribution}
              timeSpentMs={sessionStats.timeSpentMs}
              stateBreakdown={{
                newCount: sessionStats.newCount,
                learningCount: sessionStats.learningCount,
                reviewCount: sessionStats.reviewCount,
              }}
            />
            <div className="flex items-center justify-center gap-3 mt-6">
              <Link
                to="/"
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/explore"
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Explore More
              </Link>
            </div>
          </div>
        ) : null}

        {/* No cards due */}
        {phase === 'complete' && reviewedCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Trophy
              size={48}
              weight="duotone"
              className="mb-4 text-primary"
            />
            <h2 className="mb-2 text-xl font-semibold">No cards due for review</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              All caught up! Check back later or explore new topics.
            </p>
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/explore"
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Explore More
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
