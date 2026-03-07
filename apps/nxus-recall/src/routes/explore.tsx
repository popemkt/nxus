import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowLeft,
  Brain,
  MagnifyingGlass,
  SpinnerGap,
  Check,
  X,
  Sparkle,
} from '@phosphor-icons/react'
import { generateConceptsServerFn } from '@/services/generate-concepts.server'
import { saveConceptServerFn, saveConceptsBatchServerFn } from '@/services/concepts.server'
import { createTopicServerFn } from '@/services/topics.server'
import type { GeneratedConcept } from '@nxus/mastra'

export const Route = createFileRoute('/explore')({
  component: ExplorePage,
})

function ExplorePage() {
  const [topicInput, setTopicInput] = useState('')
  const [generatedConcepts, setGeneratedConcepts] = useState<
    (GeneratedConcept & { saved?: boolean; dismissed?: boolean })[]
  >([])
  const [topicId, setTopicId] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const generateMutation = useMutation({
    mutationFn: async (topic: string) => {
      // Create topic first
      const topicResult = await createTopicServerFn({ data: { name: topic } })
      if (!topicResult.success) throw new Error('Failed to create topic')
      setTopicId(topicResult.topicId)

      // Generate concepts
      const result = await generateConceptsServerFn({ data: { topic } })
      if (!result.success) throw new Error(result.error)
      return result.concepts
    },
    onSuccess: (concepts) => {
      setGeneratedConcepts(concepts.map((c) => ({ ...c })))
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (concept: GeneratedConcept) => {
      if (!topicId) throw new Error('No topic created')
      const result = await saveConceptServerFn({
        data: {
          topicId,
          title: concept.title,
          summary: concept.summary,
          whyItMatters: concept.whyItMatters,
          bloomsLevel: concept.bloomsLevel,
          relatedConceptTitles: concept.relatedConceptTitles,
        },
      })
      if (!result.success) throw new Error('Failed to save concept')
      return result.conceptId
    },
    onSuccess: (_conceptId, concept) => {
      setGeneratedConcepts((prev) =>
        prev.map((c) =>
          c.title === concept.title ? { ...c, saved: true } : c,
        ),
      )
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
    },
  })

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      if (!topicId) throw new Error('No topic created')
      const unsaved = generatedConcepts.filter((c) => !c.saved && !c.dismissed)
      if (unsaved.length === 0) throw new Error('No concepts to save')
      const result = await saveConceptsBatchServerFn({
        data: {
          topicId,
          concepts: unsaved.map((c) => ({
            title: c.title,
            summary: c.summary,
            whyItMatters: c.whyItMatters,
            bloomsLevel: c.bloomsLevel,
            relatedConceptTitles: c.relatedConceptTitles,
          })),
        },
      })
      if (!result.success) throw new Error('Failed to save concepts')
      return result
    },
    onSuccess: () => {
      setGeneratedConcepts((prev) =>
        prev.map((c) => (c.dismissed ? c : { ...c, saved: true })),
      )
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
    },
  })

  const handleGenerate = () => {
    if (!topicInput.trim()) return
    setGeneratedConcepts([])
    setTopicId(null)
    generateMutation.mutate(topicInput.trim())
  }

  const handleDismiss = (title: string) => {
    setGeneratedConcepts((prev) =>
      prev.map((c) => (c.title === title ? { ...c, dismissed: true } : c)),
    )
  }

  const savedCount = generatedConcepts.filter((c) => c.saved).length
  const unsavedCount = generatedConcepts.filter((c) => !c.saved && !c.dismissed).length

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
          <div className="flex items-center gap-2">
            <Sparkle size={20} weight="duotone" className="text-primary" />
            <h1 className="text-lg font-semibold">Explore Topics</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            What do you want to learn?
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <MagnifyingGlass
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g., Distributed Systems, React Server Components, Category Theory..."
                className="w-full rounded-lg border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={
                !topicInput.trim() || generateMutation.isPending
              }
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generateMutation.isPending ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Brain size={16} weight="duotone" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {generateMutation.isError ? (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {generateMutation.error?.message ?? 'Something went wrong'}
          </div>
        ) : null}

        {/* Generated Concepts */}
        {generatedConcepts.length > 0 ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Generated Concepts
              </h2>
              <div className="flex items-center gap-3">
                {unsavedCount > 0 ? (
                  <button
                    onClick={() => saveAllMutation.mutate()}
                    disabled={saveAllMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saveAllMutation.isPending ? (
                      <SpinnerGap size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} weight="bold" />
                    )}
                    Save All ({unsavedCount})
                  </button>
                ) : null}
                {savedCount > 0 ? (
                  <button
                    onClick={() => {
                      if (topicId) {
                        navigate({
                          to: '/topics/$topicId',
                          params: { topicId },
                        })
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    View Topic ({savedCount} saved)
                    <ArrowLeft size={14} className="rotate-180" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4">
              {generatedConcepts.map((concept) => (
                <ConceptCard
                  key={concept.title}
                  concept={concept}
                  onSave={() => saveMutation.mutate(concept)}
                  onDismiss={() => handleDismiss(concept.title)}
                  isSaving={
                    saveMutation.isPending &&
                    saveMutation.variables?.title === concept.title
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

function ConceptCard({
  concept,
  onSave,
  onDismiss,
  isSaving,
}: {
  concept: GeneratedConcept & { saved?: boolean; dismissed?: boolean }
  onSave: () => void
  onDismiss: () => void
  isSaving: boolean
}) {
  if (concept.dismissed) return null

  const bloomsColors: Record<string, string> = {
    remember: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    understand: 'bg-green-500/10 text-green-600 dark:text-green-400',
    apply: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    analyze: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    evaluate: 'bg-red-500/10 text-red-600 dark:text-red-400',
    create: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  }

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        concept.saved
          ? 'border-success/30 bg-success/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-medium">{concept.title}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                bloomsColors[concept.bloomsLevel] ?? 'bg-muted text-muted-foreground'
              }`}
            >
              {concept.bloomsLevel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{concept.summary}</p>
        </div>

        {concept.saved ? (
          <div className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
            <Check size={14} weight="bold" />
            Saved
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onDismiss}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X size={16} />
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <Check size={14} weight="bold" />
              )}
              Save
            </button>
          </div>
        )}
      </div>

      {concept.whyItMatters ? (
        <p className="mt-2 text-xs text-muted-foreground italic">
          Why it matters: {concept.whyItMatters}
        </p>
      ) : null}

      {concept.relatedConceptTitles.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {concept.relatedConceptTitles.map((title) => (
            <span
              key={title}
              className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {title}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
