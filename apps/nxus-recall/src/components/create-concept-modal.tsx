import { useState } from 'react'
import { PlusIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@nxus/ui'
import { useCreateManualConcept } from '../hooks/use-recall-mutations.js'
import type { BloomsLevel } from '../types/recall.js'

const BLOOMS_OPTIONS: { value: BloomsLevel; label: string }[] = [
  { value: 'remember', label: 'Remember' },
  { value: 'understand', label: 'Understand' },
  { value: 'apply', label: 'Apply' },
  { value: 'analyze', label: 'Analyze' },
  { value: 'evaluate', label: 'Evaluate' },
  { value: 'create', label: 'Create' },
]

interface CreateConceptModalProps {
  topicId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const INITIAL_FORM = {
  title: '',
  summary: '',
  whyItMatters: '',
  bloomsLevel: 'understand' as BloomsLevel,
  source: '',
}

export function CreateConceptModal({ topicId, open, onOpenChange }: CreateConceptModalProps) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const { createConcept, isCreating } = useCreateManualConcept()

  const canSubmit = form.title.trim() && form.summary.trim() && form.whyItMatters.trim()

  const resetForm = () => {
    setForm(INITIAL_FORM)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    setError(null)
    try {
      await createConcept({
        topicId,
        title: form.title.trim(),
        summary: form.summary.trim(),
        whyItMatters: form.whyItMatters.trim(),
        bloomsLevel: form.bloomsLevel,
        source: form.source.trim() || undefined,
      })
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && canSubmit) {
      handleSubmit()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <PlusIcon className="size-5 text-primary" />
            <AlertDialogTitle>Add Concept</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Create a new concept manually for this topic.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Field>
            <FieldLabel htmlFor="concept-title">
              Title <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="concept-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g., Binary Search Algorithm"
              autoFocus
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="concept-summary">
              Summary <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="concept-summary"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="A concise explanation of this concept..."
              rows={3}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="concept-why">
              Why It Matters <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="concept-why"
              value={form.whyItMatters}
              onChange={(e) => setForm((f) => ({ ...f, whyItMatters: e.target.value }))}
              placeholder="Why is this concept important to understand?"
              rows={2}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="concept-blooms">Cognitive Level</FieldLabel>
            <Select
              value={form.bloomsLevel}
              onValueChange={(v) => setForm((f) => ({ ...f, bloomsLevel: v as BloomsLevel }))}
            >
              <SelectTrigger id="concept-blooms">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOOMS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="concept-source">Source (optional)</FieldLabel>
            <Input
              id="concept-source"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              placeholder="e.g., Introduction to Algorithms, Ch. 2"
            />
          </Field>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Tip: Press ⌘+Enter to submit
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={handleSubmit} disabled={!canSubmit || isCreating}>
            {isCreating ? 'Creating...' : 'Create Concept'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
