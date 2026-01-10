import { Button } from '@/components/ui/button'
import { SquaresFour, Table, Graph, GridFour } from '@phosphor-icons/react'
import { useViewModeStore } from '@/stores/view-mode.store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ViewModeSwitcher() {
  const viewMode = useViewModeStore((s) => s.viewMode)
  const setViewMode = useViewModeStore((s) => s.setViewMode)
  const galleryMode = useViewModeStore((s) => s.galleryMode)
  const setGalleryMode = useViewModeStore((s) => s.setGalleryMode)

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border">
      {/* Gallery with dropdown for mode */}
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

      {/* Graph - simple button, options are in the graph view */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1.5 px-2.5',
          viewMode === 'graph' && 'bg-background shadow-sm',
        )}
        onClick={() => setViewMode('graph')}
      >
        <Graph
          className="h-4 w-4"
          weight={viewMode === 'graph' ? 'fill' : 'regular'}
        />
        <span className="text-xs">Graph</span>
      </Button>
    </div>
  )
}
