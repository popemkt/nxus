import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Brain,
  Lightning,
  SpinnerGap,
  PaperPlaneRight,
  ArrowRight,
  Check,
  Trophy,
} from '@phosphor-icons/react'
import { getDueCardsServerFn } from '@/services/review.server'
import { submitReviewServerFn, previewIntervalsServerFn } from '@/services/review.server'
import { generateQuestionServerFn, prefetchQuestionServerFn } from '@/services/generate-question.server'
import { evaluateAnswerServerFn } from '@/services/evaluate-answer.server'
import { getConceptsByTopicServerFn } from '@/services/concepts.server'
import type { RecallConcept } from '@nxus/db'
import type { GeneratedQuestion, AnswerEvaluation } from '@nxus/mastra'

type SessionPhase = 'loading' | 'question' | 'answering' | 'evaluating' | 'feedback' | 'complete'

export const Route = createFileRoute('/review/session')({
  component: ReviewSessionPage,
  validateSearch: (search: Record<string, unknown>) => ({
    topicId: (search['topicId'] as string) || undefined,
  }),
})

function ReviewSessionPage() {
  const { topicId } = Route.useSearch()
  const queryClient = useQueryClient()

  const [queue, setQueue] = useState<RecallConcept[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<SessionPhase>('loading')
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
  const prefetchedRef = useRef<Map<string, GeneratedQuestion>>(new Map())

  // Load due cards
  useQuery({
    queryKey: ['due-cards', topicId],
    queryFn: async () => {
      const result = await getDueCardsServerFn({
        data: { topicId, limit: 50 },
      })
      if (result.success && result.cards.length > 0) {
        setQueue(result.cards)
        setPhase('question')
        generateQuestionForConcept(result.cards[0]!)
        // Prefetch question for card #2
        if (result.cards[1]) {
          triggerPrefetch(result.cards[1], result.cards)
        }
      } else {
        setPhase('complete')
      }
      return result
    },
  })

  /** Get adjacent concepts for a concept */
  const getAdjacentConcepts = useCallback(
    async (concept: RecallConcept, allCards?: RecallConcept[]) => {
      if (!concept.topicId) return []
      // Use queue cards as adjacent if available to avoid extra server call
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

  /** Fire-and-forget prefetch for next concept */
  const triggerPrefetch = useCallback(
    async (concept: RecallConcept, allCards?: RecallConcept[]) => {
      if (prefetchedRef.current.has(concept.id)) return
      try {
        const adjacentConcepts = await getAdjacentConcepts(concept, allCards)
        // This generates + caches to DB on the server side
        prefetchQuestionServerFn({
          data: {
            conceptId: concept.id,
            conceptTitle: concept.title,
            conceptSummary: concept.summary,
            bloomsLevel: concept.bloomsLevel,
            currentBloomsLevel: concept.card?.currentBloomsLevel ?? null,
            adjacentConcepts,
          },
        }).catch(() => {}) // non-critical
      } catch {
        // non-critical
      }
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

      try {
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
          setQuestion(result.question as GeneratedQuestion)
          setPhase('answering')

          // Preview intervals (fire-and-forget, non-blocking)
          previewIntervalsServerFn({
            data: { conceptId: concept.id },
          }).then((r) => {
            if (r.success) setIntervals(r.intervals)
          }).catch(() => {})
        }
      } catch {
        // Fallback: show concept as question
        setQuestion({
          questionText: `Explain the concept "${concept.title}" and why it matters.`,
          questionType: 'free-response',
          modelAnswer: concept.summary,
          hints: [],
        })
        setPhase('answering')
      }
    },
    [getAdjacentConcepts],
  )

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      if (!question) return null
      const currentConcept = queue[currentIndex]
      if (!currentConcept) return null
      const answer = userAnswerRef.current

      // Deterministic question types: evaluate client-side instantly
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
          conceptTitle: currentConcept.title,
          questionType: question.questionType,
        },
      })
      if (result.success) {
        return result.evaluation
      }
      return null
    },
    onSuccess: (eval_) => {
      if (eval_) {
        setEvaluation(eval_)
        setPhase('feedback')
      }
    },
  })

  const submitRatingMutation = useMutation({
    mutationFn: async (rating: 1 | 2 | 3 | 4) => {
      const currentConcept = queue[currentIndex]
      if (!currentConcept || !question || !evaluation) return

      const result = await submitReviewServerFn({
        data: {
          conceptId: currentConcept.id,
          questionText: question.questionText,
          questionType: question.questionType,
          userAnswer: userAnswerRef.current,
          aiFeedback: evaluation.feedback,
          rating,
        },
      })
      return result
    },
    onSuccess: () => {
      setReviewedCount((c) => c + 1)
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })

      // Move to next card
      const nextIndex = currentIndex + 1
      if (nextIndex < queue.length) {
        setCurrentIndex(nextIndex)
        generateQuestionForConcept(queue[nextIndex]!)
        // Prefetch for card after next
        if (queue[nextIndex + 1]) {
          triggerPrefetch(queue[nextIndex + 1]!)
        }
      } else {
        setPhase('complete')
      }
    },
  })

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        // Only handle Enter in inputs to submit
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

  const currentConcept = queue[currentIndex]

  const ratingLabels: Record<1 | 2 | 3 | 4, { label: string; color: string }> = {
    1: { label: 'Again', color: 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20' },
    2: { label: 'Hard', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20' },
    3: { label: 'Good', color: 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20' },
    4: { label: 'Easy', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20' },
  }

  function formatInterval(days: number): string {
    if (days === 0) return '<1d'
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.round(days / 30)}mo`
    return `${(days / 365).toFixed(1)}y`
  }

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
              {currentIndex + 1} / {queue.length} · {reviewedCount} reviewed
            </span>
          ) : null}
        </div>
        {/* Progress bar */}
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
                onChange={(v) => {
                  setUserAnswer(v)
                  // Auto-submit for deterministic question types (MC, T/F)
                  const isAutoSubmit =
                    question.questionType === 'multiple-choice' ||
                    question.questionType === 'true-false'
                  if (isAutoSubmit && v.trim()) {
                    setTimeout(() => evaluateMutation.mutate(), 150)
                  }
                }}
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
                  onClick={() => evaluateMutation.mutate()}
                  disabled={!userAnswer.trim() || evaluateMutation.isPending}
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
            <div className="mb-2 text-xs text-muted-foreground uppercase tracking-wider">
              {currentConcept?.topicName} · {currentConcept?.title}
            </div>

            {/* Question recap */}
            <div className="mb-4 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">{question.questionText}</p>
            </div>

            {/* Score */}
            <div className="mb-6 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    evaluation.score >= 80
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : evaluation.score >= 50
                        ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {evaluation.score}/100
                </div>
                <span className="text-sm text-muted-foreground">
                  Suggested: {evaluation.rating}
                </span>
              </div>
            </div>

            {/* Feedback */}
            <div className="mb-6 rounded-xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm">{evaluation.feedback}</p>

              {evaluation.strongPoints.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-success uppercase tracking-wider">
                    Strong Points
                  </p>
                  <ul className="space-y-1">
                    {evaluation.strongPoints.map((point: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check size={14} className="mt-0.5 text-success flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {evaluation.keyInsightsMissed.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-warning uppercase tracking-wider">
                    Key Insights Missed
                  </p>
                  <ul className="space-y-1">
                    {evaluation.keyInsightsMissed.map((point: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <ArrowRight size={14} className="mt-0.5 text-warning flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Model answer */}
              <div className="border-t border-border pt-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Model Answer
                </p>
                <p className="text-sm text-muted-foreground">
                  {question.modelAnswer}
                </p>
              </div>
            </div>

            {/* Rating buttons */}
            <div>
              <p className="mb-3 text-sm font-medium flex items-center gap-2">
                How well did you know this?
                <span className="text-[10px] text-muted-foreground">
                  Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">1</kbd>-<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">4</kbd>
                </span>
              </p>
              <div className="grid grid-cols-4 gap-3">
                {([1, 2, 3, 4] as const).map((rating) => {
                  const info = ratingLabels[rating]
                  const interval = intervals?.[rating]
                  return (
                    <button
                      key={rating}
                      onClick={() => submitRatingMutation.mutate(rating)}
                      disabled={submitRatingMutation.isPending}
                      className={`rounded-xl border border-border p-4 text-center transition-all ${info.color} disabled:opacity-50`}
                    >
                      <div className="text-sm font-semibold">{info.label}</div>
                      <div className="mt-0.5 text-[10px] opacity-50">{rating}</div>
                      {interval !== undefined ? (
                        <div className="mt-1 text-[10px] opacity-70">
                          {formatInterval(interval)}
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Complete */}
        {phase === 'complete' ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Trophy
              size={48}
              weight="duotone"
              className="mb-4 text-primary"
            />
            <h2 className="mb-2 text-xl font-semibold">
              {reviewedCount > 0
                ? 'Session Complete!'
                : 'No cards due for review'}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {reviewedCount > 0
                ? `You reviewed ${reviewedCount} card${reviewedCount !== 1 ? 's' : ''}. Great work!`
                : 'All caught up! Check back later or explore new topics.'}
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

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: GeneratedQuestion
  value: string
  onChange: (v: string) => void
}) {
  switch (question.questionType) {
    case 'multiple-choice':
      return (
        <div className="space-y-2">
          {question.choices.map((choice: string, i: number) => (
            <button
              key={i}
              onClick={() => onChange(String(i))}
              className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                value === String(i)
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              <span className="mr-2 font-medium">{String.fromCharCode(65 + i)}.</span>
              {choice}
            </button>
          ))}
        </div>
      )

    case 'true-false':
      return (
        <div className="flex gap-3">
          {(['true', 'false'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`flex-1 rounded-lg border p-4 text-center text-sm font-medium transition-colors ${
                value === opt
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              {opt === 'true' ? 'True' : 'False'}
            </button>
          ))}
        </div>
      )

    case 'fill-blank':
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Fill in the blank..."
          className="w-full rounded-lg border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          autoFocus
        />
      )

    case 'free-response':
    default:
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer..."
          rows={6}
          className="w-full rounded-lg border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          autoFocus
        />
      )
  }
}

function HintButton({ hints }: { hints: string[] }) {
  const [revealedCount, setRevealedCount] = useState(0)

  return (
    <div>
      {revealedCount > 0 ? (
        <div className="mb-2 space-y-1">
          {hints.slice(0, revealedCount).map((hint, i) => (
            <p key={i} className="text-xs text-muted-foreground italic">
              Hint {i + 1}: {hint}
            </p>
          ))}
        </div>
      ) : null}
      {revealedCount < hints.length ? (
        <button
          onClick={() => setRevealedCount((c) => c + 1)}
          className="text-xs text-primary hover:underline"
        >
          Show hint ({revealedCount + 1}/{hints.length})
        </button>
      ) : null}
    </div>
  )
}
