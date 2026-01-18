import { Panel } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import {
  LockIcon,
  LockOpenIcon,
  TreeStructureIcon,
  GraphIcon,
  ArrowsOutCardinalIcon,
  CirclesFourIcon,
  CardsIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  CommandIcon,
  GearSixIcon,
  TagIcon,
} from '@phosphor-icons/react'
import type { GraphOptions, GraphNodeStyle } from '@/stores/view-mode.store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'

interface GraphControlsProps {
  options: GraphOptions
  onOptionsChange: (options: Partial<GraphOptions>) => void
  onFitView: () => void
  onRunLayout: () => void
}

export function GraphControls({
  options,
  onOptionsChange,
  onFitView,
  onRunLayout,
}: GraphControlsProps) {
  const {
    nodesLocked,
    layout,
    nodeStyle,
    filterMode,
    showCommands,
    showLabels,
  } = options

  return (
    <Panel
      position="top-left"
      className="flex gap-1 p-1 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm"
    >
      {/* Lock toggle */}
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', nodesLocked && 'bg-muted')}
        onClick={() => onOptionsChange({ nodesLocked: !nodesLocked })}
        title={
          nodesLocked
            ? 'Unlock nodes (allow dragging)'
            : 'Lock nodes (prevent dragging)'
        }
      >
        {nodesLocked ? (
          <LockIcon className="h-4 w-4" />
        ) : (
          <LockOpenIcon className="h-4 w-4" />
        )}
      </Button>

      <div className="w-px bg-border" />

      {/* Node style toggle */}
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', nodeStyle === 'detailed' && 'bg-muted')}
        onClick={() =>
          onOptionsChange({ nodeStyle: 'detailed', layout: 'hierarchical' })
        }
        title="Detailed nodes"
      >
        <CardsIcon className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', nodeStyle === 'simple' && 'bg-muted')}
        onClick={() => onOptionsChange({ nodeStyle: 'simple' })}
        title="Simple dots (colored by type, sized by dependencies)"
      >
        <CirclesFourIcon className="h-4 w-4" />
      </Button>

      <div className="w-px bg-border" />

      {/* Layout (only available in simple mode) */}
      {nodeStyle === 'simple' && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', layout === 'hierarchical' && 'bg-muted')}
            onClick={() => {
              onOptionsChange({ layout: 'hierarchical' })
              setTimeout(onRunLayout, 50)
            }}
            title="Hierarchical layout (left to right)"
          >
            <TreeStructureIcon className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', layout === 'force' && 'bg-muted')}
            onClick={() => {
              onOptionsChange({ layout: 'force' })
              setTimeout(onRunLayout, 50)
            }}
            title="Force-directed layout (interactive, springy)"
          >
            <GraphIcon className="h-4 w-4" />
          </Button>

          <div className="w-px bg-border" />
        </>
      )}

      {/* Fit view */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onFitView}
        title="Fit view"
      >
        <ArrowsOutCardinalIcon className="h-4 w-4" />
      </Button>

      <div className="w-px bg-border" />

      {/* Settings dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
          title="Graph options"
        >
          <GearSixIcon className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {/* Filter mode */}
          <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
            Filter Mode
          </div>
          <DropdownMenuCheckboxItem
            checked={filterMode === 'highlight'}
            onCheckedChange={() => onOptionsChange({ filterMode: 'highlight' })}
          >
            <FunnelSimpleIcon className="h-4 w-4 mr-2" />
            Highlight matches
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={filterMode === 'show-only'}
            onCheckedChange={() => onOptionsChange({ filterMode: 'show-only' })}
          >
            <FunnelIcon className="h-4 w-4 mr-2" />
            Show only matches
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator />

          {/* Show labels toggle */}
          <DropdownMenuCheckboxItem
            checked={showLabels}
            onCheckedChange={(checked) =>
              onOptionsChange({ showLabels: !!checked })
            }
          >
            <TagIcon className="h-4 w-4 mr-2" />
            Show labels
          </DropdownMenuCheckboxItem>

          {/* Show commands (only in detailed mode) */}
          {nodeStyle === 'detailed' && (
            <DropdownMenuCheckboxItem
              checked={showCommands}
              onCheckedChange={(checked) =>
                onOptionsChange({ showCommands: !!checked })
              }
            >
              <CommandIcon className="h-4 w-4 mr-2" />
              Show commands
            </DropdownMenuCheckboxItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Panel>
  )
}

// Legend panel
export function GraphLegend({ nodeStyle }: { nodeStyle: GraphNodeStyle }) {
  if (nodeStyle !== 'simple') return null

  const types = [
    { type: 'tool', label: 'Tool', color: 'bg-green-500' },
    { type: 'remote-repo', label: 'Repo', color: 'bg-purple-500' },
    { type: 'typescript', label: 'TS', color: 'bg-blue-500' },
    { type: 'html', label: 'HTML', color: 'bg-orange-500' },
  ]

  return (
    <Panel
      position="bottom-left"
      className="p-2 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm"
    >
      <div className="flex items-center gap-3 text-xs">
        {types.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn('w-3 h-3 rounded-full', color)} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
