import { X, CaretDown, Funnel } from '@phosphor-icons/react'
import { useTagDataStore } from '@/stores/tag-data.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { cn } from '@/lib/utils'

interface TagFilterBarProps {
  className?: string
}

/**
 * TagFilterBar - Displays active tag filters as chips
 */
export function TagFilterBar({ className }: TagFilterBarProps) {
  const tags = useTagDataStore((s) => s.tags)
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const includeSubTags = useTagUIStore((s) => s.includeSubTags)
  const toggleSelected = useTagUIStore((s) => s.toggleSelected)
  const setIncludeSubTags = useTagUIStore((s) => s.setIncludeSubTags)
  const clearSelection = useTagUIStore((s) => s.clearSelection)

  // No filters active
  if (selectedTagIds.size === 0) {
    return null
  }

  const selectedTags = Array.from(selectedTagIds)
    .map((idStr) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) return null
      const tag = tags.get(id)
      if (!tag) return null
      return { ...tag, idStr } // Add string ID for UI operations
    })
    .filter(Boolean) as Array<{
    id: number
    idStr: string
    name: string
    slug: string
  }>

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b bg-muted/30',
        className,
      )}
    >
      <Funnel size={14} className="text-muted-foreground" weight="duotone" />

      <div className="flex flex-wrap gap-1.5 flex-1">
        {selectedTags.map((tag) => {
          if (!tag) return null
          const includesSubTags = includeSubTags.get(tag.idStr) ?? false

          return (
            <div
              key={tag.id}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                'bg-primary/10 text-primary border border-primary/20',
              )}
            >
              <span>{tag.name}</span>

              {/* Include sub-tags dropdown */}
              <button
                onClick={() => setIncludeSubTags(tag.idStr, !includesSubTags)}
                className={cn(
                  'flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-primary/20 transition-colors',
                  includesSubTags && 'bg-primary/20',
                )}
                title={
                  includesSubTags ? 'Including sub-tags' : 'Include sub-tags'
                }
              >
                <CaretDown size={10} />
                {includesSubTags && <span className="text-[10px]">+sub</span>}
              </button>

              {/* Remove button */}
              <button
                onClick={() => toggleSelected(tag.idStr)}
                className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                title="Remove filter"
              >
                <X size={10} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Clear all */}
      <button
        onClick={clearSelection}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear
      </button>
    </div>
  )
}

/**
 * Hook to filter items based on selected tags
 */
export function useTagFilter<T extends { tags?: string[] }>(items: T[]): T[] {
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const includeSubTags = useTagUIStore((s) => s.includeSubTags)
  const getDescendants = useTagDataStore((s) => s.getDescendants)
  const tags = useTagDataStore((s) => s.tags)

  // No filters = return all
  if (selectedTagIds.size === 0) {
    return items
  }

  // Build the set of tag slugs to match
  const matchTagSlugs = new Set<string>()
  for (const tagIdStr of selectedTagIds) {
    const tagId = parseInt(tagIdStr, 10)
    if (isNaN(tagId)) continue

    const tag = tags.get(tagId)
    if (tag) matchTagSlugs.add(tag.slug)

    if (includeSubTags.get(tagIdStr)) {
      // Add all descendants
      const descendants = getDescendants(tagId)
      for (const desc of descendants) {
        matchTagSlugs.add(desc.slug)
      }
    }
  }

  // Filter items: item must have at least one tag from the filter set
  return items.filter((item) => {
    if (!item.tags || item.tags.length === 0) return false
    return item.tags.some((t) => matchTagSlugs.has(t))
  })
}
