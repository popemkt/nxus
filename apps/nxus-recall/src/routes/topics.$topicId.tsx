import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Brain,
  Lightning,
  Trash,
  BookOpen,
} from '@phosphor-icons/react'
import { getTopicByIdServerFn } from '@/services/topics.server'
import { getConceptsByTopicServerFn, deleteConceptServerFn } from '@/services/concepts.server'
import { getDueCardsServerFn } from '@/services/review.server'

export const Route = createFileRoute('/topics/$topicId')({
  component: TopicDetailPage,
})

function TopicDetailPage() {
  const { topicId } = Route.useParams()
  const queryClient = useQueryClient()

  const topicQuery = useQuery({
    queryKey: ['recall-topic', topicId],
    queryFn: () => getTopicByIdServerFn({ data: { topicId } }),
  })

  const conceptsQuery = useQuery({
    queryKey: ['recall-concepts', topicId],
    queryFn: () => getConceptsByTopicServerFn({ data: { topicId } }),
  })

  const deleteConceptMutation = useMutation({
    mutationFn: (conceptId: string) =>
      deleteConceptServerFn({ data: { conceptId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['recall-concepts', topicId],
      })
      queryClient.invalidateQueries({ queryKey: ['recall-topic', topicId] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
    },
  })

  const topic = topicQuery.data?.success ? topicQuery.data.topic : null
  const concepts = conceptsQuery.data?.success
    ? conceptsQuery.data.concepts
    : []

  const bloomsColors: Record<string, string> = {
    remember: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    understand: 'bg-green-500/10 text-green-600 dark:text-green-400',
    apply: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    analyze: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    evaluate: 'bg-red-500/10 text-red-600 dark:text-red-400',
    create: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  }

  const cardStateLabels: Record<number, string> = {
    0: 'New',
    1: 'Learning',
    2: 'Review',
    3: 'Relearning',
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{topic?.name ?? '...'}</h1>
            {topic?.description ? (
              <p className="text-sm text-muted-foreground">
                {topic.description}
              </p>
            ) : null}
          </div>
          {topic && topic.dueCount > 0 ? (
            <Link
              to="/review/session"
              search={{ topicId }}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Lightning size={16} weight="fill" />
              Review {topic.dueCount} Due
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {concepts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <BookOpen
              size={48}
              weight="duotone"
              className="mb-4 text-muted-foreground"
            />
            <p className="mb-2 text-lg font-medium">No concepts yet</p>
            <p className="text-sm text-muted-foreground">
              Generate concepts from the Explore page
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {concepts.map((concept) => (
              <div
                key={concept.id}
                id={`concept-${concept.id}`}
                className="rounded-xl border border-border bg-card p-5 scroll-mt-24"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-medium">{concept.title}</h3>
                      {concept.bloomsLevel ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            bloomsColors[concept.bloomsLevel] ??
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {concept.bloomsLevel}
                        </span>
                      ) : null}
                      {concept.card ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {cardStateLabels[concept.card.state] ?? 'Unknown'} ·{' '}
                          {concept.card.reps} reps
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {concept.summary}
                    </p>
                    {concept.whyItMatters ? (
                      <p className="mt-2 text-xs text-muted-foreground italic">
                        Why it matters: {concept.whyItMatters}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {concept.card &&
                    new Date(concept.card.due) <= new Date() ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        <Lightning size={12} weight="fill" />
                        Due
                      </span>
                    ) : null}
                    <button
                      onClick={() => deleteConceptMutation.mutate(concept.id)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete concept"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>

                {concept.relatedConceptIds.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {concept.relatedConceptIds.map((relatedId, i) => {
                      const title = concept.relatedConceptTitles[i] ?? relatedId
                      return (
                        <button
                          key={relatedId}
                          onClick={() => {
                            document.getElementById(`concept-${relatedId}`)?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'center',
                            })
                          }}
                          className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                        >
                          {title}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
