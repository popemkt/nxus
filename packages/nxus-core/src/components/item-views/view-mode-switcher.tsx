import { Button } from '@/components/ui/button'
import {
  SquaresFour,
  Table,
  Graph,
  GridFour,
  Command,
  Funnel,
  FunnelSimple,
} from '@phosphor-icons/react'
import { useViewModeStore } from '@/stores/view-mode.store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ViewModeSwitcher() {
  const viewMode = useViewModeStore((s) => s.viewMode)
  const setViewMode = useViewModeStore((s) => s.setViewMode)
  const galleryMode = useViewModeStore((s) => s.galleryMode)
  const setGalleryMode = useViewModeStore((s) => s.setGalleryMode)
  const graphOptions = useViewModeStore((s) => s.graphOptions)
  const setGraphShowCommands = useViewModeStore((s) => s.setGraphShowCommands)
  const setGraphFilterMode = useViewModeStore((s) => s.setGraphFilterMode)

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border">
      {/* Gallery */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            viewMode === 'gallery' && 'bg-background shadow-sm',
          )}
          onClick={() => {
            if (viewMode !== 'gallery') setViewMode('gallery')
          }}
        >
          <SquaresFour
            className="h-4 w-4"
            weight={viewMode === 'gallery' ? 'fill' : 'regular'}
          />
          <span className="text-xs">Gallery</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            checked={galleryMode === 'default'}
            onCheckedChange={() => setGalleryMode('default')}
          >
            <SquaresFour className="h-4 w-4 mr-2" />
            Default
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={galleryMode === 'compact'}
            onCheckedChange={() => setGalleryMode('compact')}
          >
            <GridFour className="h-4 w-4 mr-2" />
            Compact
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Table */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1.5 px-2.5',
          viewMode === 'table' && 'bg-background shadow-sm',
        )}
        onClick={() => setViewMode('table')}
      >
        <Table
          className="h-4 w-4"
          weight={viewMode === 'table' ? 'fill' : 'regular'}
        />
        <span className="text-xs">Table</span>
      </Button>

      {/* Graph */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            viewMode === 'graph' && 'bg-background shadow-sm',
          )}
          onClick={() => {
            if (viewMode !== 'graph') setViewMode('graph')
          }}
        >
          <Graph
            className="h-4 w-4"
            weight={viewMode === 'graph' ? 'fill' : 'regular'}
          />
          <span className="text-xs">Graph</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            checked={graphOptions.showCommands}
            onCheckedChange={setGraphShowCommands}
          >
            <Command className="h-4 w-4 mr-2" />
            Show Commands
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={graphOptions.filterMode === 'highlight'}
            onCheckedChange={() => setGraphFilterMode('highlight')}
          >
            <FunnelSimple className="h-4 w-4 mr-2" />
            Highlight Matches
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={graphOptions.filterMode === 'show-only'}
            onCheckedChange={() => setGraphFilterMode('show-only')}
          >
            <Funnel className="h-4 w-4 mr-2" />
            Show Only Matches
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
