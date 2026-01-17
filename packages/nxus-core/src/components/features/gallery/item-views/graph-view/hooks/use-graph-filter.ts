import { useMemo } from 'react'
import type { Item } from '@/types/item'

export interface GraphFilterResult {
  matchedIds: Set<string>
  hasActiveFilter: boolean
}

interface UseGraphFilterProps {
  items: Item[]
  searchQuery: string
  selectedTagIds: Set<string>
  /** Map of string tagId to tag slug for matching against metadata.tags */
  tagSlugs: Map<string, string>
}

export function useGraphFilter({
  items,
  searchQuery,
  selectedTagIds,
  tagSlugs,
}: UseGraphFilterProps): GraphFilterResult {
  return useMemo(() => {
    const hasActiveFilter = searchQuery.trim() !== '' || selectedTagIds.size > 0

    if (!hasActiveFilter) {
      return {
        matchedIds: new Set(items.map((i) => i.id)),
        hasActiveFilter: false,
      }
    }

    const lowerQuery = searchQuery.toLowerCase().trim()
    // Get slugs for selected tags to match against app's metadata.tags
    const selectedTagSlugs = new Set(
      Array.from(selectedTagIds)
        .map((id) => tagSlugs.get(id) || '')
        .filter(Boolean),
    )

    const matchedIds = new Set<string>()

    items.forEach((item) => {
      let matchesSearch = true
      let matchesTags = true

      // Check search query
      if (lowerQuery) {
        matchesSearch =
          item.name.toLowerCase().includes(lowerQuery) ||
          item.description.toLowerCase().includes(lowerQuery) ||
          item.metadata.tags.some((tag) =>
            tag.name.toLowerCase().includes(lowerQuery),
          )
      }

      // Check tag filters (match slugs against metadata.tags)
      if (selectedTagSlugs.size > 0) {
        matchesTags = item.metadata.tags.some((tag) =>
          selectedTagSlugs.has(tag.id.toString()),
        )
      }

      if (matchesSearch && matchesTags) {
        matchedIds.add(item.id)
      }
    })

    return { matchedIds, hasActiveFilter }
  }, [items, searchQuery, selectedTagIds, tagSlugs])
}
