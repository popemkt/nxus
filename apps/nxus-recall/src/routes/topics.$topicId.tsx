import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowLeft,
  ArrowsMerge,
  Barbell,
  Brain,
  ClockCounterClockwise,
  Lightning,
  PencilSimple,
  Trash,
  BookOpen,
  SpinnerGap,
  Plus,
  Warning,
} from '@phosphor-icons/react'
import { ConceptRowSkeleton } from '@/components/ui/skeleton'
import { getTopicByIdServerFn, getTopicsServerFn, mergeTopicsServerFn } from '@/services/topics.server'
import {
  getConceptsByTopicServerFn,
  deleteConceptServerFn,
  saveConceptsBatchServerFn,
  saveConceptServerFn,
  updateConceptServerFn,
} from '@/services/concepts.server'
import { generateConceptsServerFn } from '@/services/generate-concepts.server'
import type { GeneratedConcept } from '@nxus/mastra'
import type { RecallTopic, RecallConcept } from '@nxus/db'

export const Route = createFileRoute('/topics/$topicId')({
  component: TopicDetailPage,
})

function TopicDetailPage() {
  const { topicId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Task 2: Manual add form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addSummary, setAddSummary] = useState('')
  const [addWhyItMatters, setAddWhyItMatters] = useState('')
  const [addBloomsLevel, setAddBloomsLevel] = useState('')

  // Task 3: Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Task 4: Inline editing state
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editWhyItMatters, setEditWhyItMatters] = useState('')

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

  const generateMoreMutation = useMutation({
    mutationFn: async (topicName: string) => {
      const result = await generateConceptsServerFn({ data: { topic: topicName } })
      if (!result.success) throw new Error(result.error)

      const saveResult = await saveConceptsBatchServerFn({
        data: {
          topicId,
          concepts: result.concepts.map((c: GeneratedConcept) => ({
            title: c.title,
            summary: c.summary,
            whyItMatters: c.whyItMatters,
            bloomsLevel: c.bloomsLevel,
            relatedConceptTitles: c.relatedConceptTitles,
          })),
        },
      })
      if (!saveResult.success) throw new Error('Failed to save concepts')
      return saveResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recall-concepts', topicId] })
      queryClient.invalidateQueries({ queryKey: ['recall-topic', topicId] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
    },
  })

  // Task 2: Save concept mutation
  const saveConceptMutation = useMutation({
    mutationFn: async () => {
      const result = await saveConceptServerFn({
        data: {
          topicId,
          title: addTitle,
          summary: addSummary,
          whyItMatters: addWhyItMatters || undefined,
          bloomsLevel: addBloomsLevel || undefined,
        },
      })
      if (!result.success) throw new Error('Failed to save concept')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recall-concepts', topicId] })
      queryClient.invalidateQueries({ queryKey: ['recall-topic', topicId] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
      setAddTitle('')
      setAddSummary('')
      setAddWhyItMatters('')
      setAddBloomsLevel('')
      setShowAddForm(false)
    },
  })

  // Task 3: Topics query for merge modal
  const allTopicsQuery = useQuery({
    queryKey: ['recall-topics'],
    queryFn: () => getTopicsServerFn(),
    enabled: showMergeModal,
  })

  const mergeMutation = useMutation({
    mutationFn: async (targetTopicId: string) => {
      const result = await mergeTopicsServerFn({
        data: { sourceTopicId: topicId, targetTopicId },
      })
      if (!result.success) throw new Error('Failed to merge topics')
      return { targetTopicId }
    },
    onSuccess: ({ targetTopicId }) => {
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })
      queryClient.invalidateQueries({ queryKey: ['recall-concepts'] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
      setShowMergeModal(false)
      navigate({
        to: '/topics/$topicId',
        params: { topicId: targetTopicId },
      })
    },
  })

  // Task 4: Update concept mutation
  const updateConceptMutation = useMutation({
    mutationFn: async () => {
      if (!editingConceptId) throw new Error('No concept selected')
      const result = await updateConceptServerFn({
        data: {
          conceptId: editingConceptId,
          title: editTitle,
          summary: editSummary,
          whyItMatters: editWhyItMatters || undefined,
        },
      })
      if (!result.success) throw new Error('Failed to update concept')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recall-concepts', topicId] })
      setEditingConceptId(null)
    },
  })

  const topic = topicQuery.data?.success ? topicQuery.data.topic : null
  const concepts: RecallConcept[] = conceptsQuery.data?.success
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
          <div className="flex items-center gap-2">
            {topic ? (
              <>
                <button
                  onClick={() => generateMoreMutation.mutate(topic.name)}
                  disabled={generateMoreMutation.isPending}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {generateMoreMutation.isPending ? (
                    <>
                      <SpinnerGap size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} weight="bold" />
                      Generate More
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowAddForm((v) => !v)}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <PencilSimple size={16} />
                  Add Manually
                </button>
                <button
                  onClick={() => setShowMergeModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <ArrowsMerge size={16} />
                  Merge
                </button>
                <Link
                  to="/review/cram"
                  search={{ topicId, reschedule: true }}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <Barbell size={16} />
                  Cram
                </Link>
              </>
            ) : null}
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
        </div>
      </header>

      {/* Task 3: Merge Modal */}
      {showMergeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">Merge into another topic</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              All concepts from &quot;{topic?.name}&quot; will be moved to the selected topic. This topic will be deleted.
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {((allTopicsQuery.data?.topics ?? []) as RecallTopic[])
                .filter((t: RecallTopic) => t.id !== topicId)
                .map((t: RecallTopic) => (
                  <button
                    key={t.id}
                    onClick={() => mergeMutation.mutate(t.id)}
                    disabled={mergeMutation.isPending}
                    className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left text-sm hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <div>
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.conceptCount} concepts
                      </span>
                    </div>
                    <span className="text-xs text-primary">
                      Merge into {t.name}
                    </span>
                  </button>
                ))}
              {allTopicsQuery.isLoading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Loading topics...</p>
              ) : null}
              {allTopicsQuery.data?.topics &&
              (allTopicsQuery.data.topics as RecallTopic[]).filter((t: RecallTopic) => t.id !== topicId).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No other topics to merge into</p>
              ) : null}
            </div>
            <button
              onClick={() => setShowMergeModal(false)}
              className="mt-4 w-full rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Task 2: Manual Add Form */}
        {showAddForm ? (
          <div className="mb-6 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 font-medium">Add Concept Manually</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Title *</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Concept title"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Summary *</label>
                <textarea
                  value={addSummary}
                  onChange={(e) => setAddSummary(e.target.value)}
                  placeholder="Brief summary of the concept"
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Why It Matters</label>
                <input
                  type="text"
                  value={addWhyItMatters}
                  onChange={(e) => setAddWhyItMatters(e.target.value)}
                  placeholder="Why this concept is important (optional)"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Bloom&apos;s Level</label>
                <select
                  value={addBloomsLevel}
                  onChange={(e) => setAddBloomsLevel(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select level (optional)</option>
                  <option value="remember">Remember</option>
                  <option value="understand">Understand</option>
                  <option value="apply">Apply</option>
                  <option value="analyze">Analyze</option>
                  <option value="evaluate">Evaluate</option>
                  <option value="create">Create</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => saveConceptMutation.mutate()}
                  disabled={!addTitle.trim() || !addSummary.trim() || saveConceptMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveConceptMutation.isPending ? (
                    <SpinnerGap size={14} className="animate-spin" />
                  ) : null}
                  Save
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {generateMoreMutation.isError ? (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {generateMoreMutation.error?.message ?? 'Failed to generate concepts'}
          </div>
        ) : null}

        {conceptsQuery.isLoading ? (
          <div className="grid gap-4">
            <ConceptRowSkeleton />
            <ConceptRowSkeleton />
            <ConceptRowSkeleton />
            <ConceptRowSkeleton />
          </div>
        ) : concepts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <BookOpen
              size={48}
              weight="duotone"
              className="mb-4 text-muted-foreground"
            />
            <p className="mb-2 text-lg font-medium">No concepts yet</p>
            {topic ? (
              <button
                onClick={() => generateMoreMutation.mutate(topic.name)}
                disabled={generateMoreMutation.isPending}
                className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {generateMoreMutation.isPending ? (
                  <>
                    <SpinnerGap size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Brain size={16} weight="duotone" />
                    Generate Concepts
                  </>
                )}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Generate concepts from the Explore page
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {concepts.map((concept) => {
              const isEditing = editingConceptId === concept.id

              return (
                <div
                  key={concept.id}
                  id={`concept-${concept.id}`}
                  className="rounded-xl border border-border bg-card p-5 scroll-mt-24"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {isEditing ? (
                        /* Task 4: Edit mode */
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                          <textarea
                            value={editSummary}
                            onChange={(e) => setEditSummary(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                          />
                          <input
                            type="text"
                            value={editWhyItMatters}
                            onChange={(e) => setEditWhyItMatters(e.target.value)}
                            placeholder="Why it matters (optional)"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateConceptMutation.mutate()}
                              disabled={!editTitle.trim() || !editSummary.trim() || updateConceptMutation.isPending}
                              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {updateConceptMutation.isPending ? (
                                <SpinnerGap size={14} className="animate-spin" />
                              ) : null}
                              Save
                            </button>
                            <button
                              onClick={() => setEditingConceptId(null)}
                              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Normal display mode */
                        <>
                          <div className="mb-1 flex items-center gap-2 flex-wrap">
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
                            {/* Task 7: Difficulty badges */}
                            {concept.card && concept.card.lapses >= 8 ? (
                              <span className="flex items-center gap-0.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                                <Warning size={12} />
                                Leech
                              </span>
                            ) : concept.card && concept.card.lapses >= 5 ? (
                              <span className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                <Warning size={12} />
                                Difficult
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
                        </>
                      )}
                    </div>

                    {!isEditing ? (
                      <div className="flex items-center gap-1">
                        {concept.card &&
                        new Date(concept.card.due) <= new Date() ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-primary">
                            <Lightning size={12} weight="fill" />
                            Due
                          </span>
                        ) : null}
                        {/* Task 6: History link */}
                        <Link
                          to="/concepts/$conceptId/history"
                          params={{ conceptId: concept.id }}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title="View review history"
                        >
                          <ClockCounterClockwise size={14} />
                        </Link>
                        {/* Task 4: Edit button */}
                        <button
                          onClick={() => {
                            setEditingConceptId(concept.id)
                            setEditTitle(concept.title)
                            setEditSummary(concept.summary)
                            setEditWhyItMatters(concept.whyItMatters ?? '')
                          }}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title="Edit concept"
                        >
                          <PencilSimple size={14} />
                        </button>
                        <button
                          onClick={() => deleteConceptMutation.mutate(concept.id)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Delete concept"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {!isEditing && concept.relatedConceptIds.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {concept.relatedConceptIds.map((relatedId: string, i: number) => {
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
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
