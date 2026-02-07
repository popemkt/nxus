/**
 * RelationFilterEditor - Editor for relation/relationship filters
 *
 * Allows configuring relationship type and optional target node.
 */

import { useState, useEffect } from 'react'
import { Check, LinkSimple, MagnifyingGlass } from '@phosphor-icons/react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import type { RelationFilter } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface RelationFilterEditorProps {
  /** The relation filter being edited */
  filter: RelationFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<RelationFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Relation type options with descriptions
 */
const RELATION_TYPES = [
  {
    value: 'childOf' as const,
    label: 'Child of',
    description: 'Nodes that are children of a target node',
  },
  {
    value: 'ownedBy' as const,
    label: 'Owned by',
    description: 'Nodes owned by a target node (same as child of)',
  },
  {
    value: 'linksTo' as const,
    label: 'Links to',
    description: 'Nodes that have a reference to a target node',
  },
  {
    value: 'linkedFrom' as const,
    label: 'Linked from',
    description: 'Nodes that are referenced by a target node (backlinks)',
  },
] as const

// ============================================================================
// Component
// ============================================================================

export function RelationFilterEditor({
  filter,
  onUpdate,
  onClose,
}: RelationFilterEditorProps) {
  const [relationType, setRelationType] = useState(filter.relationType || 'childOf')
  const [targetNodeId, setTargetNodeId] = useState(filter.targetNodeId || '')

  // Update local state when filter changes
  useEffect(() => {
    setRelationType(filter.relationType || 'childOf')
    setTargetNodeId(filter.targetNodeId || '')
  }, [filter])

  // Get selected relation info
  const selectedRelation = RELATION_TYPES.find((r) => r.value === relationType)

  // Handle relation type change
  const handleRelationTypeChange = (value: string | null) => {
    if (!value) return
    const newRelationType = value as RelationFilter['relationType']
    setRelationType(newRelationType)
    onUpdate({ relationType: newRelationType })
  }

  // Handle target node ID change
  const handleTargetNodeIdChange = (value: string) => {
    setTargetNodeId(value)
  }

  // Handle save
  const handleSave = () => {
    onUpdate({
      relationType,
      targetNodeId: targetNodeId.trim() || undefined,
    })
    onClose()
  }

  // Handle enter key in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <LinkSimple className="size-3.5" weight="bold" />
        Relation Filter
      </div>

      {/* Relation type selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Relationship</Label>
        <Select value={relationType} onValueChange={handleRelationTypeChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedRelation?.label || 'Select relationship'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RELATION_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Target node ID input */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Target Node ID (optional)
        </Label>
        <div className="relative">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={targetNodeId}
            onChange={(e) => handleTargetNodeIdChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Leave empty for 'any'"
            className="w-full pl-8"
          />
        </div>
        <p className="text-[10px] text-muted-foreground/70">
          Enter a specific node ID, or leave empty to match any {selectedRelation?.label.toLowerCase() || 'relationship'}.
        </p>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70 border-t border-border pt-2">
        {selectedRelation?.description || 'Find nodes based on their relationships to other nodes.'}
      </p>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" size="sm" onClick={handleSave}>
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}
