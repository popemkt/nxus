import { Badge } from '@nxus/ui'
import type { TagRef } from '@nxus/db'

interface TruncatedTagsListProps {
  tags: Array<TagRef>
  limit?: number
  className?: string
}

export function TruncatedTagsList({ tags, limit = 2, className }: TruncatedTagsListProps) {
  if (!tags || tags.length === 0) return null

  return (
    <>
      {tags.slice(0, limit).map((tag) => (
        <Badge key={tag.id} variant="outline" className={className}>
          {tag.name}
        </Badge>
      ))}
      {tags.length > limit && (
        <Badge variant="outline" className={className}>
          +{tags.length - limit}
        </Badge>
      )}
    </>
  )
}
