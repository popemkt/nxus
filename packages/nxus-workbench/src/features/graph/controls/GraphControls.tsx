/**
 * GraphControls - Main control panel container for graph view
 *
 * Features:
 * - Floating panel (top-right corner)
 * - Contains all control sections (Physics, Display, Filter, LocalGraph)
 * - Reset to defaults button
 * - Toggleable visibility
 */

import {
  ArrowCounterClockwise,
  GearSix,
  X,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useState } from 'react'

import { useGraphStore } from '../store'
import {
  DisplaySection,
  FilterSection,
  LocalGraphSection,
  PhysicsSection,
} from './sections'

export interface GraphControlsProps {
  /** Additional classes for positioning */
  className?: string
  /** Initial visibility state */
  defaultOpen?: boolean
}

/**
 * Floating control panel for graph visualization settings.
 * Contains all configuration sections and a reset button.
 */
export function GraphControls({
  className,
  defaultOpen = true,
}: GraphControlsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const resetToDefaults = useGraphStore((state) => state.resetToDefaults)

  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'flex items-center justify-center',
          'size-9 rounded-lg',
          'bg-background/95 backdrop-blur-sm',
          'border border-border shadow-md',
          'hover:bg-muted/80 transition-colors',
          className,
        )}
        title="Open graph controls"
      >
        <GearSix className="size-4 text-muted-foreground" />
      </button>
    )
  }

  // Expanded state - full control panel
  return (
    <div
      className={cn(
        'w-64 max-h-[80vh] overflow-y-auto',
        'bg-background/95 backdrop-blur-sm',
        'border border-border rounded-lg shadow-lg',
        'flex flex-col',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <GearSix className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Graph Settings</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded hover:bg-muted/80 transition-colors"
          title="Close panel"
        >
          <X className="size-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Control Sections */}
      <div className="flex-1 overflow-y-auto">
        <PhysicsSection />
        <DisplaySection />
        <FilterSection />
        <LocalGraphSection />
      </div>

      {/* Footer with Reset Button */}
      <div className="px-3 py-2 border-t border-border">
        <button
          onClick={resetToDefaults}
          className={cn(
            'w-full flex items-center justify-center gap-2',
            'px-3 py-1.5 rounded-md text-xs',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted/50 transition-colors',
          )}
          title="Reset all settings to defaults"
        >
          <ArrowCounterClockwise className="size-3.5" />
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
