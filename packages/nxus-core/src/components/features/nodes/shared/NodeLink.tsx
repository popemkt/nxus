import { cn } from '@/lib/utils'
import { ArrowSquareOut } from '@phosphor-icons/react'

interface NodeLinkProps {
  nodeId: string
  label?: string
  onClick: (nodeId: string) => void
  className?: string
  showIcon?: boolean
}

/**
 * NodeLink - Clickable reference to another node
 *
 * Used in property values and backlinks to navigate between nodes.
 */
export function NodeLink({
  nodeId,
  label,
  onClick,
  className,
  showIcon = true,
}: NodeLinkProps) {
  const displayLabel = label || nodeId.slice(0, 8) + '...'

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline cursor-pointer font-mono text-xs',
        className,
      )}
      onClick={() => onClick(nodeId)}
      title={`Navigate to node: ${nodeId}`}
    >
      {displayLabel}
      {showIcon && <ArrowSquareOut className="size-3" />}
    </button>
  )
}
