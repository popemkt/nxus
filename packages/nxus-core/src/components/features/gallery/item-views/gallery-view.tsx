import { Link } from '@tanstack/react-router'
import type { Item } from '@nxus/db'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@nxus/ui'
import { Badge } from '@nxus/ui'
import { Button } from '@nxus/ui'
import {
  ArrowRightIcon,
  CheckCircle,
  Tag,
  XCircle,
} from '@phosphor-icons/react'
import {
  APP_TYPE_ICONS,
  APP_TYPE_LABELS_SHORT,
  STATUS_VARIANTS,
  getFirstTypeIcon,
  getTypeBadges,
  hasMultipleTypes,
} from '@/lib/app-constants'
import { useToolHealth } from '@/hooks/use-tool-health'
import { useState } from 'react'
import { cn } from '@nxus/ui'
import type { GalleryMode } from '@/stores/view-mode.store'
import { TagEditorModal } from '../modals/tag-editor-modal'

interface GalleryViewProps {
  items: Item[]
  mode: GalleryMode
  groupByType?: boolean
}

// Thumbnail component with fallback paths
function ThumbnailWithFallback({
  appId,
  appName,
  compact,
}: {
  appId: string
  appName: string
  compact?: boolean
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  )
  const [src, setSrc] = useState(`/thumbnails/${appId}.svg`)

  const containerClass = cn(
    'w-full overflow-hidden bg-muted',
    compact ? 'aspect-[3/2]' : 'aspect-video',
  )

  if (status === 'loading') {
    return (
      <div
        className={containerClass}
        style={{ viewTransitionName: `app-thumbnail-${appId}` }}
      >
        <img
          src={src}
          alt={appName}
          className="h-full w-full object-cover"
          onLoad={() => setStatus('loaded')}
          onError={() => {
            if (src.endsWith('.svg')) {
              setSrc(`/thumbnails/${appId}.png`)
            } else {
              setStatus('error')
            }
          }}
        />
      </div>
    )
  }

  if (status === 'error') return null

  return (
    <div className={containerClass}>
      <img
        src={src}
        alt={appName}
        className="h-full w-full object-cover"
        style={{ viewTransitionName: `app-thumbnail-${appId}` }}
      />
    </div>
  )
}

