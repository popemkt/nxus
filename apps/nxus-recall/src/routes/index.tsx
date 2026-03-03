import { createFileRoute } from '@tanstack/react-router'
import { HouseIcon, ClockCountdownIcon, LightningIcon } from '@phosphor-icons/react'
import { Button, Skeleton } from '@nxus/ui'
import { useTopics } from '../hooks/use-topics.js'
import { useDueCards } from '../hooks/use-due-cards.js'
import { TopicCard } from '../components/topic-card.js'
import { EmptyState } from '../components/empty-state.js'

export const Route = createFileRoute('/')({
  component: RecallDashboard,
})

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  )
}

function RecallDashboard() {
  const { topics, isLoading: topicsLoading, error: topicsError } = useTopics()
  const { count: globalDueCount, isLoading: dueLoading, error: dueError } = useDueCards()
  const error = topicsError || dueError

  const isLoading = topicsLoading || dueLoading
  const hasTopics = topics.length > 0

  return (
    <div className="relative min-h-screen bg-background">
      {/* Home button - navigates to gateway */}
      <a
        href="/"
        className="fixed top-4 left-4 z-50 flex size-9 items-center justify-center rounded-full bg-background/85 backdrop-blur-xl border border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-background transition-colors shadow-sm no-underline"
        title="Home"
      >
        <HouseIcon className="size-4" />
      </a>

      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recall</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Spaced repetition learning
            </p>
          </div>

          {hasTopics && (
            <div className="flex items-center gap-2">
              {globalDueCount > 0 && (
                <a href="/recall/review/session" className="no-underline">
                  <Button>
                    <LightningIcon data-icon="inline-start" />
                    Review ({globalDueCount})
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Due cards summary */}
        {hasTopics && globalDueCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 mb-8">
            <ClockCountdownIcon className="size-4 text-primary shrink-0" />
            <span className="text-sm text-foreground">
              <strong>{globalDueCount}</strong>{' '}
              {globalDueCount === 1 ? 'card is' : 'cards are'} due for review
            </span>
          </div>
        )}

        {/* Content */}
        {error && !isLoading ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-8 text-center">
            <p className="text-sm text-destructive mb-4">{error.message}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <DashboardSkeleton />
        ) : hasTopics ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
