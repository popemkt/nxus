/**
 * ConfigurableTag Component
 *
 * A reusable tag badge that handles both regular and configurable tags.
 * Configurable tags show special styling and a config button.
 *
 * States:
 * 1. Regular tag (no config needed) - normal badge
 * 2. Configurable + Configured - accent styling with gear icon
 * 3. Configurable + NOT Configured - warning styling with alert icon
 */

import { Gear, Warning, Lightning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface ConfigurableTagProps {
  /** The tag ID/name */
  tagId: string
  /** App ID this tag belongs to */
  appId: string
  /** Whether this tag has a configuration schema */
  isConfigurable: boolean
  /** Whether this app has provided values for this tag */
  isConfigured: boolean
  /** Callback when configure button is clicked */
  onConfigure?: () => void
  /** Callback when remove button is clicked (edit mode) */
  onRemove?: () => void
  /** Show the configure gear button */
  showConfigButton?: boolean
  /** Size variant */
  size?: 'sm' | 'md'
  /** Additional className */
  className?: string
}

export function ConfigurableTag({
  tagId,
  isConfigurable,
  isConfigured,
  onConfigure,
  onRemove,
  showConfigButton = true,
  size = 'sm',
  className,
}: ConfigurableTagProps) {
  // Determine styling based on state
  const getVariant = () => {
    if (!isConfigurable) return 'outline'
    return isConfigured ? 'default' : 'destructive'
  }

  const getIcon = () => {
    if (!isConfigurable) return null
    return isConfigured ? (
      <Lightning className="h-3 w-3" weight="fill" />
    ) : (
      <Warning className="h-3 w-3" weight="fill" />
    )
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  return (
    <Badge
      variant={getVariant()}
      className={cn(
        'inline-flex items-center gap-1',
        sizeClasses[size],
        isConfigurable &&
          !isConfigured &&
          'bg-amber-500/20 text-amber-400 border-amber-500/30',
        isConfigurable &&
          isConfigured &&
          'bg-primary/20 text-primary border-primary/30',
        className,
      )}
    >
      {getIcon()}
      <span>{tagId}</span>

      {/* Configure button for configurable tags */}
      {isConfigurable && showConfigButton && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onConfigure?.()
          }}
          className={cn(
            'ml-0.5 p-0.5 rounded hover:bg-white/20 transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-white/50',
          )}
          title={isConfigured ? 'Edit configuration' : 'Configure required'}
        >
          <Gear className="h-3 w-3" />
        </button>
      )}

      {/* Remove button (when in edit mode) */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className={cn(
            'ml-0.5 p-0.5 rounded hover:bg-white/20 transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-white/50',
          )}
          title="Remove tag"
        >
          <span className="text-xs leading-none">×</span>
        </button>
      )}
    </Badge>
  )
}

/**
 * Simple tag display without configuration features
 * Used for read-only contexts
 */
export function SimpleTag({
  tagId,
  className,
}: {
  tagId: string
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('text-xs', className)}>
      {tagId}
    </Badge>
  )
}
