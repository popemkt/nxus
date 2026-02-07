import { cn } from '@nxus/ui'
import { Hash } from '@phosphor-icons/react'

interface SupertagChipProps {
  name: string
  isSelected?: boolean
  onClick?: () => void
  className?: string
  size?: 'sm' | 'md'
}

/**
 * SupertagChip - Visual tag indicator
 *
 * Displays a supertag with # icon, commonly used in sidebars and node displays.
 */
export function SupertagChip({
  name,
  isSelected,
  onClick,
  className,
  size = 'md',
}: SupertagChipProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-sm px-2 py-1 gap-1.5',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center rounded-md font-medium transition-colors',
        sizeClasses[size],
        isSelected
          ? 'bg-primary/20 text-primary border border-primary/30'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent',
        className,
      )}
      onClick={onClick}
    >
      <Hash className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      {name}
    </button>
  )
}
