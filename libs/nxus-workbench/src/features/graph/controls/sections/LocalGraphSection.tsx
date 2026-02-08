/**
 * LocalGraphSection - Controls for local graph (ego network) mode
 *
 * Controls:
 * - Enable/Disable toggle
 * - Depth selector (1, 2, 3 degrees of separation)
 * - Link type checkboxes (outgoing, incoming, both)
 * - Focus node indicator
 */

import { GitBranch, X } from '@phosphor-icons/react'
import { useGraphLocalGraph, useGraphStore } from '../../store'
import type { LinkTraversalType } from '../../provider/types'
import { CollapsibleSection } from './CollapsibleSection'

interface DepthButtonProps {
  depth: 1 | 2 | 3
  selected: boolean
  onClick: () => void
}

function DepthButton({ depth, selected, onClick }: DepthButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 text-xs rounded-md transition-colors
        ${selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }
      `}
    >
      {depth}
    </button>
  )
}

interface LinkTypeCheckboxProps {
  type: LinkTraversalType
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function LinkTypeCheckbox({
  type: _type,
  label,
  checked,
  onChange,
}: LinkTypeCheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-border text-primary
          focus:ring-2 focus:ring-primary/50 focus:ring-offset-0
          bg-muted/50 cursor-pointer"
      />
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
    </label>
  )
}

/**
 * Local graph control section for ego network (BFS) traversal.
 * Shows nodes within N degrees of the focus node.
 */
export function LocalGraphSection() {
  const localGraph = useGraphLocalGraph()
  const setLocalGraph = useGraphStore((state) => state.setLocalGraph)

  const hasOutgoing = localGraph.linkTypes.includes('outgoing')
  const hasIncoming = localGraph.linkTypes.includes('incoming')
  const hasBoth = localGraph.linkTypes.includes('both')

  const toggleLinkType = (type: LinkTraversalType, enabled: boolean) => {
    let newTypes = [...localGraph.linkTypes]

    if (enabled) {
      // Add the type if not present
      if (!newTypes.includes(type)) {
        newTypes.push(type)
      }
    } else {
      // Remove the type
      newTypes = newTypes.filter((t) => t !== type)
      // Ensure at least one type is selected
      if (newTypes.length === 0) {
        newTypes = ['outgoing'] // Default to outgoing if nothing selected
      }
    }

    setLocalGraph({ linkTypes: newTypes })
  }

  const clearFocusNode = () => {
    setLocalGraph({ enabled: false, focusNodeId: null })
  }

  return (
    <CollapsibleSection
      title="Local Graph"
      icon={<GitBranch className="size-3.5" />}
      defaultExpanded={false}
    >
      {/* Enable Toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer group">
        <div className="pt-0.5">
          <input
            type="checkbox"
            checked={localGraph.enabled}
            onChange={(e) => setLocalGraph({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div
            className={`
              w-8 h-4 rounded-full relative transition-colors
              ${localGraph.enabled ? 'bg-primary' : 'bg-muted'}
              peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50
            `}
          >
            <div
              className={`
                absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm
                transition-transform
                ${localGraph.enabled ? 'translate-x-4' : 'translate-x-0'}
              `}
            />
          </div>
        </div>
        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
          Enable Local Graph
        </span>
      </label>

      {/* Focus Node Indicator */}
      {localGraph.focusNodeId && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-md">
          <span className="text-[10px] text-muted-foreground">Focus:</span>
          <span className="text-xs font-mono truncate flex-1">
            {localGraph.focusNodeId.slice(0, 12)}...
          </span>
          <button
            onClick={clearFocusNode}
            className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
            title="Clear focus node"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {!localGraph.focusNodeId && (
        <div className="text-[10px] text-muted-foreground italic px-2 py-1.5 bg-muted/30 rounded-md">
          Click a node to set focus
        </div>
      )}

      {/* Depth Selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Depth (degrees of separation)
        </label>
        <div className="flex gap-1.5">
          <DepthButton
            depth={1}
            selected={localGraph.depth === 1}
            onClick={() => setLocalGraph({ depth: 1 })}
          />
          <DepthButton
            depth={2}
            selected={localGraph.depth === 2}
            onClick={() => setLocalGraph({ depth: 2 })}
          />
          <DepthButton
            depth={3}
            selected={localGraph.depth === 3}
            onClick={() => setLocalGraph({ depth: 3 })}
          />
        </div>
      </div>

      {/* Link Type Checkboxes */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Follow Link Types
        </label>
        <div className="space-y-1.5 pl-1">
          <LinkTypeCheckbox
            type="outgoing"
            label="Outgoing (→)"
            checked={hasOutgoing}
            onChange={(checked) => toggleLinkType('outgoing', checked)}
          />
          <LinkTypeCheckbox
            type="incoming"
            label="Incoming (←)"
            checked={hasIncoming}
            onChange={(checked) => toggleLinkType('incoming', checked)}
          />
          <LinkTypeCheckbox
            type="both"
            label="Both (↔)"
            checked={hasBoth}
            onChange={(checked) => toggleLinkType('both', checked)}
          />
        </div>
      </div>
    </CollapsibleSection>
  )
}
