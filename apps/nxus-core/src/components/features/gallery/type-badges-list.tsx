import { Badge } from '@nxus/ui'
import type { Item } from '@nxus/db'
import { getTypeBadges } from '@/lib/app-constants'

interface TypeBadgesListProps {
  item: Pick<Item, 'types'>
  showIcons?: boolean
  className?: string
}

export function TypeBadgesList({ item, showIcons = false, className }: TypeBadgesListProps) {
  const badges = getTypeBadges(item)

  return (
    <>
      {badges.map((badge) => {
        const TypeIcon = badge.icon
        return (
          <Badge
            key={badge.type}
            variant={badge.isFirst ? 'secondary' : 'outline'}
            className={showIcons ? `flex items-center gap-1 ${className ?? ''}` : className}
          >
            {showIcons && <TypeIcon className="h-3 w-3" />}
            {badge.label}
          </Badge>
        )
      })}
    </>
  )
}
