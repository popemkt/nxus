import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Brain,
  SpinnerGap,
  PaperPlaneRight,
  Trophy,
  Barbell,
} from '@phosphor-icons/react'
import { getAllCardsByTopicServerFn } from '@/services/review.server'
import { getTopicByIdServerFn } from '@/services/topics.server'
import { useReviewEngine } from '@/hooks/use-review-engine'
import { QuestionInput } from '@/components/review/question-input'
import { HintButton } from '@/components/review/hint-button'
import { RatingButtons } from '@/components/review/rating-buttons'
import { FeedbackCard } from '@/components/review/feedback-card'

export const Route = createFileRoute('/review/cram')({
  component: CramSessionPage,
  validateSearch: z.object({
    topicId: z.string().default(''),
    reschedule: z.boolean().default(true),
  }),
})

function CramSessionPage() {
  const { topicId, reschedule } = Route.useSearch()

  const engine = useReviewEngine({
    getExtraSubmitData: () => ({ reschedule }),
  })

  const topicQuery = useQuery({
    queryKey: ['recall-topic', topicId],
    queryFn: () => getTopicByIdServerFn({ data: { topicId } }),
    enabled: !!topicId,
  })

  const topicName = topicQuery.data?.success ? topicQuery.data.topic.name : '...'

  useQuery({
    queryKey: ['cram-cards', topicId],
    queryFn: async () => {
      const result = await getAllCardsByTopicServerFn({
        data: { topicId },
      })
      if (result.success) {
        engine.initSession(result.cards)
      } else {
        engine.initSession([])
      }
      return result
    },
    enabled: !!topicId,
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
              <Barbell size={20} weight="duotone" className="text-orange-500" />
              Cram Mode
              <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Cram
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">{topicName}</p>
          </div>
          {queue.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {queue.length} · {reviewedCount} reviewed
            </span>
          ) : null}
        </div>
        {!reschedule ? (
          <div className="border-t border-orange-500/20 bg-orange-500/5 px-6 py-2">
            <p className="mx-auto max-w-3xl text-xs text-orange-600 dark:text-orange-400">
              Practice mode - not affecting SRS schedule
            </p>
          </div>
        ) : null}
        {queue.length > 0 ? (
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
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
            <SpinnerGap size={32} className="animate-spin text-orange-500 mb-4" />
            <p className="text-muted-foreground">Loading all cards for cram...</p>
          </div>
        ) : null}

        {/* Generating question */}
        {phase === 'question' ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Brain size={32} weight="duotone" className="text-orange-500 mb-4 animate-pulse" />
            <p className="text-muted-foreground">Generating question for: {currentConcept?.title}</p>
          </div>
        ) : null}

        {/* Answering */}
        {phase === 'answering' && question && currentConcept ? (
          <div>
            <div className="mb-2 text-xs text-muted-foreground uppercase tracking-wider">
              {currentConcept.topicName} · {currentConcept.title}
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
              {question.hints.length > 0 ? (
                <HintButton hints={question.hints} />
              ) : (
                <div />
              )}
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
            />

            <RatingButtons
              intervals={intervals}
              onRate={(rating) => engine.submitRatingMutation.mutate(rating)}
              disabled={engine.submitRatingMutation.isPending}
            />
          </div>
        ) : null}

        {/* Complete */}
        {phase === 'complete' ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Trophy
              size={48}
              weight="duotone"
              className="mb-4 text-orange-500"
            />
            <h2 className="mb-2 text-xl font-semibold">
              {reviewedCount > 0
                ? 'Cram Session Complete!'
                : 'No cards in this topic'}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {reviewedCount > 0
                ? `You crammed ${reviewedCount} card${reviewedCount !== 1 ? 's' : ''}. Great work!`
                : 'Add some concepts first, then come back to cram.'}
            </p>
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/topics/$topicId"
                params={{ topicId }}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Back to Topic
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
