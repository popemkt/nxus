/**
 * SavedQueriesPanel - Panel for managing saved queries
 *
 * Displays a list of saved queries with the ability to:
 * - Execute a saved query
 * - Edit a saved query (load into query builder)
 * - Delete a saved query
 * - Create a new query
 */

import { useState } from 'react'
import {
  Play,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  Plus,
  FloppyDisk,
  X,
  Funnel,
} from '@phosphor-icons/react'
import { Button, cn, Input } from '@nxus/ui'
import {
  useSavedQueries,
  useDeleteQuery,
} from '@/hooks/use-query'
import type { QueryDefinition, SavedQuery } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface SavedQueriesPanelProps {
  /** Called when a saved query is selected to execute */
  onExecute?: (query: SavedQuery) => void
  /** Called when a saved query is selected to edit (load into query builder) */
  onEdit?: (query: SavedQuery) => void
  /** Called when creating a new query */
  onCreateNew?: () => void
  /** Called to close the panel */
  onClose?: () => void
  /** Additional class names */
  className?: string
  /** Compact mode */
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

export function SavedQueriesPanel({
  onExecute,
  onEdit,
  onCreateNew,
  onClose,
  className,
  compact = false,
}: SavedQueriesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch saved queries
  const { queries, isLoading, isError, refetch } = useSavedQueries()

  // Delete mutation
  const { deleteQuery, isDeleting } = useDeleteQuery()

  // Filter queries by search
  const filteredQueries = queries.filter((q) =>
    q.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle delete with confirmation
  const handleDelete = async (queryId: string) => {
    if (deletingId === queryId) {
      // Second click - confirm delete
      try {
        await deleteQuery({ queryId })
        setDeletingId(null)
      } catch {
        // Error is handled by the hook
      }
    } else {
      // First click - show confirmation
      setDeletingId(queryId)
      // Auto-reset after 3 seconds
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col',
        compact ? 'gap-2' : 'gap-3',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <FloppyDisk weight="bold" className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground/80">
            Saved Queries
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title="Close"
          >
            <X weight="bold" />
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="px-4">
        <div className="relative">
          <MagnifyingGlass
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            weight="bold"
          />
          <Input
            type="text"
            placeholder="Search saved queries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Create New Button */}
      {onCreateNew && (
        <div className="px-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateNew}
            className="w-full justify-start"
          >
            <Plus weight="bold" data-icon="inline-start" />
            Create New Query
          </Button>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border mx-4" />

      {/* Query List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <span className="text-sm text-destructive">
              Failed to load queries
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filteredQueries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Funnel className="size-8 text-muted-foreground/50 mb-2" />
            <span className="text-sm text-muted-foreground">
              {searchQuery
                ? 'No matching queries found'
                : 'No saved queries yet'}
            </span>
            {!searchQuery && onCreateNew && (
              <span className="text-xs text-muted-foreground/70 mt-1">
                Create your first query to get started
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredQueries.map((query) => (
              <SavedQueryItem
                key={query.id}
                query={query}
                onExecute={onExecute}
                onEdit={onEdit}
                onDelete={() => handleDelete(query.id)}
                isDeleting={isDeleting && deletingId === query.id}
                showDeleteConfirm={deletingId === query.id}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface SavedQueryItemProps {
  query: SavedQuery
  onExecute?: (query: SavedQuery) => void
  onEdit?: (query: SavedQuery) => void
  onDelete: () => void
  isDeleting: boolean
  showDeleteConfirm: boolean
  compact?: boolean
}

function SavedQueryItem({
  query,
  onExecute,
  onEdit,
  onDelete,
  isDeleting,
  showDeleteConfirm,
  compact = false,
}: SavedQueryItemProps) {
  const filterCount = query.definition?.filters?.length ?? 0
  const hasSort = !!query.definition?.sort

  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-card/50 transition-colors hover:bg-card/80',
        compact ? 'p-2' : 'p-3'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {query.content || 'Untitled Query'}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{filterCount} filter{filterCount !== 1 ? 's' : ''}</span>
            {hasSort && <span>+ sort</span>}
            {query.evaluatedAt && (
              <>
                <span>-</span>
                <span>
                  Last run: {formatRelativeTime(query.evaluatedAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons - visible on hover and focus-within */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {onExecute && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onExecute(query)}
              title="Execute query"
              aria-label={`Execute ${query.content || 'query'}`}
            >
              <Play weight="fill" className="size-3.5" />
            </Button>
          )}
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(query)}
              title="Edit query"
              aria-label={`Edit ${query.content || 'query'}`}
            >
              <PencilSimple weight="bold" className="size-3.5" />
            </Button>
          )}
          <Button
            variant={showDeleteConfirm ? 'destructive' : 'ghost'}
            size="icon-sm"
            onClick={onDelete}
            disabled={isDeleting}
            title={showDeleteConfirm ? 'Click again to confirm' : 'Delete query'}
            aria-label={showDeleteConfirm ? 'Confirm delete' : `Delete ${query.content || 'query'}`}
          >
            <Trash weight="bold" className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Query preview */}
      {query.definition?.filters && query.definition.filters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {query.definition.filters.slice(0, 3).map((filter, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
            >
              {getFilterLabel(filter)}
            </span>
          ))}
          {query.definition.filters.length > 3 && (
            <span className="px-1.5 py-0.5 text-xs text-muted-foreground">
              +{query.definition.filters.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get a human-readable label for a filter
 */
function getFilterLabel(filter: QueryDefinition['filters'][number]): string {
  switch (filter.type) {
    case 'supertag':
      return `#${filter.supertagSystemId?.replace('supertag:', '') || '?'}`
    case 'property':
      return `${filter.fieldSystemId?.replace('field:', '') || '?'} ${filter.op} ${filter.value || '?'}`
    case 'content':
      return `"${filter.query?.slice(0, 20) || '?'}${(filter.query?.length ?? 0) > 20 ? '...' : ''}"`
    case 'temporal':
      return `${filter.field} ${filter.op} ${filter.days ? `${filter.days}d` : filter.date || '?'}`
    case 'relation':
      return filter.relationType || 'relation'
    case 'hasField':
      return `${filter.negate ? '!' : ''}has:${filter.fieldSystemId?.replace('field:', '') || '?'}`
    case 'and':
      return `AND (${filter.filters?.length ?? 0})`
    case 'or':
      return `OR (${filter.filters?.length ?? 0})`
    case 'not':
      return `NOT (${filter.filters?.length ?? 0})`
    default:
      return 'filter'
  }
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return then.toLocaleDateString()
}
