/**
 * QueryBuilderWithSaved - Query builder with saved queries integration
 *
 * This component wraps the QueryBuilder with full saved queries functionality:
 * - Save dialog for naming and saving queries
 * - Saved queries panel toggle
 * - Load saved queries into the builder
 * - Update existing saved queries
 */

import { useState, useCallback } from 'react'
import {
  FloppyDisk,
  Folder,
  X,
  Check,
} from '@phosphor-icons/react'
import {
  Button,
  cn,
  Input,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@nxus/ui'
import type { SavedQuery } from '@nxus/db'
import { useCreateQuery, useUpdateQuery } from '../../hooks/use-query.js'
import { QueryBuilder, type QueryBuilderProps } from './query-builder.js'
import { SavedQueriesPanel } from './saved-queries-panel.js'

// ============================================================================
// Types
// ============================================================================

export interface QueryBuilderWithSavedProps extends Omit<QueryBuilderProps, 'onSave'> {
  /** Called when a saved query is loaded */
  onLoadSavedQuery?: (query: SavedQuery) => void
  /** Currently loaded saved query (for update mode) */
  loadedQueryId?: string | null
  /** Called when query ID changes (saved or cleared) */
  onQueryIdChange?: (queryId: string | null) => void
  /** Show saved queries panel button */
  showSavedQueriesButton?: boolean
  /** Error state for query evaluation */
  isError?: boolean
  /** Error message to display */
  errorMessage?: string
}

type ViewMode = 'builder' | 'saved-queries'

// ============================================================================
// Component
// ============================================================================

export function QueryBuilderWithSaved({
  value,
  onChange,
  onLoadSavedQuery,
  loadedQueryId,
  onQueryIdChange,
  showSavedQueriesButton = true,
  showSave = true,
  compact = false,
  className,
  ...queryBuilderProps
}: QueryBuilderWithSavedProps) {
  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('builder')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [queryName, setQueryName] = useState('')

  // Mutations
  const { createQuery, isCreating } = useCreateQuery()
  const { updateQuery, isUpdating } = useUpdateQuery()

  const hasFilters = value.filters.length > 0
  const isSaving = isCreating || isUpdating
  const isUpdateMode = !!loadedQueryId

  // Handle save button click
  const handleSaveClick = useCallback(() => {
    if (isUpdateMode) {
      // Update existing query
      handleUpdate()
    } else {
      // Open save dialog for new query
      setSaveDialogOpen(true)
      setQueryName('')
    }
  }, [isUpdateMode, loadedQueryId, value])

  // Handle save new query
  const handleSaveNew = useCallback(async () => {
    if (!queryName.trim()) return

    try {
      const queryId = await createQuery({
        name: queryName.trim(),
        definition: value,
      })
      setSaveDialogOpen(false)
      setQueryName('')
      onQueryIdChange?.(queryId)
    } catch {
      // Error handled by hook
    }
  }, [queryName, value, createQuery, onQueryIdChange])

  // Handle update existing query
  const handleUpdate = useCallback(async () => {
    if (!loadedQueryId) return

    try {
      await updateQuery({
        queryId: loadedQueryId,
        definition: value,
      })
    } catch {
      // Error handled by hook
    }
  }, [loadedQueryId, value, updateQuery])

  // Handle load saved query
  const handleLoadSavedQuery = useCallback(
    (query: SavedQuery) => {
      onChange(query.definition)
      onQueryIdChange?.(query.id)
      onLoadSavedQuery?.(query)
      setViewMode('builder')
    },
    [onChange, onQueryIdChange, onLoadSavedQuery]
  )

  // Handle edit saved query (same as load)
  const handleEditSavedQuery = useCallback(
    (query: SavedQuery) => {
      handleLoadSavedQuery(query)
    },
    [handleLoadSavedQuery]
  )

  // Handle create new from saved queries panel
  const handleCreateNew = useCallback(() => {
    onChange({ filters: [], limit: 500 })
    onQueryIdChange?.(null)
    setViewMode('builder')
  }, [onChange, onQueryIdChange])

  // Handle close saved queries panel
  const handleCloseSavedQueriesPanel = useCallback(() => {
    setViewMode('builder')
  }, [])

  // Render saved queries panel
  if (viewMode === 'saved-queries') {
    return (
      <SavedQueriesPanel
        onExecute={handleLoadSavedQuery}
        onEdit={handleEditSavedQuery}
        onCreateNew={handleCreateNew}
        onClose={handleCloseSavedQueriesPanel}
        className={className}
        compact={compact}
      />
    )
  }

  // Render query builder with save enhancements
  return (
    <>
      <div className={cn('flex flex-col', className)}>
        {/* Extra header row with saved queries button */}
        {showSavedQueriesButton && !compact && (
          <div className="flex items-center justify-between px-4 pt-3 pb-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('saved-queries')}
              className="text-muted-foreground hover:text-foreground"
            >
              <Folder weight="bold" data-icon="inline-start" />
              Saved Queries
            </Button>

            {/* Show "Editing: ..." when in update mode */}
            {isUpdateMode && (
              <span className="text-xs text-muted-foreground">
                Editing saved query
              </span>
            )}
          </div>
        )}

        {/* Query Builder */}
        <QueryBuilder
          value={value}
          onChange={onChange}
          compact={compact}
          showSave={showSave && hasFilters}
          onSave={handleSaveClick}
          {...queryBuilderProps}
        />

        {/* Update mode indicator and actions */}
        {isUpdateMode && hasFilters && (
          <div className="flex items-center justify-end gap-2 px-4 pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onQueryIdChange?.(null)
              }}
              className="text-muted-foreground"
            >
              <X weight="bold" data-icon="inline-start" />
              Detach
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpdate}
              disabled={isSaving}
            >
              {isSaving ? (
                'Saving...'
              ) : (
                <>
                  <Check weight="bold" data-icon="inline-start" />
                  Update
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Save Dialog */}
      <AlertDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Query</AlertDialogTitle>
            <AlertDialogDescription>
              Give your query a name to save it for later use.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Input
              placeholder="Query name..."
              value={queryName}
              onChange={(e) => setQueryName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && queryName.trim()) {
                  handleSaveNew()
                }
              }}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveNew}
              disabled={!queryName.trim() || isSaving}
            >
              {isSaving ? (
                'Saving...'
              ) : (
                <>
                  <FloppyDisk weight="bold" className="size-4 mr-1.5" />
                  Save
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
