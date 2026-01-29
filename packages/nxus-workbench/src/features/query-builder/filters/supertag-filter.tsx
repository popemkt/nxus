/**
 * SupertagFilterEditor - Editor for supertag filters
 *
 * Allows selecting a supertag and configuring inheritance.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TreeStructure, Check } from '@phosphor-icons/react'
import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import { getQuerySupertagsServerFn } from '../../../server/query.server.js'
import type { SupertagFilter, AssembledNode } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface SupertagFilterEditorProps {
  /** The supertag filter being edited */
  filter: SupertagFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<SupertagFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Component
// ============================================================================

export function SupertagFilterEditor({
  filter,
  onUpdate,
  onClose,
}: SupertagFilterEditorProps) {
  const [localValue, setLocalValue] = useState(filter.supertagId || '')
  const [includeInherited, setIncludeInherited] = useState(
    filter.includeInherited ?? true,
  )

  // Fetch available supertags
  const { data: supertagsData, isLoading } = useQuery({
    queryKey: ['query-supertags'],
    queryFn: () => getQuerySupertagsServerFn(),
  })

  const supertags: AssembledNode[] = supertagsData?.supertags || []

  // Update local state when filter changes
  useEffect(() => {
    setLocalValue(filter.supertagId || '')
    setIncludeInherited(filter.includeInherited ?? true)
  }, [filter])

  // Handle save
  const handleSave = () => {
    if (localValue) {
      onUpdate({
        supertagId: localValue,
        includeInherited,
      })
    }
    onClose()
  }

  // Handle supertag selection change
  const handleSupertagChange = (value: string | null) => {
    if (!value) return
    setLocalValue(value)
    // Auto-save on selection for better UX
    onUpdate({
      supertagId: value,
      includeInherited,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <div className="text-xs font-medium text-foreground">
        Supertag Filter
      </div>

      {/* Supertag selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Supertag</Label>
        <Select
          value={localValue || undefined}
          onValueChange={handleSupertagChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {localValue ? (
                <span className="flex items-center gap-2">
                  <span className="text-primary">#</span>
                  {formatSupertagName(localValue)}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {isLoading ? 'Loading...' : 'Select supertag'}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {supertags.map((supertag: AssembledNode) => (
              <SelectItem
                key={supertag.systemId || supertag.id}
                value={supertag.systemId || supertag.id}
              >
                <span className="flex items-center gap-2">
                  <span className="text-primary">#</span>
                  {formatSupertagName(supertag.systemId || supertag.content || '')}
                </span>
              </SelectItem>
            ))}

            {/* Common built-in supertags if not in list */}
            {!supertags.some((s: AssembledNode) => s.systemId === 'supertag:item') && (
              <SelectItem value="supertag:item">
                <span className="flex items-center gap-2">
                  <span className="text-primary">#</span>
                  Item
                </span>
              </SelectItem>
            )}
            {!supertags.some((s: AssembledNode) => s.systemId === 'supertag:tool') && (
              <SelectItem value="supertag:tool">
                <span className="flex items-center gap-2">
                  <span className="text-primary">#</span>
                  Tool
                </span>
              </SelectItem>
            )}
            {!supertags.some((s: AssembledNode) => s.systemId === 'supertag:tag') && (
              <SelectItem value="supertag:tag">
                <span className="flex items-center gap-2">
                  <span className="text-primary">#</span>
                  Tag
                </span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Include inherited toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="includeInherited"
          checked={includeInherited}
          onCheckedChange={(checked) => {
            const newValue = checked === true
            setIncludeInherited(newValue)
            onUpdate({ includeInherited: newValue })
          }}
        />
        <Label
          htmlFor="includeInherited"
          className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5"
        >
          <TreeStructure className="size-3.5" weight="bold" />
          Include inherited supertags
        </Label>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70">
        {includeInherited
          ? 'Will match nodes with this supertag or any supertag that extends it.'
          : 'Will only match nodes with this exact supertag.'}
      </p>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={!localValue}
        >
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a supertag system ID for display
 */
function formatSupertagName(systemIdOrContent: string): string {
  if (systemIdOrContent.startsWith('supertag:')) {
    const name = systemIdOrContent.replace('supertag:', '')
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return systemIdOrContent
}
