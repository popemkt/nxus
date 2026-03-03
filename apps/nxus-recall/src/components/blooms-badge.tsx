import { Badge } from '@nxus/ui'
import type { BloomsLevel } from '../types/recall.js'

const BLOOMS_COLORS: Record<BloomsLevel, string> = {
  remember: 'bg-muted text-muted-foreground',
  understand: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  apply: 'bg-green-500/15 text-green-600 dark:text-green-400',
  analyze: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  evaluate: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  create: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

const BLOOMS_LABELS: Record<BloomsLevel, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
}

interface BloomsBadgeProps {
  level: BloomsLevel
  className?: string
}

export function BloomsBadge({ level, className }: BloomsBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${BLOOMS_COLORS[level]} ${className ?? ''}`}
    >
      {BLOOMS_LABELS[level]}
    </Badge>
  )
}
