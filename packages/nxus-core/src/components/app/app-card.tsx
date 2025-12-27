import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { App } from '@/types/app'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  APP_TYPE_ICONS,
  APP_TYPE_LABELS_SHORT,
  STATUS_VARIANTS,
} from '@/lib/app-constants'

// Component that tries to load thumbnail from fallback paths
function ThumbnailWithFallback({
  appId,
  appName,
}: {
  appId: string
  appName: string
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  )
  const [src, setSrc] = useState(`/thumbnails/${appId}.svg`)

  const containerClass = 'aspect-video w-full overflow-hidden bg-muted'

  // Loading state - show container with transition name to prevent flash
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

  // Error state - return null (no thumbnail exists)
  if (status === 'error') {
    return null
  }

  // Loaded state
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

interface AppCardProps {
  app: App
  onOpen?: (app: App) => void
  onInstall?: (app: App) => void
}

export function AppCard({ app }: AppCardProps) {
  const TypeIcon = APP_TYPE_ICONS[app.type]

  return (
    <Card className="flex flex-col overflow-hidden transition-all hover:ring-2 hover:ring-primary/20">
      {/* Show thumbnail only if explicitly defined or fallback exists */}
      {app.thumbnail ? (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={app.thumbnail}
            alt={app.name}
            className="h-full w-full object-cover"
            style={{ viewTransitionName: `app-thumbnail-${app.id}` }}
          />
        </div>
      ) : (
        <ThumbnailWithFallback appId={app.id} appName={app.name} />
      )}

      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle
            className="line-clamp-1"
            style={{ viewTransitionName: `app-title-${app.id}` }}
          >
            {app.name}
          </CardTitle>
          <TypeIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
        <CardDescription className="line-clamp-2">
          {app.description}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant={STATUS_VARIANTS[app.status]}>
            {app.status.replace('-', ' ')}
          </Badge>
          <Badge variant="secondary">{APP_TYPE_LABELS_SHORT[app.type]}</Badge>
          {app.metadata.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {app.metadata.tags.length > 2 && (
            <Badge variant="outline">+{app.metadata.tags.length - 2}</Badge>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Link
          to="/apps/$appId"
          params={{ appId: app.id }}
          viewTransition
          className="w-full"
        >
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
          >
            <ArrowRightIcon className="h-5 w-5" />
            View Details
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
