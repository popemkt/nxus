/**
 * FilterSection - Toggles for node/edge filtering options
 *
 * Controls:
 * - Include Tags: Show tags as separate virtual nodes
 * - Include Refs: Treat node-type property references as connections
 * - Include Hierarchy: Show parent/child relationships
 * - Show Orphans: Include nodes with no connections
 */

import { Funnel } from '@phosphor-icons/react'
import { useGraphFilter, useGraphStore } from '../../store'
import { CollapsibleSection } from './CollapsibleSection'

interface ToggleControlProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleControl({
  label,
  description,
  checked,
  onChange,
}: ToggleControlProps) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div
          className={`
            w-8 h-4 rounded-full relative transition-colors
            ${checked ? 'bg-primary' : 'bg-muted'}
            peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50
          `}
        >
          <div
            className={`
              absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm
              transition-transform
              ${checked ? 'translate-x-4' : 'translate-x-0'}
            `}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
          {label}
        </span>
        {description && (
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {description}
          </p>
        )}
      </div>
    </label>
  )
}

/**
 * Filter control section with toggles for node/edge inclusion options.
 * Updates the graph store which affects data transformation.
 */
export function FilterSection() {
  const filter = useGraphFilter()
  const setFilter = useGraphStore((state) => state.setFilter)

  return (
    <CollapsibleSection
      title="Filters"
      icon={<Funnel className="size-3.5" />}
      defaultExpanded={false}
    >
      <ToggleControl
        label="Show Tags"
        description="Display tags as separate nodes"
        checked={filter.includeTags}
        onChange={(checked) => setFilter({ includeTags: checked })}
      />

      <ToggleControl
        label="Show References"
        description="Include property reference edges"
        checked={filter.includeRefs}
        onChange={(checked) => setFilter({ includeRefs: checked })}
      />

      <ToggleControl
        label="Show Hierarchy"
        description="Display parent/child relationships"
        checked={filter.includeHierarchy}
        onChange={(checked) => setFilter({ includeHierarchy: checked })}
      />

      <ToggleControl
        label="Show Orphans"
        description="Include nodes with no connections"
        checked={filter.showOrphans}
        onChange={(checked) => setFilter({ showOrphans: checked })}
      />
    </CollapsibleSection>
  )
}
