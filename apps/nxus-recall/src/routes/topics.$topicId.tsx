import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ArrowLeftIcon,
  BooksIcon,
  ClockCountdownIcon,
  LightningIcon,
  PlusIcon,
  SparkleIcon,
} from '@phosphor-icons/react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
} from '@nxus/ui'
import { useConcepts } from '../hooks/use-concepts.js'
import { useDueCards } from '../hooks/use-due-cards.js'
import { getTopicServerFn } from '../server/recall.server.js'
import { BloomsBadge } from '../components/blooms-badge.js'
import { CreateConceptModal } from '../components/create-concept-modal.js'
import {
  FSRS_STATE_LABELS,
  type FsrsState,
  type RecallConcept,
  type RecallTopic,
} from '../types/recall.js'
import { formatDistanceToNow } from 'date-fns'

export const Route = createFileRoute('/topics/$topicId')({
  component: TopicDetailPage,
  loader: async ({ params }) => {
    const result = await getTopicServerFn({ data: { topicId: params.topicId } })
    if (!result.success) throw new Error(result.error)
    return result.data
  },
})

// ============================================================================
// Helpers
// ============================================================================

const STATE_COLORS: Record<FsrsState, string> = {
  0: 'bg-muted text-muted-foreground',
  1: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  2: 'bg-green-500/15 text-green-600 dark:text-green-400',
  3: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
}

function StateBadge({ state }: { state: FsrsState }) {
  return (
    <Badge variant="outline" className={`border-transparent ${STATE_COLORS[state]}`}>
      {FSRS_STATE_LABELS[state]}
    </Badge>
  )
}

function formatDue(dueStr: string): string {
  const due = new Date(dueStr)
  const now = new Date()
  if (due <= now) return 'Due now'
  return formatDistanceToNow(due, { addSuffix: true })
}

// ============================================================================
// Mastery Stats
// ============================================================================

function MasteryStats({ concepts }: { concepts: RecallConcept[] }) {
  const counts: Record<FsrsState, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const c of concepts) {
    counts[c.card.state]++
  }

  const stats = [
    { state: 0 as FsrsState, label: 'New', count: counts[0] },
    { state: 1 as FsrsState, label: 'Learning', count: counts[1] },
    { state: 2 as FsrsState, label: 'Review', count: counts[2] },
    { state: 3 as FsrsState, label: 'Relearning', count: counts[3] },
  ].filter((s) => s.count > 0)

  if (stats.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stats.map((s) => (
        <Badge
          key={s.state}
          variant="outline"
          className={`border-transparent gap-1 ${STATE_COLORS[s.state]}`}
        >
          {s.label}: {s.count}
        </Badge>
      ))}
    </div>
  )
}

// ============================================================================
// Concept Row
// ============================================================================

function ConceptRow({ concept }: { concept: RecallConcept }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium text-foreground">{concept.title}</span>
              <BloomsBadge level={concept.bloomsLevel} />
              <StateBadge state={concept.card.state} />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{concept.summary}</p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {formatDue(concept.card.due)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function TopicDetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  )
}

// ============================================================================
// Page Component
// ============================================================================

function TopicDetailPage() {
  const topic = Route.useLoaderData() as RecallTopic
  const { concepts, isLoading } = useConcepts(topic.id)
  const { count: dueCount } = useDueCards(topic.id)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="relative min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <a
            href="/recall/"
            className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
            title="Back to Dashboard"
          >
            <ArrowLeftIcon className="size-4" />
          </a>
          <h1 className="text-2xl font-bold text-foreground">{topic.name}</h1>
        </div>

        {/* Aggregate stats */}
        <div className="flex items-center gap-4 mb-6 ml-11">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BooksIcon className="size-3.5" />
            {topic.conceptCount} {topic.conceptCount === 1 ? 'concept' : 'concepts'}
          </span>
          {dueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ClockCountdownIcon className="size-2.5" data-icon="inline-start" />
              {dueCount} due
            </Badge>
          )}
        </div>

        {/* Mastery distribution */}
        {!isLoading && concepts.length > 0 && (
          <div className="mb-6 ml-11">
            <MasteryStats concepts={concepts} />
          </div>
        )}

        {/* Actions bar */}
        <div className="flex items-center gap-2 mb-6">
          {dueCount > 0 && (
            <a href={`/recall/review/session?topicId=${topic.id}`} className="no-underline">
              <Button>
                <LightningIcon data-icon="inline-start" />
                Start Review ({dueCount})
              </Button>
            </a>
          )}
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add Concept
          </Button>
          <a
            href={`/recall/explore?topic=${encodeURIComponent(topic.name)}`}
            className="no-underline"
          >
            <Button variant="outline">
              <SparkleIcon data-icon="inline-start" />
              Generate More
            </Button>
          </a>
        </div>

        {/* Concept list */}
        {isLoading ? (
          <TopicDetailSkeleton />
        ) : concepts.length > 0 ? (
          <div className="space-y-3">
            {concepts.map((concept) => (
              <ConceptRow key={concept.id} concept={concept} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <BooksIcon className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No concepts yet. Add one manually or generate with AI.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => setModalOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                Add Concept
              </Button>
              <a
                href={`/recall/explore?topic=${encodeURIComponent(topic.name)}`}
                className="no-underline"
              >
                <Button>
                  <SparkleIcon data-icon="inline-start" />
                  Generate with AI
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Create concept modal */}
      <CreateConceptModal
        topicId={topic.id}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  )
}
