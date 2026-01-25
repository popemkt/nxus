/**
 * RendererSwitcher - Toggle between 2D and 3D graph renderers
 *
 * Provides a segmented button control for switching between
 * the 2D (React Flow) and 3D (3d-force-graph) renderers.
 */

import { Cube, Hexagon } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'

import { useGraphStore, useGraphView } from '../store'
import type { RendererType } from '../store/types'
import { preloadForceGraph3D } from '../renderers/graph-3d'

export interface RendererSwitcherProps {
  /** Additional classes */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md'
}

interface RendererOption {
  value: RendererType
  label: string
  icon: React.ReactNode
}

const RENDERER_OPTIONS: RendererOption[] = [
  {
    value: '2d',
    label: '2D',
    icon: <Hexagon className="size-3.5" weight="duotone" />,
  },
  {
    value: '3d',
    label: '3D',
    icon: <Cube className="size-3.5" weight="duotone" />,
  },
]

/**
 * Segmented button control for switching between 2D and 3D renderers.
 * Updates the view.renderer setting in the graph store.
 */
export function RendererSwitcher({
  className,
  size = 'md',
}: RendererSwitcherProps) {
  const view = useGraphView()
  const setView = useGraphStore((state) => state.setView)

  const handleSwitch = (renderer: RendererType) => {
    if (renderer !== view.renderer) {
      setView({ renderer })
    }
  }

  const buttonClasses = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5'

  return (
    <div
      className={cn(
        'inline-flex rounded-md border border-border bg-muted/30 p-0.5',
        className,
      )}
      role="radiogroup"
      aria-label="Select graph renderer"
    >
      {RENDERER_OPTIONS.map((option) => {
        const isActive = view.renderer === option.value
        // Preload 3D library when hovering over the 3D button
        const handleMouseEnter = option.value === '3d'
          ? () => preloadForceGraph3D()
          : undefined
        return (
          <button
            key={option.value}
            onClick={() => handleSwitch(option.value)}
            onMouseEnter={handleMouseEnter}
            className={cn(
              'flex items-center rounded-sm transition-all',
              buttonClasses,
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
            )}
            role="radio"
            aria-checked={isActive}
            title={`Switch to ${option.label} view`}
          >
            {option.icon}
            <span className="font-medium">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
