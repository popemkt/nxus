import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Badge, cn  } from '@nxus/ui'
import type { ItemNodeData } from '../hooks/use-graph-nodes'
import { STATUS_VARIANTS } from '@/lib/app-constants'
import { ItemHealthBadge } from '../../../item-health-badge'

interface ItemNodeProps {
  data: ItemNodeData
  selected?: boolean
}

export const ItemNode = memo(function ItemNode({
  data,
  selected,
}: ItemNodeProps) {
  const { label, description, status, TypeIcon, isDimmed, isHighlighted, app } =
    data

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border bg-card shadow-md min-w-[200px] max-w-[280px] transition-all',
        selected && 'ring-2 ring-primary',
        isHighlighted && !selected && 'ring-2 ring-primary/70',
        isDimmed && 'opacity-40',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !border-background !w-2 !h-2"
      />

      <div className="flex items-start gap-2">
        <TypeIcon className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm line-clamp-1">{label}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <ItemHealthBadge app={app} compact fallbackStatusBadge={
          <Badge variant={STATUS_VARIANTS[status]} className="text-xs">
            {status.replace('-', ' ')}
          </Badge>
        } />
        {app.dependencies && app.dependencies.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {app.dependencies.length} dep
            {app.dependencies.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !border-background !w-2 !h-2"
      />
    </div>
  )
})