// Individual card component
function ItemCard({ app, compact }: { app: Item; compact: boolean }) {
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false)
  const TypeIcon = getFirstTypeIcon(app)
  const typeBadges = getTypeBadges(app)
  const isTool = app.types?.includes('tool') ?? false
  const hasCheckCommand = isTool && 'checkCommand' in app && !!app.checkCommand

  // Health check for tools - uses TanStack Query via domain hook
  const healthCheck = useToolHealth(app, hasCheckCommand)
  const isCheckingHealth = hasCheckCommand && healthCheck.isLoading

  return (
    <>
      <div className="group relative">
        {/* Quick action buttons - visible on hover */}
        <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsTagEditorOpen(true)
            }}
            className="p-1.5 rounded-md bg-background/80 backdrop-blur-sm border shadow-sm hover:bg-accent transition-colors"
            title="Edit Tags"
            aria-label="Edit tags"
          >
            <Tag className="h-4 w-4" />
          </button>
        </div>

        <Card
          className={cn(
            'flex flex-col h-full overflow-hidden transition-all hover:ring-2 hover:ring-primary/20',
            compact && 'text-sm',
            'pt-0',
          )}
        >
          {app.thumbnail ? (
            <div
              className={cn(
                'w-full overflow-hidden bg-muted',
                compact ? 'aspect-[3/2]' : 'aspect-video',
              )}
            >
              <img
                src={app.thumbnail}
                alt={app.name}
                className="h-full w-full object-cover"
                style={{ viewTransitionName: `app-thumbnail-${app.id}` }}
              />
            </div>
          ) : (
            <ThumbnailWithFallback
              appId={app.id}
              appName={app.name}
              compact={compact}
            />
          )}

          <CardHeader className={cn('flex-1', compact && 'p-3')}>
            <div className="flex items-start justify-between gap-2">
              <CardTitle
                className={cn('line-clamp-1', compact && 'text-sm')}
                style={{ viewTransitionName: `app-title-${app.id}` }}
              >
                {app.name}
              </CardTitle>
              <TypeIcon
                className={cn(
                  'shrink-0 text-muted-foreground',
                  compact ? 'h-4 w-4' : 'h-5 w-5',
                )}
              />
            </div>
            {!compact && (
              <CardDescription className="line-clamp-2">
                {app.description}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className={compact ? 'p-3 pt-0' : undefined}>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={STATUS_VARIANTS[app.status]}
                className={compact ? 'text-xs' : undefined}
              >
                {app.status.replace('-', ' ')}
              </Badge>
              {/* Show all type badges */}
              {typeBadges.map((badge) => (
                <Badge
                  key={badge.type}
                  variant={badge.isFirst ? 'secondary' : 'outline'}
                  className={compact ? 'text-xs' : undefined}
                >
                  {badge.label}
                </Badge>
              ))}

              {isTool && isCheckingHealth && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1.5 animate-pulse"
                >
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-ping" />
                  Checking
                </Badge>
              )}

              {hasCheckCommand && !isCheckingHealth && healthCheck && (
                <Badge
                  variant={healthCheck.isInstalled ? 'default' : 'destructive'}
                  className="flex items-center gap-1 animate-fade-in"
                >
                  {healthCheck.isInstalled ? (
                    <>
                      <CheckCircle className="h-3 w-3" weight="fill" />
                      {!compact && 'Installed'}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" weight="fill" />
                      {!compact && 'Not Found'}
                    </>
                  )}
                </Badge>
              )}

              {hasCheckCommand &&
                healthCheck?.isInstalled &&
                healthCheck.version &&
                !compact && (
                  <Badge
                    variant="outline"
                    className="font-mono text-xs animate-fade-in"
                  >
                    {healthCheck.version}
                  </Badge>
                )}

              {!isTool && !compact && (
                <>
                  {app.metadata.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag.id} variant="outline">
                      {tag.name}
                    </Badge>
                  ))}
                  {app.metadata.tags.length > 2 && (
                    <Badge variant="outline">
                      +{app.metadata.tags.length - 2}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </CardContent>

          <CardFooter className={compact ? 'p-3 pt-0' : undefined}>
            <Link
              to="/apps/$appId"
              params={{ appId: app.id }}
              className="w-full"
            >
              <Button
                variant="ghost"
                size={compact ? 'sm' : 'default'}
                className="w-full text-muted-foreground hover:text-foreground"
                aria-label="View details"
              >
                <ArrowRightIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                {!compact && 'View Details'}
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>

      <TagEditorModal
        open={isTagEditorOpen}
        onOpenChange={setIsTagEditorOpen}
        app={app}
      />
    </>
  )
}

export function GalleryView({
  items,
  mode,
  groupByType = false,
}: GalleryViewProps) {
  const compact = mode === 'compact'

  const gridClass = cn(
    'grid gap-4',
    compact
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    compact && 'gap-3',
  )

  if (!groupByType) {
    return (
      <div className={gridClass}>
        {items.map((app) => (
          <ItemCard key={app.id} app={app} compact={compact} />
        ))}
      </div>
    )
  }

  // Items appear in ALL applicable groups based on their types array
  const tools = items.filter((app) => app.types?.includes('tool'))
  const repos = items.filter((app) => app.types?.includes('remote-repo'))
  const typescriptApps = items.filter((app) => app.types?.includes('typescript'))
  const htmlApps = items.filter((app) => app.types?.includes('html'))

  // For now, show Tools vs Applications (combining repos, typescript, html)
  // Items with multiple types will appear in multiple sections
  const applications = items.filter((app) =>
    app.types?.some(t => t !== 'tool')
  )

  return (
    <div className="space-y-8">
      {tools.length > 0 && (
        <section>
          <h2
            className={cn(
              'mb-4 font-semibold',
              compact ? 'text-lg' : 'text-xl',
            )}
          >
            Tools & Dependencies
          </h2>
          <div className={gridClass}>
            {tools.map((app) => (
              <ItemCard key={`tool-${app.id}`} app={app} compact={compact} />
            ))}
          </div>
        </section>
      )}

      {applications.length > 0 && (
        <section>
          <h2
            className={cn(
              'mb-4 font-semibold',
              compact ? 'text-lg' : 'text-xl',
            )}
          >
            Applications
          </h2>
          <div className={gridClass}>
            {applications.map((app) => (
              <ItemCard key={`app-${app.id}`} app={app} compact={compact} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
