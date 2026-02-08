/**
 * ContentFilterEditor - Editor for content/full-text search filters
 *
 * Allows entering search text and configuring case sensitivity.
 */

import { useState, useEffect, useRef } from 'react'
import { Check, MagnifyingGlass } from '@phosphor-icons/react'
import { Button, Checkbox, Input, Label } from '@nxus/ui'
import type { ContentFilter } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface ContentFilterEditorProps {
  /** The content filter being edited */
  filter: ContentFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<ContentFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Component
// ============================================================================

export function ContentFilterEditor({
  filter,
  onUpdate,
  onClose,
}: ContentFilterEditorProps) {
  const [query, setQuery] = useState(filter.query || '')
  const [caseSensitive, setCaseSensitive] = useState(filter.caseSensitive ?? false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Update local state when filter changes
  useEffect(() => {
    setQuery(filter.query || '')
    setCaseSensitive(filter.caseSensitive ?? false)
  }, [filter])

  // Handle query change with debounced update
  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery)
  }

  // Handle case sensitivity toggle
  const handleCaseSensitiveChange = (checked: boolean) => {
    setCaseSensitive(checked)
    onUpdate({ caseSensitive: checked })
  }

  // Handle save
  const handleSave = () => {
    if (query.trim()) {
      onUpdate({
        query: query.trim(),
        caseSensitive,
      })
    }
    onClose()
  }

  // Handle enter key in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
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
        <MagnifyingGlass className="size-3.5" weight="bold" />
        Content Search
      </div>

      {/* Search input */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Search text</Label>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter text to search..."
          className="w-full"
        />
      </div>

      {/* Case sensitivity toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="caseSensitive"
          checked={caseSensitive}
          onCheckedChange={(checked) =>
            handleCaseSensitiveChange(checked === true)
          }
        />
        <Label
          htmlFor="caseSensitive"
          className="text-xs text-muted-foreground cursor-pointer"
        >
          Case sensitive search
        </Label>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70">
        {caseSensitive
          ? 'Search will match exact case. "Hello" will not match "hello".'
          : 'Search is case-insensitive. "Hello" will match "hello", "HELLO", etc.'}
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
          disabled={!query.trim()}
        >
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}
