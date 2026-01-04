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
    .map((id) => tags.get(id))
    .filter(Boolean)

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
          const includesSubTags = includeSubTags.get(tag.id) ?? false

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
                onClick={() => setIncludeSubTags(tag.id, !includesSubTags)}
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
                onClick={() => toggleSelected(tag.id)}
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

  // No filters = return all
  if (selectedTagIds.size === 0) {
    return items
  }

  // Build the set of tag IDs to match
  const matchTagIds = new Set<string>()
  for (const tagId of selectedTagIds) {
    matchTagIds.add(tagId)
    if (includeSubTags.get(tagId)) {
      // Add all descendants
      const descendants = getDescendants(tagId)
      for (const desc of descendants) {
        matchTagIds.add(desc.id)
      }
    }
  }

  // Filter items: item must have ALL selected tag groups
  // For "include sub-tags", any of the parent+descendants counts as a match for that group
  return items.filter((item) => {
    if (!item.tags || item.tags.length === 0) return false

    // For now, AND logic: must have at least one tag from the filter set
    // This can be enhanced to true AND (must have tags from each selected group)
    return item.tags.some((t) => matchTagIds.has(t))
  })
}
