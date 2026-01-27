/**
 * CollapsibleSection - Reusable collapsible panel for control sections
 */

import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useState } from 'react'

export interface CollapsibleSectionProps {
  /** Section title */
  title: string
  /** Icon to display next to title */
  icon: React.ReactNode
  /** Whether section starts expanded */
  defaultExpanded?: boolean
  /** Additional classes for the container */
  className?: string
  /** Section content */
  children: React.ReactNode
}

/**
 * Collapsible section for graph controls.
 * Used for grouping related controls in the control panel.
 */
export function CollapsibleSection({
  title,
  icon,
  defaultExpanded = false,
  className,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className={cn('border-b border-border', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <CaretDown className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <CaretRight className="size-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-xs font-medium">{title}</span>
      </button>
      {expanded && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  )
}
