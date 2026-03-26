import { useMemo } from 'react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import type { ViewConfig } from '@/types/outline'
import { SupertagPill } from './supertag-pill'

interface ListViewProps {
  childIds: string[]
  depth: number
  config: ViewConfig
}

export function ListView({ childIds, depth, config }: ListViewProps) {
  const nodes = useOutlineStore((s) => s.nodes)
  const navigateToNode = useNavigateToNode()

  // Filter children
  const filteredChildIds = useMemo(() => {
    if (!config.filters || config.filters.length === 0) return childIds
    return childIds.filter((childId) => {
      const child = nodes.get(childId)
      if (!child) return false
      return config.filters!.every((filter) => {
        const field = child.fields.find((f) => f.fieldId === filter.fieldId)
        const val = field?.values[0]?.value
        const strVal = val !== undefined && val !== null ? String(val) : ''
        switch (filter.operator) {
          case 'is_empty': return !strVal
          case 'is_not_empty': return !!strVal
          case 'equals': return strVal === (filter.value ?? '')
          case 'not_equals': return strVal !== (filter.value ?? '')
          case 'contains': return strVal.toLowerCase().includes((filter.value ?? '').toLowerCase())
          default: return true
        }
      })
    })
  }, [childIds, nodes, config.filters])

  // Sort
  const sortedChildIds = useMemo(() => {
    if (!config.sortByFieldId) return filteredChildIds
    const fieldId = config.sortByFieldId
    const dir = config.sortDirection === 'desc' ? -1 : 1
    return [...filteredChildIds].sort((a, b) => {
      const nodeA = nodes.get(a)
      const nodeB = nodes.get(b)
      const valA = nodeA?.fields.find((f) => f.fieldId === fieldId)?.values[0]?.value
      const valB = nodeB?.fields.find((f) => f.fieldId === fieldId)?.values[0]?.value
      const strA = String(valA ?? '')
      const strB = String(valB ?? '')
      const cmp = strA.localeCompare(strB) * dir
      if (cmp !== 0) return cmp
      return a.localeCompare(b)
    })
  }, [filteredChildIds, nodes, config.sortByFieldId, config.sortDirection])

  if (childIds.length === 0) return null

  return (
    <div
      className="list-view"
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {sortedChildIds.map((childId) => {
        const child = nodes.get(childId)
        if (!child) return null
        return (
          <div
            key={childId}
            className={cn(
              'flex items-center gap-2 py-1 px-1',
              'border-b border-foreground/[0.03]',
              'hover:bg-foreground/[0.02] transition-colors duration-75',
              'cursor-pointer',
            )}
            onClick={() => navigateToNode(childId)}
          >
            {/* Bullet dot */}
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/15 shrink-0" />

            {/* Name */}
            <span className="text-[13px] text-foreground/70 truncate flex-1 min-w-0">
              {child.content || <span className="text-foreground/20 italic">Untitled</span>}
            </span>

            {/* Supertag badges */}
            {child.supertags.map((tag) => (
              <SupertagPill key={tag.id} tag={tag} size="sm" showIcon={false} className="shrink-0" />
            ))}

            {/* Inline field summaries */}
            {child.fields
              .filter((f) => f.values[0]?.value)
              .slice(0, 2)
              .map((f) => (
                <span
                  key={f.fieldId}
                  className="text-[10px] text-foreground/25 truncate shrink-0 max-w-[100px]"
                >
                  {String(f.values[0]?.value ?? '')}
                </span>
              ))}
          </div>
        )
      })}
    </div>
  )
}
