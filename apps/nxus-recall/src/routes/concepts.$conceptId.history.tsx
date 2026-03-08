import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ClockCounterClockwise,
} from '@phosphor-icons/react'
import { getConceptByIdServerFn, getReviewLogsServerFn } from '@/services/concepts.server'
import { formatRelativeDate, formatElapsed } from '@/lib/format'
import type { ReviewLog } from '@nxus/db'

export const Route = createFileRoute('/concepts/$conceptId/history')({
  component: ConceptHistoryPage,
})

function ConceptHistoryPage() {
  const { conceptId } = Route.useParams()

  const conceptQuery = useQuery({
    queryKey: ['recall-concept', conceptId],
    queryFn: () => getConceptByIdServerFn({ data: { conceptId } }),
  })

  const logsQuery = useQuery({
    queryKey: ['recall-review-logs', conceptId],
    queryFn: () => getReviewLogsServerFn({ data: { conceptId } }),
  })

  const concept = conceptQuery.data?.success ? conceptQuery.data.concept : null
  const logs: ReviewLog[] = logsQuery.data?.success ? logsQuery.data.logs : []

  const ratingStyles: Record<string, { label: string; color: string }> = {
    '1': { label: 'Again', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    '2': { label: 'Hard', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
    '3': { label: 'Good', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
    '4': { label: 'Easy', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          {concept?.topicId ? (
            <Link
              to="/topics/$topicId"
              params={{ topicId: concept.topicId }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
              Back to Topic
            </Link>
          ) : (
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
              Back
            </Link>
          )}
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={20} weight="duotone" className="text-primary" />
            <h1 className="text-lg font-semibold">Review History</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Concept Info */}
        {concept ? (
          <div className="mb-8 rounded-xl border border-border bg-card p-5">
            <h2 className="mb-1 text-lg font-semibold">{concept.title}</h2>
            <p className="text-sm text-muted-foreground">{concept.summary}</p>
          </div>
        ) : null}

        {/* Timeline */}
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <ClockCounterClockwise
              size={48}
              weight="duotone"
              className="mb-4 text-muted-foreground"
            />
            <p className="mb-2 text-lg font-medium">No review history</p>
            <p className="text-sm text-muted-foreground">
              This concept has not been reviewed yet
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {logs.length} review{logs.length !== 1 ? 's' : ''}
            </h3>
            <div className="relative space-y-0">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              {logs.map((log) => {
                const ratingInfo = ratingStyles[String(log.rating)] ?? {
                  label: `Rating ${log.rating}`,
                  color: 'bg-muted text-muted-foreground',
                }

                return (
                  <div key={log.id} className="relative flex gap-4 pb-6">
                    {/* Timeline dot */}
                    <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 rounded-xl border border-border bg-card p-4">
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeDate(new Date(log.reviewedAt))}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ratingInfo.color}`}
                        >
                          {ratingInfo.label}
                        </span>
                        {log.reviewScore !== undefined && log.reviewScore !== null ? (
                          <span className="text-[10px] text-muted-foreground">
                            Score: {log.reviewScore}/100
                          </span>
                        ) : null}
                        {log.timeSpentMs !== undefined && log.timeSpentMs !== null ? (
                          <span className="text-[10px] text-muted-foreground">
                            Time: {formatElapsed(log.timeSpentMs)}
                          </span>
                        ) : null}
                      </div>
                      {log.questionText ? (
                        <p className="text-sm text-muted-foreground">
                          {log.questionText.length > 100
                            ? `${log.questionText.slice(0, 100)}...`
                            : log.questionText}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
