import { useMemo } from 'react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import type { ViewConfig } from '@/types/outline'

interface CardsViewProps {
  childIds: string[]
  depth: number
  config: ViewConfig
}

export function CardsView({ childIds, depth, config }: CardsViewProps) {
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
      className="cards-view pb-2"
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
        {sortedChildIds.map((childId) => {
          const child = nodes.get(childId)
          if (!child) return null
          return (
            <div
              key={childId}
              className={cn(
                'rounded-lg px-3 py-2.5',
                'bg-foreground/[0.02] border border-foreground/[0.06]',
                'hover:border-foreground/10 transition-colors duration-75',
                'cursor-pointer',
              )}
              onClick={() => navigateToNode(childId)}
            >
              <div className="text-[13px] text-foreground/70 leading-snug line-clamp-3 font-medium">
                {child.content || <span className="text-foreground/20 italic">Untitled</span>}
              </div>

              {/* Supertag badges */}
              {child.supertags.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  {child.supertags.map((tag) => (
                    <span
                      key={tag.id}
                      className="text-[10px] rounded-sm px-1 py-px font-medium"
                      style={
                        tag.color
                          ? { backgroundColor: `${tag.color}18`, color: tag.color }
                          : undefined
                      }
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Key fields */}
              {child.fields
                .filter((f) => f.values[0]?.value)
                .slice(0, 3)
                .map((f) => (
                  <div
                    key={f.fieldId}
                    className="flex items-center gap-1 mt-1 text-[10px] text-foreground/30"
                  >
                    <span className="font-medium">{f.fieldName}:</span>
                    <span className="truncate">{String(f.values[0]?.value ?? '')}</span>
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
