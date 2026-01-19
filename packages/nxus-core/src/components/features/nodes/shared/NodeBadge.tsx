import { cn } from '@/lib/utils'
import { Cube } from '@phosphor-icons/react'

interface NodeBadgeProps {
  content: string | null
  systemId?: string | null
  isSelected?: boolean
  onClick?: () => void
  className?: string
}

/**
 * NodeBadge - Compact node display with icon
 *
 * Shows node content and optional systemId in a clickable badge format.
 */
export function NodeBadge({
  content,
  systemId,
  isSelected,
  onClick,
  className,
}: NodeBadgeProps) {
  return (
    <button
      className={cn(
        'w-full text-left px-3 py-2 rounded-lg transition-all group',
        isSelected
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-muted border border-transparent',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <Cube className="size-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {content || (
              <span className="text-muted-foreground italic">(no content)</span>
            )}
          </div>
          {systemId && (
            <div className="text-xs text-muted-foreground font-mono truncate">
              {systemId}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
