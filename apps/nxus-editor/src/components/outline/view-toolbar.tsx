import { useCallback, useMemo, useState } from 'react'
import {
  ListBullets,
  Table,
  Kanban,
  FunnelSimple,
  SortAscending,
  StackSimple,
  SquaresFour,
  Rows,
  Funnel,
  Eye,
  EyeSlash,
  X,
  Plus,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { ViewMode, ViewConfig, ViewFilter, OutlineField } from '@/types/outline'

interface ViewToolbarProps {
  viewMode: ViewMode
  viewConfig: ViewConfig
  fields: OutlineField[]
  onViewModeChange: (mode: ViewMode) => void
  onViewConfigChange: (config: ViewConfig) => void
}

const VIEW_MODES: { mode: ViewMode; icon: React.ComponentType<{ size: number; weight?: 'bold' | 'regular' }>; label: string }[] = [
  { mode: 'outline', icon: ListBullets, label: 'List' },
  { mode: 'table', icon: Table, label: 'Table' },
  { mode: 'kanban', icon: Kanban, label: 'Board' },
  { mode: 'cards', icon: SquaresFour, label: 'Cards' },
  { mode: 'list', icon: Rows, label: 'Compact' },
]

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

  const handleAddFilter = useCallback(() => {
    const first = fieldOptions[0]
    if (!first) return
    const newFilter: ViewFilter = { fieldId: first.fieldId, operator: 'is_not_empty' }
    onViewConfigChange({
      ...viewConfig,
      filters: [...(viewConfig.filters ?? []), newFilter],
    })
  }, [viewConfig, fieldOptions, onViewConfigChange])

  const handleUpdateFilter = useCallback(
    (idx: number, patch: Partial<ViewFilter>) => {
      const filters = [...(viewConfig.filters ?? [])]
      filters[idx] = { ...filters[idx]!, ...patch }
      onViewConfigChange({ ...viewConfig, filters })
    },
    [viewConfig, onViewConfigChange],
  )

  const handleRemoveFilter = useCallback(
    (idx: number) => {
      const filters = (viewConfig.filters ?? []).filter((_, i) => i !== idx)
      onViewConfigChange({ ...viewConfig, filters })
    },
    [viewConfig, onViewConfigChange],
  )

  const handleToggleColumnVisibility = useCallback(
    (fieldId: string) => {
      const current = viewConfig.visibleFieldIds
      if (!current || current.length === 0) {
        // Currently showing all — toggle means hide this one
        const allIds = fieldOptions.map((f) => f.fieldId)
        onViewConfigChange({
          ...viewConfig,
          visibleFieldIds: allIds.filter((id) => id !== fieldId),
        })
      } else if (current.includes(fieldId)) {
        const updated = current.filter((id) => id !== fieldId)
        // If removing the last one, reset to show all
        onViewConfigChange({
          ...viewConfig,
          visibleFieldIds: updated.length === 0 ? undefined : updated,
        })
      } else {
        onViewConfigChange({
          ...viewConfig,
          visibleFieldIds: [...current, fieldId],
        })
      }
    },
    [viewConfig, fieldOptions, onViewConfigChange],
  )

  const activeFilterCount = viewConfig.filters?.length ?? 0

  return (
    <div className="view-toolbar mb-1">
      <div className="flex items-center gap-0.5">
        {/* View mode buttons */}
        <div className="flex items-center rounded-md bg-foreground/[0.04] p-0.5">
          {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
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
              title={label}
            >
              <Icon size={12} weight={viewMode === mode ? 'bold' : 'regular'} />
              <span>{label}</span>
            </button>
          ))}
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
            {activeFilterCount > 0 && (
              <span className="text-[9px] bg-foreground/10 text-foreground/50 rounded-full px-1 min-w-[14px] text-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Config panel */}
      {showConfig && viewMode !== 'outline' && (
        <div className="mt-1 pl-1 space-y-1.5 text-[11px] text-foreground/40">
          {/* Sort */}
          <div className="flex items-center gap-2">
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

          {/* Filters */}
          <div className="space-y-1">
            {(viewConfig.filters ?? []).map((filter, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Funnel size={10} className="shrink-0 text-foreground/25" />
                <select
                  className="bg-transparent text-[10px] text-foreground/50 outline-none cursor-pointer"
                  value={filter.fieldId}
                  onChange={(e) => handleUpdateFilter(idx, { fieldId: e.target.value })}
                >
                  {fieldOptions.map((f) => (
                    <option key={f.fieldId} value={f.fieldId}>{f.fieldName}</option>
                  ))}
                </select>
                <select
                  className="bg-transparent text-[10px] text-foreground/50 outline-none cursor-pointer"
                  value={filter.operator}
                  onChange={(e) => handleUpdateFilter(idx, { operator: e.target.value as ViewFilter['operator'] })}
                >
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                  <option value="contains">contains</option>
                  <option value="is_empty">is empty</option>
                  <option value="is_not_empty">is not empty</option>
                </select>
                {filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty' && (
                  <input
                    type="text"
                    value={filter.value ?? ''}
                    onChange={(e) => handleUpdateFilter(idx, { value: e.target.value })}
                    placeholder="value…"
                    className="bg-transparent text-[10px] text-foreground/50 outline-none border-b border-foreground/[0.06] px-1 py-0.5 w-16"
                  />
                )}
                <button
                  type="button"
                  className="text-foreground/20 hover:text-foreground/50 p-0.5"
                  onClick={() => handleRemoveFilter(idx)}
                >
                  <X size={9} weight="bold" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-foreground/25 hover:text-foreground/40"
              onClick={handleAddFilter}
            >
              <Plus size={9} weight="bold" />
              Add filter
            </button>
          </div>

          {/* Column visibility (table/list views) */}
          {(viewMode === 'table' || viewMode === 'list') && fieldOptions.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] text-foreground/25 font-medium">Columns</div>
              <div className="flex flex-wrap gap-1">
                {fieldOptions.map((f) => {
                  const visible = !viewConfig.visibleFieldIds || viewConfig.visibleFieldIds.length === 0 || viewConfig.visibleFieldIds.includes(f.fieldId)
                  return (
                    <button
                      key={f.fieldId}
                      type="button"
                      className={cn(
                        'flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[10px]',
                        'transition-colors cursor-pointer',
                        visible
                          ? 'bg-foreground/[0.06] text-foreground/50'
                          : 'text-foreground/20 hover:text-foreground/35',
                      )}
                      onClick={() => handleToggleColumnVisibility(f.fieldId)}
                    >
                      {visible ? <Eye size={9} /> : <EyeSlash size={9} />}
                      {f.fieldName}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
