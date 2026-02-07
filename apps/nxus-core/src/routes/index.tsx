import { cn } from '@nxus/ui'
import { XIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  FloatingFilterRow,
  FloatingHud,
  FloatingThemeToggle,
  SystemTray,
} from '@/components/features/gallery/hud'
import {
  GalleryView,
  GraphView,
  TableView,
} from '@/components/features/gallery/item-views'
import { TagTree } from '@/components/features/gallery/tag-tree'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { useBatchToolHealth } from '@/hooks/use-tool-health'
import { getPendingInboxItemsServerFn } from '@/services/inbox/inbox.server'
import { useTagDataStore } from '@/stores/tag-data.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import {
  useViewModeHasHydrated,
  useViewModeStore,
} from '@/stores/view-mode.store'

export const Route = createFileRoute('/')({ component: AppManager })

function AppManager() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // View mode state
  const viewMode = useViewModeStore((s) => s.viewMode)
  const galleryMode = useViewModeStore((s) => s.galleryMode)

  // Get selected tag filters
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const includeSubTags = useTagUIStore((s) => s.includeSubTags)
  const getDescendants = useTagDataStore((s) => s.getDescendants)
  const tags = useTagDataStore((s) => s.tags)

  // Build tag filter list including descendants if needed
  // selectedTagIds are stringified integer IDs, tags Map uses number keys
  const filterTags = useMemo(() => {
    if (selectedTagIds.size === 0) return undefined

    const tagObjects: Array<{ id: number; name: string }> = []
    for (const tagIdStr of selectedTagIds) {
      const tagId = parseInt(tagIdStr, 10)
      if (isNaN(tagId)) continue

      const tag = tags.get(tagId)
      if (tag) tagObjects.push({ id: tag.id, name: tag.name })

      if (includeSubTags.get(tagIdStr)) {
        const descendants = getDescendants(tagId)
        for (const desc of descendants) {
          tagObjects.push({ id: desc.id, name: desc.name })
        }
      }
    }
    return tagObjects.length > 0 ? tagObjects : undefined
  }, [selectedTagIds, includeSubTags, getDescendants, tags])

  const { apps, allApps, loading, error } = useAppRegistry({
    searchQuery,
    filterTags,
  })

  // Trigger health checks for all tools - uses TanStack Query via domain hook
  useBatchToolHealth(allApps)

  // Fetch inbox count for HUD
  const { data: inboxResult } = useQuery({
    queryKey: ['inbox-pending-count'],
    queryFn: async () => {
      return await getPendingInboxItemsServerFn()
    },
    staleTime: 30000,
    refetchInterval: 60000,
  })
  const inboxCount = inboxResult?.success ? inboxResult.data.length : 0

  // Check if view mode has hydrated from localStorage
  const hasHydrated = useViewModeHasHydrated()

  // Prevent flash of default view before localStorage values load
  // This MUST come after all hooks to avoid "Rendered more hooks" error
  if (!hasHydrated) {
    return null
  }

  // Render content based on view mode
  const renderContent = () => {
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

    switch (viewMode) {
      case 'table':
        return <TableView items={apps} />
      case 'graph':
        return <GraphView items={allApps} searchQuery={searchQuery} />
      case 'gallery':
      default:
        return (
          <GalleryView items={apps} mode={galleryMode} groupByType={false} />
        )
    }
  }

  return (
    <div className="relative h-screen bg-background overflow-hidden">
      {/* Floating HUD */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 pointer-events-none">
        <FloatingHud
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          inboxCount={inboxCount}
        />
        <FloatingFilterRow resultCount={apps.length} />
      </div>

      {/* System Tray */}
      <SystemTray />

      {/* Floating Theme Toggle (right side) */}
      <FloatingThemeToggle />

      {/* Floating Tag Panel (overlay, not taking layout space) */}
      <div
        className={cn(
          'fixed top-[100px] left-6 bottom-20 w-[280px] bg-card backdrop-blur-xl border border-border rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(255,255,255,0.05)] z-50 flex flex-col overflow-hidden transition-all duration-300',
          sidebarOpen
            ? 'opacity-100 translate-x-0'
            : 'opacity-0 -translate-x-5 pointer-events-none',
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tags
          </span>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-transparent text-muted-foreground cursor-pointer transition-all hover:bg-muted hover:text-foreground border-none"
            onClick={() => setSidebarOpen(false)}
            title="Close"
          >
            <XIcon className="size-4" weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TagTree mode="editor" />
        </div>
      </div>

      {/* Backdrop when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
          onClick={() => {
            setSidebarOpen(false)
          }}
        />
      )}

      {/* Main content (full screen with padding for HUD) */}
      <div
        className={cn(
          'h-full flex flex-col pt-28 pb-16',
          viewMode !== 'graph' && 'overflow-y-auto',
        )}
      >
        <div
          className={cn(
            'container mx-auto px-4 py-6 flex-1',
            viewMode === 'graph' && 'p-0 max-w-none h-full',
          )}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
