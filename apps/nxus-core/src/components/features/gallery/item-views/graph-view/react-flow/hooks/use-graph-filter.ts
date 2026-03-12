import { useMemo } from 'react'
import type { Item } from '@nxus/db'

export interface GraphFilterResult {
  matchedIds: Set<string>
  hasActiveFilter: boolean
}

interface UseGraphFilterProps {
  items: Array<Item>
  searchQuery: string
  selectedTagIds: Set<string>
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
    const selectedTagSlugs = new Set(
      Array.from(selectedTagIds)
        .map((id) => tagSlugs.get(id) || '')
        .filter(Boolean),
    )

    const matchedIds = new Set<string>()

    items.forEach((item) => {
      let matchesSearch = true
      let matchesTags = true

      if (lowerQuery) {
        matchesSearch =
          item.name.toLowerCase().includes(lowerQuery) ||
          item.description.toLowerCase().includes(lowerQuery) ||
          item.metadata.tags.some((tag: { name: string }) =>
            tag.name.toLowerCase().includes(lowerQuery),
          )
      }

      if (selectedTagSlugs.size > 0) {
        matchesTags = item.metadata.tags.some((tag: { id: string | number }) =>
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
