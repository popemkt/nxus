import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import {
  MagnifyingGlassIcon,
  GearIcon,
  SidebarSimple,
} from '@phosphor-icons/react'
import type { App } from '@/types/app'
import { Input } from '@/components/ui/input'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { OsBadge } from '@/components/os-badge'
import { DevModeBadge } from '@/components/dev-mode-badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { openApp } from '@/lib/app-actions'
import { useBatchItemStatus } from '@/hooks/use-item-status-check'
import { GlitchText } from '@/components/ui/glitch-text'
import { DecodeText } from '@/components/ui/decode-text'
import { InboxButton } from '@/components/inbox-button'
import { TagTree, TagFilterBar } from '@/components/tag-tree'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { useTagDataStore } from '@/stores/tag-data.store'
import { useViewModeStore } from '@/stores/view-mode.store'
import { cn } from '@/lib/utils'
import {
  GalleryView,
  TableView,
  GraphView,
  ViewModeSwitcher,
} from '@/components/item-views'

export const Route = createFileRoute('/')({ component: AppManager })

function AppManager() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // View mode state
  const viewMode = useViewModeStore((s) => s.viewMode)
  const galleryMode = useViewModeStore((s) => s.galleryMode)

  // Get selected tag filters
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const includeSubTags = useTagUIStore((s) => s.includeSubTags)
  const getDescendants = useTagDataStore((s) => s.getDescendants)
  const tags = useTagDataStore((s) => s.tags)

  // Build tag filter list including descendants if needed
  const filterTags = useMemo(() => {
    if (selectedTagIds.size === 0) return undefined

    const tagNames: string[] = []
    for (const tagId of selectedTagIds) {
      const tag = tags.get(tagId)
      if (tag) tagNames.push(tag.name)
      if (includeSubTags.get(tagId)) {
        const descendants = getDescendants(tagId)
        for (const desc of descendants) {
          tagNames.push(desc.name)
        }
      }
    }
    return tagNames.length > 0 ? tagNames : undefined
  }, [selectedTagIds, includeSubTags, getDescendants, tags])

  const { apps, allApps, loading, error } = useAppRegistry({
    searchQuery,
    filterTags,
  })

  // Trigger health checks for all tools
  useBatchItemStatus(allApps)

  const handleOpen = (app: App) => {
    openApp(app)
  }

  const handleInstall = (app: App) => {
    console.log('Install app:', app)
  }

  // Render content based on view mode
  const renderContent = () => {
    // Show error state
    if (error) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-medium text-destructive">
              Error loading apps
            </p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        </div>
      )
    }

    // Show empty state (only when not loading)
    if (!loading && apps.length === 0) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No apps found
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Add apps to get started'}
            </p>
          </div>
        </div>
      )
    }

    // Render based on view mode
    switch (viewMode) {
      case 'table':
        return <TableView items={apps} />
      case 'graph':
        // Pass allApps for graph so highlight mode can show all nodes (dimmed)
        return <GraphView items={allApps} searchQuery={searchQuery} />
      case 'gallery':
      default:
        return (
          <GalleryView items={apps} mode={galleryMode} groupByType={false} />
        )
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <GlitchText
                text="> nXus_"
                className="text-4xl font-mono text-green-500 
                    [text-shadow:0_0_8px_rgba(34,197,94,0.4),2px_0_rgba(239,68,68,0.7),-2px_0_rgba(59,130,246,0.7)] 
                    tracking-tight hover:text-white transition-colors cursor-default select-none font-bold"
              />
              <DecodeText
                text="Command the chaos"
                className="text-muted-foreground mt-2 font-medium tracking-wide font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <ViewModeSwitcher />
              <DevModeBadge />
              <OsBadge />
              <ThemeToggle />
              <InboxButton />
              <Link
                to="/settings"
                className="rounded-md p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Settings"
              >
                <GearIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search apps by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Collapsible Filter Sidebar */}
        <aside
          className={cn(
            'border-r bg-background flex-shrink-0 transition-all duration-200 overflow-hidden',
            sidebarOpen ? 'w-64' : 'w-0',
          )}
        >
          {/* Sidebar content */}
          <div className="w-64 h-full overflow-y-auto">
            <TagTree mode="editor" />
          </div>
        </aside>

        {/* Unified pill toggle - always visible, position depends on sidebar state */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 z-10 bg-muted/80 hover:bg-muted border rounded-full p-1.5 cursor-pointer transition-all shadow-sm',
            sidebarOpen ? 'left-60' : 'left-0 rounded-l-none border-l-0',
          )}
          title={sidebarOpen ? 'Hide filters' : 'Show filters'}
        >
          <SidebarSimple className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {/* Main content */}
        <div
          className={cn(
            'flex-1 flex flex-col',
            viewMode !== 'graph' && 'overflow-y-auto',
          )}
        >
          {/* Filter bar */}
          <TagFilterBar />
          <div
            className={cn(
              'container mx-auto px-4 py-6 flex-1',
              viewMode === 'graph' && 'p-0 max-w-none',
            )}
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
