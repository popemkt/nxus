import { Card, CardHeader, CardTitle, CardContent, CardFooter, Button } from '@nxus/ui'
import { FloppyDiskIcon, XIcon } from '@phosphor-icons/react'
import { BloomsBadge } from './blooms-badge.js'
import type { GeneratedConcept } from '../types/ai.js'

interface ConceptCardProps {
  concept: GeneratedConcept
  index: number
  onSave: () => void
  onDismiss: () => void
  isSaving?: boolean
}

export function ConceptCard({ concept, index, onSave, onDismiss, isSaving }: ConceptCardProps) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
      style={{ animationDelay: `${index * 100}ms`, animationDuration: '400ms' }}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{concept.title}</CardTitle>
          <BloomsBadge level={concept.bloomsLevel} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground/80">{concept.summary}</p>
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Why it matters</p>
          <p className="text-sm text-foreground/70">{concept.whyItMatters}</p>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          <FloppyDiskIcon data-icon="inline-start" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={isSaving}>
          <XIcon data-icon="inline-start" />
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  )
}
