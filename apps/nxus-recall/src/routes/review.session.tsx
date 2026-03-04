import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  LightningIcon,
  WarningCircleIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react'
import { Button, Skeleton } from '@nxus/ui'
import { useReviewSession } from '../hooks/use-review-session.js'
import { ReviewQuestion } from '../components/review-question.js'
import { ReviewAnswer } from '../components/review-answer.js'
import { ReviewFeedback } from '../components/review-feedback.js'
import { RatingButtons } from '../components/rating-buttons.js'
import { FSRS_RATING_LABELS, type FsrsRating } from '../types/recall.js'

export const Route = createFileRoute('/review/session')({
  component: ReviewSessionPage,
  validateSearch: (search: Record<string, unknown>) => ({
    topicId: (search.topicId as string) || undefined,
  }),
})

// ============================================================================
// Progress Bar
// ============================================================================

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {current} of {total}
      </span>
    </div>
  )
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
    </div>
  )
}

// ============================================================================
// Empty State (no due cards)
// ============================================================================

function EmptyReviewState() {
  return (
    <div className="text-center py-20">
      <CheckCircleIcon className="size-12 text-green-500/60 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-foreground mb-2">All caught up!</h2>
      <p className="text-sm text-muted-foreground mb-6">
        No cards are due for review right now. Check back later or add more concepts.
      </p>
      <a href="/recall/" className="no-underline">
        <Button variant="outline">
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Dashboard
        </Button>
      </a>
    </div>
  )
}

// ============================================================================
// Error State
// ============================================================================

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="text-center py-20">
      <WarningCircleIcon className="size-12 text-destructive/60 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
      <p className="text-sm text-destructive mb-6 max-w-md mx-auto">{error}</p>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" onClick={onRetry}>
          Try Again
        </Button>
        <a href="/recall/" className="no-underline">
          <Button variant="ghost">Back to Dashboard</Button>
        </a>
      </div>
    </div>
  )
}

// ============================================================================
// Session Summary
// ============================================================================

const RATING_SUMMARY_COLORS: Record<FsrsRating, string> = {
  1: 'text-red-600 dark:text-red-400',
  2: 'text-orange-600 dark:text-orange-400',
  3: 'text-green-600 dark:text-green-400',
  4: 'text-blue-600 dark:text-blue-400',
}

function SessionSummary({
  ratings,
}: {
  ratings: { rating: FsrsRating; conceptTitle: string }[]
}) {
  const ratingCounts: Record<FsrsRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const r of ratings) {
    ratingCounts[r.rating]++
  }

  return (
    <div className="text-center py-12">
      <CheckCircleIcon className="size-12 text-green-500 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-foreground mb-2">Session Complete</h2>
      <p className="text-sm text-muted-foreground mb-8">
        You reviewed {ratings.length} {ratings.length === 1 ? 'card' : 'cards'}
      </p>

      {/* Rating distribution */}
      <div className="flex items-center justify-center gap-6 mb-8">
        {([1, 2, 3, 4] as FsrsRating[]).map((rating) =>
          ratingCounts[rating] > 0 ? (
            <div key={rating} className="text-center">
              <p className={`text-2xl font-bold ${RATING_SUMMARY_COLORS[rating]}`}>
                {ratingCounts[rating]}
              </p>
              <p className="text-xs text-muted-foreground">{FSRS_RATING_LABELS[rating]}</p>
            </div>
          ) : null,
        )}
      </div>

      {/* Card-by-card breakdown */}
      <div className="max-w-sm mx-auto text-left space-y-1.5 mb-8">
        {ratings.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground truncate mr-3">{r.conceptTitle}</span>
            <span className={`text-xs font-medium shrink-0 ${RATING_SUMMARY_COLORS[r.rating]}`}>
              {FSRS_RATING_LABELS[r.rating]}
            </span>
          </div>
        ))}
      </div>

      <a href="/recall/" className="no-underline">
        <Button>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Dashboard
        </Button>
      </a>
    </div>
  )
}

// ============================================================================
// Page Component
// ============================================================================

function ReviewSessionPage() {
  const { topicId } = Route.useSearch()
  const session = useReviewSession(topicId)

  useEffect(() => {
    session.startSession()
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isTransitioning = session.phase === 'loading'

  return (
    <div className="relative min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <a
            href="/recall/"
            className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
            title="Back to Dashboard"
          >
            <ArrowLeftIcon className="size-4" />
          </a>
          <div className="flex items-center gap-2">
            <LightningIcon className="size-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Review Session</h1>
          </div>
        </div>

        {/* Progress */}
        {session.progress.total > 0 && session.phase !== 'complete' && (
          <div className="mb-8">
            <ProgressBar current={session.progress.current} total={session.progress.total} />
          </div>
        )}

        {/* Phase routing */}
        {session.phase === 'loading' && !session.question && <LoadingState />}

        {session.phase === 'empty' && <EmptyReviewState />}

        {session.phase === 'error' && (
          <ErrorState error={session.error ?? 'Unknown error'} onRetry={session.retryError} />
        )}

        {session.phase === 'complete' && (
          <SessionSummary ratings={session.ratings} />
        )}

        {/* Active review: question + answer or feedback */}
        {session.currentConcept && session.question && session.phase !== 'complete' && session.phase !== 'error' && session.phase !== 'empty' && (
          <div className="space-y-6">
            <ReviewQuestion concept={session.currentConcept} question={session.question} />

            {(session.phase === 'answer' || (session.phase === 'loading' && session.question && !session.evaluation)) && (
              <ReviewAnswer
                onSubmit={session.submitAnswer}
                isSubmitting={isTransitioning}
              />
            )}

            {session.phase === 'feedback' && session.evaluation && (
              <div className="space-y-6">
                {/* Show user's answer */}
                <div className="rounded-lg bg-muted/30 border border-muted px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Your answer</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{session.userAnswer}</p>
                </div>

                <ReviewFeedback
                  feedback={session.evaluation.feedback}
                  suggestedRating={session.evaluation.suggestedRating}
                />

                <RatingButtons
                  onRate={session.rateCard}
                  intervals={session.intervals}
                  suggestedRating={session.evaluation.suggestedRating}
                  disabled={isTransitioning}
                />
              </div>
            )}

            {/* Loading overlay for transitions (rating → next card) */}
            {session.phase === 'loading' && session.evaluation && (
              <div className="flex items-center justify-center py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TreeStructureIcon className="size-4 animate-spin" />
                  Loading next card...
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
