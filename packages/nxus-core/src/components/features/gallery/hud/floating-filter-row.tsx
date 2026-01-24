import { X, TreeStructure } from '@phosphor-icons/react'
import { useTagDataStore } from '@/stores/tag-data.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { cn } from '@nxus/ui'

interface FloatingFilterRowProps {
  resultCount?: number
  className?: string
}

/**
 * Floating row of filter pills that appears below the HUD when filters are active.
 */
export function FloatingFilterRow({
  resultCount,
  className,
}: FloatingFilterRowProps) {
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const toggleSelected = useTagUIStore((s) => s.toggleSelected)
  const clearSelection = useTagUIStore((s) => s.clearSelection)
  const includeSubTags = useTagUIStore((s) => s.includeSubTags)
  const setIncludeSubTags = useTagUIStore((s) => s.setIncludeSubTags)
  const tags = useTagDataStore((s) => s.tags)

  if (selectedTagIds.size === 0) {
    return null
  }

  const selectedTags = Array.from(selectedTagIds)
    .map((idStr) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) return null
      const tag = tags.get(id)
      if (!tag) return null
      return {
        id: idStr, // Keep string ID for UI state operations
        name: tag.name,
        includeChildren: includeSubTags.get(idStr) ?? true,
      }
    })
    .filter(Boolean) as Array<{
    id: string
    name: string
    includeChildren: boolean
  }>

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300',
        className,
      )}
    >
      {selectedTags.map((tag) => (
        <div
          key={tag.id}
          className="flex items-center gap-1.5 h-7 px-3 bg-primary/15 backdrop-blur-xl border border-primary/30 radius-button text-[11px] text-primary shadow-md"
        >
          <span>{tag.name}</span>

          {/* Sub-tags toggle */}
          <button
            className={cn(
              'flex items-center justify-center p-0 bg-transparent border-none cursor-pointer transition-all opacity-40 hover:opacity-80',
              tag.includeChildren && 'opacity-100 text-primary',
            )}
            onClick={() => setIncludeSubTags(tag.id, !tag.includeChildren)}
            title={
              tag.includeChildren
                ? 'Click to exclude sub-tags'
                : 'Click to include sub-tags'
            }
          >
            <TreeStructure
              className="size-3"
              weight={tag.includeChildren ? 'fill' : 'regular'}
            />
          </button>

          {/* Remove button */}
          <button
            className="flex items-center justify-center p-0 bg-transparent border-none cursor-pointer transition-opacity opacity-50 hover:opacity-100"
            onClick={() => toggleSelected(tag.id)}
            title={`Remove ${tag.name} filter`}
          >
            <X className="size-3" weight="bold" />
          </button>
        </div>
      ))}

      {/* Result count pill */}
      {resultCount !== undefined && (
        <div className="flex items-center h-7 px-3 bg-background/80 backdrop-blur-xl border border-foreground/10 radius-button text-[11px] text-foreground/40 shadow-md">
          <span>
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </span>
        </div>
      )}

      {/* Clear all button */}
      {selectedTags.length > 1 && (
        <button
          className="h-7 px-3 bg-transparent border border-dashed border-foreground/20 radius-button text-[11px] text-foreground/40 cursor-pointer transition-all hover:border-foreground/40 hover:text-foreground/70"
          onClick={clearSelection}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
