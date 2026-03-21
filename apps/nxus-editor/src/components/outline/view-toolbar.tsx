import { useCallback, useMemo, useState } from 'react'
import { ListBullets, Table, Kanban, FunnelSimple, SortAscending, StackSimple } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { ViewMode, ViewConfig, OutlineField } from '@/types/outline'

interface ViewToolbarProps {
  viewMode: ViewMode
  viewConfig: ViewConfig
  fields: OutlineField[]
  onViewModeChange: (mode: ViewMode) => void
  onViewConfigChange: (config: ViewConfig) => void
}

const viewIcons: Record<ViewMode, React.ComponentType<{ size: number; weight?: 'bold' | 'regular' }>> = {
  outline: ListBullets,
  table: Table,
  kanban: Kanban,
}

const viewLabels: Record<ViewMode, string> = {
  outline: 'List',
  table: 'Table',
  kanban: 'Board',
}

export function ViewToolbar({ viewMode, viewConfig, fields, onViewModeChange, onViewConfigChange }: ViewToolbarProps) {
  const [showConfig, setShowConfig] = useState(false)

  // Unique fields across children for grouping/sorting
  const fieldOptions = useMemo(
    () => fields.filter((f, i, arr) => arr.findIndex((x) => x.fieldId === f.fieldId) === i),
    [fields],
  )

  const handleGroupChange = useCallback(
    (fieldId: string) => {
      onViewConfigChange({
        ...viewConfig,
        groupByFieldId: fieldId || undefined,
      })
    },
    [viewConfig, onViewConfigChange],
  )

  const handleSortChange = useCallback(
    (fieldId: string) => {
      onViewConfigChange({
        ...viewConfig,
        sortByFieldId: fieldId || undefined,
      })
    },
    [viewConfig, onViewConfigChange],
  )

  const handleSortDirToggle = useCallback(() => {
    onViewConfigChange({
      ...viewConfig,
      sortDirection: viewConfig.sortDirection === 'desc' ? 'asc' : 'desc',
    })
  }, [viewConfig, onViewConfigChange])

  return (
    <div className="view-toolbar flex items-center gap-0.5 mb-1">
      {/* View mode buttons */}
      <div className="flex items-center rounded-md bg-foreground/[0.04] p-0.5">
        {(['outline', 'table', 'kanban'] as const).map((mode) => {
          const Icon = viewIcons[mode]
          return (
            <button
              key={mode}
              type="button"
              className={cn(
                'flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                'transition-colors duration-100 select-none cursor-pointer',
                viewMode === mode
                  ? 'bg-foreground/10 text-foreground/70'
                  : 'text-foreground/30 hover:text-foreground/50',
              )}
              onClick={() => onViewModeChange(mode)}
              title={viewLabels[mode]}
            >
              <Icon size={12} weight={viewMode === mode ? 'bold' : 'regular'} />
              <span>{viewLabels[mode]}</span>
            </button>
          )
        })}
      </div>

      {/* Config toggle */}
      {viewMode !== 'outline' && (
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px]',
            'transition-colors cursor-pointer select-none',
            showConfig
              ? 'bg-foreground/8 text-foreground/60'
              : 'text-foreground/25 hover:text-foreground/40',
          )}
          onClick={() => setShowConfig((o) => !o)}
          title="View settings"
        >
          <FunnelSimple size={12} />
        </button>
      )}

      {/* Inline config row */}
      {showConfig && viewMode !== 'outline' && (
        <div className="flex items-center gap-2 ml-1 text-[11px] text-foreground/40">
          {/* Sort */}
          <span className="flex items-center gap-1">
            <SortAscending size={11} />
            <select
              className="bg-transparent border-none text-[11px] text-foreground/50 outline-none cursor-pointer"
              value={viewConfig.sortByFieldId ?? ''}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              <option value="">No sort</option>
              {fieldOptions.map((f) => (
                <option key={f.fieldId} value={f.fieldId}>
                  {f.fieldName}
                </option>
              ))}
            </select>
            {viewConfig.sortByFieldId && (
              <button
                type="button"
                className="text-foreground/30 hover:text-foreground/50"
                onClick={handleSortDirToggle}
              >
                {viewConfig.sortDirection === 'desc' ? 'Z-A' : 'A-Z'}
              </button>
            )}
          </span>

          {/* Group (kanban) */}
          {viewMode === 'kanban' && (
            <span className="flex items-center gap-1">
              <StackSimple size={11} />
              <select
                className="bg-transparent border-none text-[11px] text-foreground/50 outline-none cursor-pointer"
                value={viewConfig.groupByFieldId ?? ''}
                onChange={(e) => handleGroupChange(e.target.value)}
              >
                <option value="">Group by…</option>
                {fieldOptions
                  .filter((f) => f.fieldType === 'select' || f.fieldType === 'boolean')
                  .map((f) => (
                    <option key={f.fieldId} value={f.fieldId}>
                      {f.fieldName}
                    </option>
                  ))}
              </select>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
