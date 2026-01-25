/**
 * DisplaySection - Dropdowns and options for visual styling
 *
 * Controls:
 * - Color By: What property to use for node coloring (supertag, type, none)
 * - Node Labels: When to show labels (always, hover, never)
 * - Node Size: How to size nodes (uniform, connections)
 * - Edge Style: Edge rendering style (solid, animated)
 */

import { Palette } from '@phosphor-icons/react'
import { useGraphDisplay, useGraphStore } from '../../store'
import type {
  ColorByOption,
  EdgeStyleOption,
  LabelVisibility,
  NodeSizeOption,
} from '../../store/types'
import { CollapsibleSection } from './CollapsibleSection'

interface SelectControlProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectControlProps<T>) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-2 py-1.5 text-xs bg-muted/50 border border-border rounded-md
          focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
          cursor-pointer appearance-none
          bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')]
          bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const COLOR_BY_OPTIONS: Array<{ value: ColorByOption; label: string }> = [
  { value: 'supertag', label: 'Supertag' },
  { value: 'type', label: 'Node Type' },
  { value: 'none', label: 'None (Monochrome)' },
]

const LABEL_VISIBILITY_OPTIONS: Array<{ value: LabelVisibility; label: string }> = [
  { value: 'always', label: 'Always' },
  { value: 'hover', label: 'On Hover' },
  { value: 'never', label: 'Never' },
]

const NODE_SIZE_OPTIONS: Array<{ value: NodeSizeOption; label: string }> = [
  { value: 'connections', label: 'By Connections' },
  { value: 'uniform', label: 'Uniform' },
]

const EDGE_STYLE_OPTIONS: Array<{ value: EdgeStyleOption; label: string }> = [
  { value: 'animated', label: 'Animated (Direction)' },
  { value: 'solid', label: 'Static' },
]

/**
 * Display control section with dropdowns for visual styling options.
 * Updates the graph store which affects rendering.
 */
export function DisplaySection() {
  const display = useGraphDisplay()
  const setDisplay = useGraphStore((state) => state.setDisplay)

  return (
    <CollapsibleSection
      title="Display"
      icon={<Palette className="size-3.5" />}
      defaultExpanded={false}
    >
      <SelectControl
        label="Color By"
        value={display.colorBy}
        options={COLOR_BY_OPTIONS}
        onChange={(value) => setDisplay({ colorBy: value })}
      />

      <SelectControl
        label="Node Labels"
        value={display.nodeLabels}
        options={LABEL_VISIBILITY_OPTIONS}
        onChange={(value) => setDisplay({ nodeLabels: value })}
      />

      <SelectControl
        label="Node Size"
        value={display.nodeSize}
        options={NODE_SIZE_OPTIONS}
        onChange={(value) => setDisplay({ nodeSize: value })}
      />

      <SelectControl
        label="Edge Style"
        value={display.edgeStyle}
        options={EDGE_STYLE_OPTIONS}
        onChange={(value) => setDisplay({ edgeStyle: value })}
      />
    </CollapsibleSection>
  )
}
