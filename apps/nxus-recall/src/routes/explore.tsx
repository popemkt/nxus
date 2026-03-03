import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react'
import { Button, Input, Skeleton } from '@nxus/ui'
import { ConceptCard } from '../components/concept-card.js'
import { generateConceptsServerFn } from '../server/ai.server.js'
import { useSaveConcept } from '../hooks/use-recall-mutations.js'
import type { GeneratedConcept } from '../types/ai.js'
import type { BloomsLevel } from '../types/recall.js'

export const Route = createFileRoute('/explore')({
  component: ExplorePage,
  validateSearch: (search: Record<string, unknown>) => ({
    topic: (search.topic as string) || '',
  }),
})

function GenerationSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-52 rounded-lg" />
      ))}
    </div>
  )
}

function ExplorePage() {
  const { topic: initialTopic } = Route.useSearch()
  const [topicInput, setTopicInput] = useState(initialTopic)
  const [concepts, setConcepts] = useState<GeneratedConcept[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedTopicName, setGeneratedTopicName] = useState('')
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())

  const { saveConcept } = useSaveConcept()

  const handleGenerate = useCallback(async () => {
    const trimmed = topicInput.trim()
    if (!trimmed) return

    setIsGenerating(true)
    setError(null)
    setConcepts([])
    setGeneratedTopicName(trimmed)

    try {
      const result = await generateConceptsServerFn({ data: { topicName: trimmed } })
      if (!result.success) {
        setError(result.error)
        return
      }
      setConcepts(result.data)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsGenerating(false)
    }
  }, [topicInput])

  const handleRegenerate = useCallback(async () => {
    const trimmed = topicInput.trim()
    if (!trimmed) return

    const existingTitles = concepts.map((c) => c.title)

    setIsGenerating(true)
    setError(null)
    setConcepts([])

    try {
      const result = await generateConceptsServerFn({
        data: { topicName: trimmed, existingConcepts: existingTitles },
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setConcepts(result.data)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsGenerating(false)
    }
  }, [topicInput, concepts])

  const handleSave = useCallback(
    async (concept: GeneratedConcept, index: number) => {
      setSavingIds((prev) => new Set(prev).add(index))
      try {
        await saveConcept({
          topicName: generatedTopicName,
          title: concept.title,
          summary: concept.summary,
          whyItMatters: concept.whyItMatters,
          bloomsLevel: concept.bloomsLevel as BloomsLevel,
        })
        // Remove saved concept from the list
        setConcepts((prev) => prev.filter((_, i) => i !== index))
      } catch {
        // Error is handled by the mutation hook
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
      }
    },
    [saveConcept, generatedTopicName],
  )

  const handleDismiss = useCallback((index: number) => {
    setConcepts((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleGenerate()
    },
    [handleGenerate],
  )

  return (
    <div className="relative min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <a
            href="/recall/"
            className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
            title="Back to Dashboard"
          >
            <ArrowLeftIcon className="size-4" />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Explore</h1>
            <p className="text-sm text-muted-foreground">
              Generate concepts for any topic using AI
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="flex gap-2 mb-8">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a topic (e.g., Distributed Systems, Machine Learning, Art History)"
              className="pl-9"
            />
          </div>
          <Button onClick={handleGenerate} disabled={isGenerating || !topicInput.trim()}>
            <SparkleIcon data-icon="inline-start" />
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 mb-6">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && <GenerationSkeleton />}

        {/* Results */}
        {!isGenerating && concepts.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {concepts.length} {concepts.length === 1 ? 'concept' : 'concepts'} generated for{' '}
                <strong className="text-foreground">{generatedTopicName}</strong>
              </p>
              <Button variant="outline" size="sm" onClick={handleRegenerate}>
                <ArrowClockwiseIcon data-icon="inline-start" />
                Regenerate
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {concepts.map((concept, index) => (
                <ConceptCard
                  key={`${concept.title}-${index}`}
                  concept={concept}
                  index={index}
                  onSave={() => handleSave(concept, index)}
                  onDismiss={() => handleDismiss(index)}
                  isSaving={savingIds.has(index)}
                />
              ))}
            </div>
          </>
        )}

        {/* Empty result after generation */}
        {!isGenerating && !error && concepts.length === 0 && generatedTopicName && (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-4">
              All concepts have been saved or dismissed.
            </p>
            <Button variant="outline" onClick={handleRegenerate}>
              <ArrowClockwiseIcon data-icon="inline-start" />
              Generate More
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
