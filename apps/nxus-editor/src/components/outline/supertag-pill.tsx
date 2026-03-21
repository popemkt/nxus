import { Hash } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { getSupertagColor } from '@/lib/supertag-colors'

interface SupertagPillProps {
  tag: {
    id: string
    name?: string
    content?: string
    color?: string | null
    systemId?: string | null
  }
  /** Display size variant */
  size?: 'sm' | 'md'
  /** Whether to show the Hash icon (false = use "#" text prefix) */
  showIcon?: boolean
  /** Click handler — if provided, pill becomes interactive */
  onClick?: (e: React.MouseEvent) => void
  className?: string
}

/**
 * Shared supertag badge/pill used consistently across all views.
 * Resolves color from tag.color or getSupertagColor fallback.
 */
export function SupertagPill({
  tag,
  size = 'md',
  showIcon = true,
  onClick,
  className,
}: SupertagPillProps) {
  const color = tag.color ?? getSupertagColor(tag.id)
  const label = tag.name ?? tag.content ?? ''

  const sizeClasses = size === 'sm'
    ? 'text-[9px] px-1 py-px'
    : 'text-[11px] px-1.5 py-px leading-[1.8]'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm font-medium',
        'select-none whitespace-nowrap',
        sizeClasses,
        onClick && 'cursor-pointer transition-opacity hover:opacity-70',
        className,
      )}
      style={{
        backgroundColor: `${color}18`,
        color,
      }}
      onClick={onClick}
    >
      {showIcon ? (
        <Hash
          size={size === 'sm' ? 8 : 10}
          weight="bold"
          className="shrink-0 opacity-60"
        />
      ) : (
        '#'
      )}
      {label}
    </span>
  )
}
