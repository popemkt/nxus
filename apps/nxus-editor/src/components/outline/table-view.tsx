import { useCallback, useMemo } from 'react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { setFieldValueServerFn } from '@/services/outline.server'
import { FieldValue } from './field-value'
import type { OutlineField, ViewConfig } from '@/types/outline'

interface TableViewProps {
  childIds: string[]
  depth: number
  config: ViewConfig
}

const DEFAULT_COL_WIDTH = 140
const NAME_COL_WIDTH = 220

export function TableView({ childIds, depth, config }: TableViewProps) {
  const nodes = useOutlineStore((s) => s.nodes)
  const navigateToNode = useNavigateToNode()

  // Collect all unique fields from children to build columns
  const columns = useMemo(() => {
    const fieldMap = new Map<string, OutlineField>()
    for (const childId of childIds) {
      const child = nodes.get(childId)
      if (!child) continue
      for (const f of child.fields) {
        if (!fieldMap.has(f.fieldId)) {
          fieldMap.set(f.fieldId, f)
        }
      }
    }
    let cols = Array.from(fieldMap.values())
    // Filter to visibleFieldIds if configured
    if (config.visibleFieldIds && config.visibleFieldIds.length > 0) {
      const visible = new Set(config.visibleFieldIds)
      cols = cols.filter((c) => visible.has(c.fieldId))
    }
    return cols
  }, [childIds, nodes, config.visibleFieldIds])

  // Sort children by config
  const sortedChildIds = useMemo(() => {
    if (!config.sortByFieldId) return childIds
    const fieldId = config.sortByFieldId
    const dir = config.sortDirection === 'desc' ? -1 : 1
    return [...childIds].sort((a, b) => {
      const nodeA = nodes.get(a)
      const nodeB = nodes.get(b)
      const valA = nodeA?.fields.find((f) => f.fieldId === fieldId)?.values[0]?.value
      const valB = nodeB?.fields.find((f) => f.fieldId === fieldId)?.values[0]?.value
      const strA = String(valA ?? '')
      const strB = String(valB ?? '')
      return strA.localeCompare(strB) * dir
    })
  }, [childIds, nodes, config.sortByFieldId, config.sortDirection])

  const handleFieldChange = useCallback(
    (childNodeId: string, fieldId: string, value: unknown) => {
      useOutlineStore.getState().updateFieldValue(childNodeId, fieldId, value)
      setFieldValueServerFn({ data: { nodeId: childNodeId, fieldId, value } }).catch((err) => {
        console.error('[table] Failed to update field:', err)
      })
    },
    [],
  )

  if (childIds.length === 0) return null

  return (
    <div
      className="table-view overflow-x-auto"
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="inline-block min-w-full">
        {/* Header */}
        <div className="flex items-center border-b border-foreground/[0.06] text-[11px] font-medium text-foreground/35 select-none">
          <div
            className="shrink-0 px-2 py-1.5"
            style={{ width: NAME_COL_WIDTH }}
          >
            Name
          </div>
          {columns.map((col) => (
            <div
              key={col.fieldId}
              className="shrink-0 px-2 py-1.5 truncate"
              style={{ width: config.columnWidths?.[col.fieldId] ?? DEFAULT_COL_WIDTH }}
            >
              {col.fieldName}
            </div>
          ))}
        </div>

        {/* Rows */}
        {sortedChildIds.map((childId) => {
          const child = nodes.get(childId)
          if (!child) return null
          return (
            <div
              key={childId}
              className={cn(
                'flex items-center border-b border-foreground/[0.03]',
                'hover:bg-foreground/[0.02] transition-colors duration-75',
              )}
              data-node-id={childId}
            >
              {/* Name cell */}
              <div
                className="shrink-0 px-2 py-1 text-[13px] text-foreground/70 truncate cursor-pointer hover:text-foreground/90"
                style={{ width: NAME_COL_WIDTH }}
                onClick={() => navigateToNode(childId)}
                title={child.content || 'Untitled'}
              >
                {child.content || <span className="text-foreground/20 italic">Untitled</span>}
              </div>

              {/* Field cells */}
              {columns.map((col) => {
                const field = child.fields.find((f) => f.fieldId === col.fieldId)
                const value =
                  field?.fieldType === 'nodes'
                    ? field.values
                        .flatMap((v) => (Array.isArray(v.value) ? v.value : [v.value]))
                        .filter(Boolean)
                    : field?.values?.[0]?.value

                return (
                  <div
                    key={col.fieldId}
                    className="shrink-0 px-2 py-0.5"
                    style={{ width: config.columnWidths?.[col.fieldId] ?? DEFAULT_COL_WIDTH }}
                  >
                    {field ? (
                      <FieldValue
                        fieldType={field.fieldType}
                        fieldNodeId={field.fieldNodeId}
                        value={value}
                        onChange={(v) => handleFieldChange(childId, field.fieldId, v)}
                      />
                    ) : (
                      <span className="text-foreground/10 text-[12px]">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
