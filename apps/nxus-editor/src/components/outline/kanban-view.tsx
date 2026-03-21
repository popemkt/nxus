import { useCallback, useMemo, useState } from 'react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { setFieldValueServerFn } from '@/services/outline.server'
import type { ViewConfig } from '@/types/outline'

interface KanbanViewProps {
  childIds: string[]
  depth: number
  config: ViewConfig
}

const UNCATEGORIZED = '__uncategorized__'

export function KanbanView({ childIds, depth, config }: KanbanViewProps) {
  const nodes = useOutlineStore((s) => s.nodes)
  const navigateToNode = useNavigateToNode()
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const groupFieldId = config.groupByFieldId

  // Collect distinct group values from children
  const groups = useMemo(() => {
    if (!groupFieldId) return [{ key: UNCATEGORIZED, label: 'All' }]

    const seen = new Map<string, string>()
    for (const childId of childIds) {
      const child = nodes.get(childId)
      if (!child) continue
      const field = child.fields.find((f) => f.fieldId === groupFieldId)
      const val = field?.values[0]?.value
      if (val !== undefined && val !== null && val !== '') {
        const key = String(val)
        if (!seen.has(key)) seen.set(key, key)
      }
    }

    const result = Array.from(seen.entries()).map(([key, label]) => ({ key, label }))
    result.push({ key: UNCATEGORIZED, label: 'Uncategorized' })
    return result
  }, [childIds, nodes, groupFieldId])

  // Group children into columns
  const columns = useMemo(() => {
    const grouped = new Map<string, string[]>()
    for (const g of groups) grouped.set(g.key, [])

    for (const childId of childIds) {
      const child = nodes.get(childId)
      if (!child) continue
      const field = child.fields.find((f) => f.fieldId === groupFieldId)
      const val = field?.values[0]?.value
      const key = val !== undefined && val !== null && val !== '' ? String(val) : UNCATEGORIZED
      const list = grouped.get(key)
      if (list) {
        list.push(childId)
      } else {
        // Value not in predefined groups — add to uncategorized
        const uncatList = grouped.get(UNCATEGORIZED)
        if (uncatList) uncatList.push(childId)
      }
    }

    return groups.map((g) => ({
      ...g,
      childIds: grouped.get(g.key) ?? [],
    }))
  }, [groups, childIds, nodes, groupFieldId])

  // Handle drag-and-drop between columns
  const handleDrop = useCallback(
    (targetGroupKey: string) => {
      if (!draggedId || !groupFieldId) return
      const newValue = targetGroupKey === UNCATEGORIZED ? '' : targetGroupKey
      // Optimistic update
      useOutlineStore.getState().updateFieldValue(draggedId, groupFieldId, newValue)
      // Persist
      setFieldValueServerFn({ data: { nodeId: draggedId, fieldId: groupFieldId, value: newValue } }).catch((err) => {
        console.error('[kanban] Failed to update field:', err)
      })
      setDraggedId(null)
    },
    [draggedId, groupFieldId],
  )

  if (!groupFieldId) {
    return (
      <div
        className="px-4 py-3 text-[12px] text-foreground/30 italic"
        style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      >
        Select a field to group by in the view settings.
      </div>
    )
  }

  return (
    <div
      className="kanban-view overflow-x-auto pb-4"
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex gap-3 min-w-min">
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              'kanban-column flex flex-col rounded-lg',
              'bg-foreground/[0.02] min-w-[200px] max-w-[280px] w-[240px]',
            )}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(col.key)
            }}
          >
            {/* Column header */}
            <div className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-foreground/40 select-none">
              <span className="truncate">{col.label}</span>
              <span className="text-foreground/20 text-[10px]">{col.childIds.length}</span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-1 px-1.5 pb-2 min-h-[40px]">
              {col.childIds.map((childId) => {
                const child = nodes.get(childId)
                if (!child) return null
                return (
                  <div
                    key={childId}
                    className={cn(
                      'kanban-card rounded-md px-2.5 py-2',
                      'bg-background border border-foreground/[0.06]',
                      'hover:border-foreground/10 transition-colors duration-75',
                      'cursor-grab active:cursor-grabbing',
                      draggedId === childId && 'opacity-40',
                    )}
                    draggable
                    onDragStart={() => setDraggedId(childId)}
                    onDragEnd={() => setDraggedId(null)}
                  >
                    <div
                      className="text-[13px] text-foreground/70 leading-snug line-clamp-2 cursor-pointer hover:text-foreground/90"
                      onClick={() => navigateToNode(childId)}
                    >
                      {child.content || <span className="text-foreground/20 italic">Untitled</span>}
                    </div>

                    {/* Show supertag badges */}
                    {child.supertags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
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

                    {/* Show a few key fields */}
                    {child.fields
                      .filter((f) => f.fieldId !== groupFieldId && f.values[0]?.value)
                      .slice(0, 2)
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
        ))}
      </div>
    </div>
  )
}
