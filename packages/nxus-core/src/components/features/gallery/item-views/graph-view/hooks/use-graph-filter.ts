import { useMemo } from 'react'
import type { App } from '@/types/app'

export interface GraphFilterResult {
  matchedIds: Set<string>
  hasActiveFilter: boolean
}

interface UseGraphFilterProps {
  items: App[]
  searchQuery: string
  selectedTagIds: Set<string>
  tagNames: Map<string, string> // tagId -> tagName
}

export function useGraphFilter({
  items,
  searchQuery,
  selectedTagIds,
  tagNames,
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
    const selectedTagNames = new Set(
      Array.from(selectedTagIds)
        .map((id) => tagNames.get(id) || '')
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
            tag.toLowerCase().includes(lowerQuery),
          )
      }

      // Check tag filters
      if (selectedTagNames.size > 0) {
        matchesTags = item.metadata.tags.some((tag) =>
          selectedTagNames.has(tag),
        )
      }

      if (matchesSearch && matchesTags) {
        matchedIds.add(item.id)
      }
    })

    return { matchedIds, hasActiveFilter }
  }, [items, searchQuery, selectedTagIds, tagNames])
}
