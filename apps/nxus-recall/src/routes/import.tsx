import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowLeft,
  Brain,
  SpinnerGap,
  Check,
  Trash,
  FileText,
} from '@phosphor-icons/react'
import { extractConceptsServerFn } from '@/services/extract-concepts.server'
import { saveConceptsBatchServerFn } from '@/services/concepts.server'
import { createTopicServerFn } from '@/services/topics.server'
import type { GeneratedConcept } from '@nxus/mastra'

export const Route = createFileRoute('/import')({
  component: ImportPage,
})

function ImportPage() {
  const [textInput, setTextInput] = useState('')
  const [topicName, setTopicName] = useState('Imported Notes')
  const [generatedConcepts, setGeneratedConcepts] = useState<
    (GeneratedConcept & { saved?: boolean; dismissed?: boolean })[]
  >([])
  const [topicId, setTopicId] = useState<string | null>(null)
  const [savedConceptIds, setSavedConceptIds] = useState<string[]>([])
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const extractMutation = useMutation({
    mutationFn: async ({ text, topic }: { text: string; topic: string }) => {
      // Extract concepts from text
      const extractResult = await extractConceptsServerFn({
        data: { text, topicHint: topic },
      })
      if (!extractResult.success) throw new Error(extractResult.error)

      // Create topic
      const topicResult = await createTopicServerFn({ data: { name: topic } })
      if (!topicResult.success) throw new Error('Failed to create topic')
      const newTopicId = topicResult.topicId
      setTopicId(newTopicId)

      // Batch-save concepts
      const saveResult = await saveConceptsBatchServerFn({
        data: {
          topicId: newTopicId,
          concepts: extractResult.concepts.map((c: GeneratedConcept) => ({
            title: c.title,
            summary: c.summary,
            whyItMatters: c.whyItMatters,
            bloomsLevel: c.bloomsLevel,
            relatedConceptTitles: c.relatedConceptTitles,
          })),
        },
      })

      if (!saveResult.success) throw new Error('Failed to save concepts')

      return { concepts: extractResult.concepts, conceptIds: saveResult.conceptIds }
    },
    onSuccess: ({ concepts, conceptIds }) => {
      setGeneratedConcepts(concepts.map((c: GeneratedConcept) => ({ ...c, saved: true })))
      setSavedConceptIds(conceptIds)
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
    },
  })

  const deleteConceptMutation = useMutation({
    mutationFn: async ({ conceptId, title }: { conceptId: string; title: string }) => {
      const { deleteConceptServerFn } = await import('@/services/concepts.server')
      await deleteConceptServerFn({ data: { conceptId } })
      return { conceptId, title }
    },
    onSuccess: ({ title }) => {
      setGeneratedConcepts((prev) =>
        prev.map((c) => (c.title === title ? { ...c, dismissed: true } : c)),
      )
      queryClient.invalidateQueries({ queryKey: ['recall-topics'] })
      queryClient.invalidateQueries({ queryKey: ['recall-stats'] })
    },
  })

  const handleExtract = () => {
    if (!textInput.trim()) return
    setGeneratedConcepts([])
    setTopicId(null)
    setSavedConceptIds([])
    extractMutation.mutate({ text: textInput.trim(), topic: topicName.trim() || 'Imported Notes' })
  }

  const handleDismiss = (title: string) => {
    const idx = generatedConcepts.findIndex((c) => c.title === title)
    if (idx === -1) return
    const conceptId = savedConceptIds[idx]
    if (conceptId) {
      deleteConceptMutation.mutate({ conceptId, title })
    } else {
      setGeneratedConcepts((prev) =>
        prev.map((c) => (c.title === title ? { ...c, dismissed: true } : c)),
      )
    }
  }

  const savedCount = generatedConcepts.filter((c) => c.saved && !c.dismissed).length

  const bloomsColors: Record<string, string> = {
    remember: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    understand: 'bg-green-500/10 text-green-600 dark:text-green-400',
    apply: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    analyze: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    evaluate: 'bg-red-500/10 text-red-600 dark:text-red-400',
    create: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
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
          <div className="flex items-center gap-2">
            <FileText size={20} weight="duotone" className="text-primary" />
            <h1 className="text-lg font-semibold">Import from Notes</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Text Input */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Paste your text
          </label>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Paste your notes, article text, or documentation..."
            rows={10}
            className="w-full rounded-lg border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        {/* Topic Name */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Topic name (optional)
          </label>
          <input
            type="text"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="Imported Notes"
            className="w-full rounded-lg border border-input bg-background py-3 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Extract Button */}
        <div className="mb-8">
          <button
            onClick={handleExtract}
            disabled={!textInput.trim() || extractMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {extractMutation.isPending ? (
              <>
                <SpinnerGap size={16} className="animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Brain size={16} weight="duotone" />
                Extract Concepts
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {extractMutation.isError ? (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {extractMutation.error?.message ?? 'Something went wrong'}
          </div>
        ) : null}

        {/* Generated Concepts */}
        {generatedConcepts.length > 0 ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Extracted Concepts
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check size={14} weight="bold" className="text-success" />
                  Auto-saved {savedCount} concepts
                </span>
                {topicId ? (
                  <button
                    onClick={() => {
                      navigate({
                        to: '/topics/$topicId',
                        params: { topicId },
                      })
                    }}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    View Topic
                    <ArrowLeft size={14} className="rotate-180" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4">
              {generatedConcepts.map((concept) => {
                if (concept.dismissed) return null

                return (
                  <div
                    key={concept.title}
                    className="rounded-xl border border-success/30 bg-success/5 p-5 transition-all"
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

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                          <Check size={14} weight="bold" />
                          Saved
                        </div>
                        <button
                          onClick={() => handleDismiss(concept.title)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove concept"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>

                    {concept.whyItMatters ? (
                      <p className="mt-2 text-xs text-muted-foreground italic">
                        Why it matters: {concept.whyItMatters}
                      </p>
                    ) : null}

                    {concept.relatedConceptTitles.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {concept.relatedConceptTitles.map((title: string) => (
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
              })}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
