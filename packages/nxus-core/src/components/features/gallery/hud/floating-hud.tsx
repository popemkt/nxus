import { Link } from '@tanstack/react-router'
import { motion, LayoutGroup } from 'framer-motion'
import {
  MagnifyingGlass,
  SquaresFour,
  Table,
  Graph,
  Tag,
  Gear,
  TrayArrowDown,
  Command,
  GridFour,
  CaretDown,
} from '@phosphor-icons/react'
import { useViewModeStore } from '@/stores/view-mode.store'
import { useCommandPaletteStore } from '@/stores/command-palette.store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface FloatingHudProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  sidebarOpen: boolean
  onSidebarToggle: () => void
  inboxCount?: number
}

export function FloatingHud({
  searchQuery,
  onSearchChange,
  sidebarOpen,
  onSidebarToggle,
  inboxCount = 0,
}: FloatingHudProps) {
  const viewMode = useViewModeStore((s) => s.viewMode)
  const setViewMode = useViewModeStore((s) => s.setViewMode)
  const galleryMode = useViewModeStore((s) => s.galleryMode)
  const setGalleryMode = useViewModeStore((s) => s.setGalleryMode)
  const openPalette = useCommandPaletteStore((s) => s.open)
  const isCommandPaletteOpen = useCommandPaletteStore((s) => s.isOpen)

  const GalleryIcon = galleryMode === 'compact' ? GridFour : SquaresFour

  // Common button styles
  const btnBase =
    'w-9 h-9 rounded-full border-none cursor-pointer flex items-center justify-center transition-all'
  const btnInactive =
    'bg-transparent text-foreground/50 hover:bg-foreground/10 hover:text-foreground/90'
  const btnActive = 'bg-foreground text-background'

  return (
    <LayoutGroup>
      <motion.div
        layoutId="hud-bar"
        className="pointer-events-auto h-[52px] min-w-[580px] bg-background/85 backdrop-blur-xl border border-foreground/10 rounded-[26px] flex items-center px-2 gap-1 shadow-[0_20px_40px_rgba(0,0,0,0.25)]"
        style={{ opacity: isCommandPaletteOpen ? 0 : 1 }}
      >
        {/* Logo */}
        <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 64 64" className="w-6 h-6">
            <g className="fill-primary">
              <polygon points="16,20 30,32 16,44 16,39 23,32 16,25" />
              <rect x="32" y="38" width="16" height="4" rx="1" />
            </g>
          </svg>
        </div>

        {/* Search */}
        <div className="flex-1 relative flex items-center h-9 min-w-[200px]">
          <MagnifyingGlass
            className="absolute left-3 w-3.5 h-3.5 text-foreground/40 pointer-events-none"
            weight="bold"
          />
          <input
            type="text"
            className="w-full h-full bg-foreground/5 border-none rounded-[18px] pl-8 pr-20 text-foreground text-[13px] outline-none transition-colors focus:bg-foreground/10 placeholder:text-foreground/40"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <button
            className="absolute right-2 flex items-center gap-0.5 px-2 py-1 bg-foreground/8 rounded-md text-[10px] text-foreground/50 hover:bg-foreground/15 hover:text-foreground/80 transition-all cursor-pointer border-none"
            onClick={() => openPalette(true)}
            title="Open command palette"
          >
            <Command className="size-3" weight="bold" />
            <span>K</span>
          </button>
        </div>

        <div className="w-px h-5 bg-foreground/10 mx-1" />

        {/* Tags Toggle */}
        <button
          className={cn(btnBase, sidebarOpen ? btnActive : btnInactive)}
          onClick={onSidebarToggle}
          title={sidebarOpen ? 'Hide tags' : 'Show tags'}
        >
          <Tag className="size-4" weight={sidebarOpen ? 'fill' : 'regular'} />
        </button>

        <div className="w-px h-5 bg-foreground/10 mx-1" />

        {/* Gallery View Mode with Dropdown - full chevron overlay like tag tree */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                btnBase,
                viewMode === 'gallery' ? btnActive : btnInactive,
                'group',
              )}
              onClick={(e) => {
                if (viewMode !== 'gallery') {
                  e.preventDefault()
                  setViewMode('gallery')
                }
              }}
              title="Gallery view"
            >
              {/* Container for icon + chevron overlay */}
              <div className="relative flex items-center justify-center w-5 h-5">
                {/* Main gallery icon - hides on hover when in gallery mode */}
                <GalleryIcon
                  className={cn(
                    'size-4 transition-opacity',
                    viewMode === 'gallery' && 'group-hover:opacity-0',
                  )}
                  weight={viewMode === 'gallery' ? 'fill' : 'regular'}
                />
                {/* Chevron overlay - appears on hover, same size as icon container */}
                {viewMode === 'gallery' && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <CaretDown className="size-4" weight="bold" />
                  </div>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[120px]">
            <DropdownMenuCheckboxItem
              checked={galleryMode === 'default'}
              onCheckedChange={() => setGalleryMode('default')}
            >
              <SquaresFour className="size-4 mr-2" />
              Default
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={galleryMode === 'compact'}
              onCheckedChange={() => setGalleryMode('compact')}
            >
              <GridFour className="size-4 mr-2" />
              Compact
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          className={cn(
            btnBase,
            viewMode === 'table' ? btnActive : btnInactive,
          )}
          onClick={() => setViewMode('table')}
          title="Table view"
        >
          <Table
            className="size-4"
            weight={viewMode === 'table' ? 'fill' : 'regular'}
          />
        </button>

        <button
          className={cn(
            btnBase,
            viewMode === 'graph' ? btnActive : btnInactive,
          )}
          onClick={() => setViewMode('graph')}
          title="Graph view"
        >
          <Graph
            className="size-4"
            weight={viewMode === 'graph' ? 'fill' : 'regular'}
          />
        </button>

        <div className="w-px h-5 bg-foreground/10 mx-1" />

        {/* Inbox */}
        <Link
          to="/inbox"
          className={cn(btnBase, btnInactive, 'relative')}
          title="Inbox"
        >
          <TrayArrowDown className="size-4" />
          {inboxCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 bg-primary rounded-full text-[9px] font-semibold text-primary-foreground flex items-center justify-center">
              {inboxCount > 9 ? '9+' : inboxCount}
            </span>
          )}
        </Link>

        {/* Settings */}
        <Link
          to="/settings"
          className={cn(btnBase, btnInactive)}
          title="Settings"
        >
          <Gear className="size-4" />
        </Link>
      </motion.div>
    </LayoutGroup>
  )
}
