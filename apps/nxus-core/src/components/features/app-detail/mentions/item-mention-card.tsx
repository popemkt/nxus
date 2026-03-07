import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { Card, cn } from '@nxus/ui'
import type { Item } from '@nxus/db'
import { getFirstTypeIcon } from '@/lib/app-constants'
import { TypeBadgesList } from '@/components/features/gallery/type-badges-list'

function MentionThumbnail({ item }: { item: Item }) {
  const base = import.meta.env.BASE_URL || '/'
  const [src, setSrc] = React.useState(
    item.thumbnail || `${base}thumbnails/${item.id}.svg`,
  )
  const [failed, setFailed] = React.useState(false)

  if (failed) return null

  return (
    <img
      src={src}
      alt={item.name}
      className="h-12 w-12 shrink-0 rounded-md object-cover bg-muted"
      onError={() => {
        if (!item.thumbnail && src.endsWith('.svg')) {
          setSrc(`${base}thumbnails/${item.id}.png`)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

interface ItemMentionCardProps {
  item: Item
  className?: string
}

export function ItemMentionCard({ item, className }: ItemMentionCardProps) {
  const TypeIcon = getFirstTypeIcon(item)

  return (
    <Card
      size="sm"
      className={cn(
        'flex-row items-center gap-3 px-3 py-2',
        className,
      )}
    >
      <MentionThumbnail item={item} />

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium leading-none">
          <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{item.name}</span>
        </span>
        {item.description && (
          <span className="text-xs text-muted-foreground line-clamp-1">
            {item.description}
          </span>
        )}
        <div className="flex flex-wrap gap-1">
          <TypeBadgesList item={item} />
        </div>
      </div>

      <Link
        to="/apps/$appId"
        params={{ appId: item.id }}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={`View ${item.name}`}
      >
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  )
}
