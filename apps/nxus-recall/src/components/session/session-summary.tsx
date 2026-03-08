import { Trophy } from '@phosphor-icons/react'
import { formatElapsed } from '@/lib/format'

interface SessionSummaryCardProps {
  reviewedCount: number
  ratingDistribution: Record<1 | 2 | 3 | 4, number>
  timeSpentMs: number
  stateBreakdown: {
    newCount: number
    learningCount: number
    reviewCount: number
  }
}

const ratingMeta: Record<1 | 2 | 3 | 4, { label: string; color: string }> = {
  1: { label: 'Again', color: 'bg-red-500' },
  2: { label: 'Hard', color: 'bg-orange-500' },
  3: { label: 'Good', color: 'bg-green-500' },
  4: { label: 'Easy', color: 'bg-blue-500' },
}

export function SessionSummaryCard({
  reviewedCount,
  ratingDistribution,
  timeSpentMs,
  stateBreakdown,
}: SessionSummaryCardProps) {
  const accuracyCount = (ratingDistribution[3] ?? 0) + (ratingDistribution[4] ?? 0)
  const accuracyPct = reviewedCount > 0 ? Math.round((accuracyCount / reviewedCount) * 100) : 0

  return (
    <div className="flex flex-col items-center py-12">
      <Trophy size={48} weight="duotone" className="mb-4 text-primary" />
      <h2 className="mb-2 text-xl font-semibold">Session Complete!</h2>
      <p className="mb-8 text-sm text-muted-foreground">
        You reviewed {reviewedCount} card{reviewedCount !== 1 ? 's' : ''}. Great work!
      </p>

      <div className="w-full max-w-md space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold">{reviewedCount}</div>
            <div className="text-xs text-muted-foreground">Reviewed</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold">{accuracyPct}%</div>
            <div className="text-xs text-muted-foreground">Accuracy</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold">{formatElapsed(timeSpentMs)}</div>
            <div className="text-xs text-muted-foreground">Time Spent</div>
          </div>
        </div>

        {/* Rating distribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Rating Distribution
          </p>
          <div className="space-y-2">
            {([1, 2, 3, 4] as const).map((rating) => {
              const count = ratingDistribution[rating] ?? 0
              const pct = reviewedCount > 0 ? (count / reviewedCount) * 100 : 0
              const meta = ratingMeta[rating]
              return (
                <div key={rating} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-muted-foreground text-right">
                    {meta.label}
                  </span>
                  <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${meta.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-xs text-muted-foreground">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* State breakdown */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {stateBreakdown.newCount > 0 ? (
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
              {stateBreakdown.newCount} New
            </span>
          ) : null}
          {stateBreakdown.learningCount > 0 ? (
            <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600 dark:text-orange-400">
              {stateBreakdown.learningCount} Learning
            </span>
          ) : null}
          {stateBreakdown.reviewCount > 0 ? (
            <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600 dark:text-green-400">
              {stateBreakdown.reviewCount} Review
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
