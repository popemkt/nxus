import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Brain,
  Lightning,
  Books,
  ArrowRight,
  Plus,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { getTopicsServerFn } from '@/services/topics.server'
import { getRecallStatsServerFn } from '@/services/review.server'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['recall-stats'],
    queryFn: () => getRecallStatsServerFn(),
  })

  const topicsQuery = useQuery({
    queryKey: ['recall-topics'],
    queryFn: () => getTopicsServerFn(),
  })

  const stats = statsQuery.data?.stats
  const topics = topicsQuery.data?.topics ?? []

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Brain size={28} weight="duotone" className="text-primary" />
            <h1 className="text-xl font-semibold">nXus Recall</h1>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/explore"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <MagnifyingGlass size={16} />
              Explore
            </Link>
            <Link
              to="/review/session"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Lightning size={16} weight="fill" />
              Review
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Topics"
            value={stats?.totalTopics ?? 0}
            icon={<Books size={20} weight="duotone" />}
          />
          <StatCard
            label="Concepts"
            value={stats?.totalConcepts ?? 0}
            icon={<Brain size={20} weight="duotone" />}
          />
          <StatCard
            label="Due Now"
            value={stats?.dueNow ?? 0}
            icon={<Lightning size={20} weight="duotone" />}
            highlight={!!stats?.dueNow && stats.dueNow > 0}
          />
          <StatCard
            label="Reviewed Today"
            value={stats?.reviewedToday ?? 0}
            icon={<ArrowRight size={20} weight="duotone" />}
          />
        </div>

        {/* Due Cards CTA */}
        {stats?.dueNow && stats.dueNow > 0 ? (
          <Link
            to="/review/session"
            className="mb-8 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-6 transition-colors hover:bg-primary/10"
          >
            <div>
              <h2 className="text-lg font-semibold">
                {stats.dueNow} card{stats.dueNow !== 1 ? 's' : ''} due for
                review
              </h2>
              <p className="text-sm text-muted-foreground">
                Start a review session to keep your knowledge fresh
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Lightning size={16} weight="fill" />
              Start Review
            </div>
          </Link>
        ) : null}

        {/* Topics Grid */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Topics</h2>
          <Link
            to="/explore"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={14} />
            Add Topic
          </Link>
        </div>

        {topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <Books
              size={48}
              weight="duotone"
              className="mb-4 text-muted-foreground"
            />
            <p className="mb-2 text-lg font-medium">No topics yet</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Explore a topic to generate learning concepts
            </p>
            <Link
              to="/explore"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <MagnifyingGlass size={16} />
              Explore Topics
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <Link
                key={topic.id}
                to="/topics/$topicId"
                params={{ topicId: topic.id }}
                className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md"
              >
                <h3 className="mb-1 font-medium group-hover:text-primary transition-colors">
                  {topic.name}
                </h3>
                {topic.description ? (
                  <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                    {topic.description}
                  </p>
                ) : null}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{topic.conceptCount} concepts</span>
                  {topic.dueCount > 0 ? (
                    <span className="flex items-center gap-1 text-primary font-medium">
                      <Lightning size={12} weight="fill" />
                      {topic.dueCount} due
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: number
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div
        className={`text-2xl font-semibold ${highlight ? 'text-primary' : ''}`}
      >
        {value}
      </div>
    </div>
  )
}
