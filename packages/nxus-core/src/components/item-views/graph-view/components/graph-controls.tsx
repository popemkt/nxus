import { Panel } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import {
  Lock,
  LockOpen,
  TreeStructure,
  Graph,
  ArrowsOutCardinal,
} from '@phosphor-icons/react'
import type { GraphLayout } from '@/stores/view-mode.store'
import { cn } from '@/lib/utils'

interface GraphControlsProps {
  isLocked: boolean
  onToggleLock: () => void
  layout: GraphLayout
  onLayoutChange: (layout: GraphLayout) => void
  onFitView: () => void
}

export function GraphControls({
  isLocked,
  onToggleLock,
  layout,
  onLayoutChange,
  onFitView,
}: GraphControlsProps) {
  return (
    <Panel
      position="top-left"
      className="flex gap-1 p-1 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onToggleLock}
        title={isLocked ? 'Unlock nodes' : 'Lock nodes'}
      >
        {isLocked ? (
          <Lock className="h-4 w-4" />
        ) : (
          <LockOpen className="h-4 w-4" />
        )}
      </Button>

      <div className="w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', layout === 'hierarchical' && 'bg-muted')}
        onClick={() => onLayoutChange('hierarchical')}
        title="Hierarchical layout"
      >
        <TreeStructure className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', layout === 'force' && 'bg-muted')}
        onClick={() => onLayoutChange('force')}
        title="Force-directed layout"
      >
        <Graph className="h-4 w-4" />
      </Button>

      <div className="w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onFitView}
        title="Fit view"
      >
        <ArrowsOutCardinal className="h-4 w-4" />
      </Button>
    </Panel>
  )
}
