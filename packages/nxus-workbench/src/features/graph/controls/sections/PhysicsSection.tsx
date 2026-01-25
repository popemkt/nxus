/**
 * PhysicsSection - Sliders for force simulation parameters
 *
 * Controls:
 * - Center Force: Pull toward center (0-1)
 * - Repel Force: Push nodes apart (0-500)
 * - Link Force: Connection tightness (0-1)
 * - Link Distance: Target edge length (50-300)
 */

import { Atom } from '@phosphor-icons/react'
import { useGraphPhysics, useGraphStore } from '../../store'
import { PHYSICS_CONSTRAINTS } from '../../store/defaults'
import { CollapsibleSection } from './CollapsibleSection'

interface SliderControlProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  unit?: string
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = '',
}: SliderControlProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono text-foreground/80">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:hover:bg-primary/80
          [&::-webkit-slider-thumb]:transition-colors
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-primary
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:hover:bg-primary/80"
      />
    </div>
  )
}

/**
 * Physics control section with sliders for force simulation parameters.
 * Updates the graph store which affects both 2D and 3D renderers.
 */
export function PhysicsSection() {
  const physics = useGraphPhysics()
  const setPhysics = useGraphStore((state) => state.setPhysics)

  return (
    <CollapsibleSection
      title="Physics"
      icon={<Atom className="size-3.5" />}
      defaultExpanded={true}
    >
      <SliderControl
        label="Center Force"
        value={physics.centerForce}
        min={PHYSICS_CONSTRAINTS.centerForce.min}
        max={PHYSICS_CONSTRAINTS.centerForce.max}
        step={PHYSICS_CONSTRAINTS.centerForce.step}
        onChange={(value) => setPhysics({ centerForce: value })}
      />

      <SliderControl
        label="Repel Force"
        value={physics.repelForce}
        min={PHYSICS_CONSTRAINTS.repelForce.min}
        max={PHYSICS_CONSTRAINTS.repelForce.max}
        step={PHYSICS_CONSTRAINTS.repelForce.step}
        onChange={(value) => setPhysics({ repelForce: value })}
      />

      <SliderControl
        label="Link Force"
        value={physics.linkForce}
        min={PHYSICS_CONSTRAINTS.linkForce.min}
        max={PHYSICS_CONSTRAINTS.linkForce.max}
        step={PHYSICS_CONSTRAINTS.linkForce.step}
        onChange={(value) => setPhysics({ linkForce: value })}
      />

      <SliderControl
        label="Link Distance"
        value={physics.linkDistance}
        min={PHYSICS_CONSTRAINTS.linkDistance.min}
        max={PHYSICS_CONSTRAINTS.linkDistance.max}
        step={PHYSICS_CONSTRAINTS.linkDistance.step}
        onChange={(value) => setPhysics({ linkDistance: value })}
        unit="px"
      />
    </CollapsibleSection>
  )
}
