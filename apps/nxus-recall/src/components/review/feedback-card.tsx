import { Check, ArrowRight } from '@phosphor-icons/react'
import type { GeneratedQuestion, AnswerEvaluation } from '@nxus/mastra'

interface FeedbackCardProps {
  question: GeneratedQuestion
  evaluation: AnswerEvaluation
  conceptMeta?: { topicName: string; title: string }
  children?: React.ReactNode
}

export function FeedbackCard({ question, evaluation, conceptMeta, children }: FeedbackCardProps) {
  return (
    <div>
      {conceptMeta ? (
        <div className="mb-2 text-xs text-muted-foreground uppercase tracking-wider">
          {conceptMeta.topicName} · {conceptMeta.title}
        </div>
      ) : null}

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

      {children}
    </div>
  )
}
