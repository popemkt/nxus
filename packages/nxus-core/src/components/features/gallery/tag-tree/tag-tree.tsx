import * as React from 'react'
import { useEffect, useState } from 'react'
import {
  CaretRight,
  CaretDown,
  Tag,
  Plus,
  X,
  MagnifyingGlass,
  TreeStructure,
  Gear,
} from '@phosphor-icons/react'
import {
  useTagDataStore,
  type TagTreeNode,
  buildTagTree,
} from '@/stores/tag-data.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { cn } from '@nxus/ui'
import {
  TagDndContext,
  SortableTagItem,
  useTagDndDropIndicator,
} from './use-tag-dnd'
import { useQuery } from '@tanstack/react-query'
import { getAllConfigurableTagsServerFn } from '@/services/tag-config.server'
import { TagSchemaModal } from '@/components/shared/tag-schema-modal'

// Wrapper that connects SortableTagItem to the drop indicator context
function SortableTagItemWithIndicator({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const { dropIndicator } = useTagDndDropIndicator()
  return (
    <SortableTagItem id={id} dropIndicator={dropIndicator}>
      {children}
    </SortableTagItem>
  )
}

interface TagTreeItemProps {
  node: TagTreeNode
  level: number
  mode: 'editor' | 'filter'
  onSelect?: (tagId: number) => void
  searchQuery?: string
  /** Set of configurable tag IDs */
  configurableTagIds?: Set<number>
  onViewSchema?: (tagId: number, tagName: string) => void
}

function TagTreeItem({
  node,
  level,
  mode,
  onSelect,
  searchQuery,
  configurableTagIds,
  onViewSchema,
}: TagTreeItemProps) {
  const { tag, children } = node
  const hasChildren = children.length > 0
  const isConfigurable = configurableTagIds?.has(tag.id) ?? false

  const expandedIds = useTagUIStore((s) => s.expandedIds)
  const toggleExpanded = useTagUIStore((s) => s.toggleExpanded)
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const toggleSelected = useTagUIStore((s) => s.toggleSelected)
  const updateTag = useTagDataStore((s) => s.updateTag)

  const tagIdStr = String(tag.id)
  const isExpanded = expandedIds.has(tagIdStr)
  const isSelected = selectedTagIds.has(tagIdStr)

  // In-place edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(tag.name)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Filter: show if matches search or has matching children
  const matchesSearch =
    !searchQuery || tag.name.toLowerCase().includes(searchQuery.toLowerCase())

  const startEditing = () => {
    if (mode === 'editor') {
      setEditValue(tag.name)
      setIsEditing(true)
    }
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditValue(tag.name)
  }

  const saveEdit = async () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== tag.name) {
      await updateTag(tag.id, { name: trimmed })
    }
    setIsEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
  }

  const handleClick = () => {
    // Always toggle selection (for filter bar)
    toggleSelected(tagIdStr)
    // In editor mode, also call the onSelect callback
    if (mode === 'editor') {
      onSelect?.(tag.id)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    startEditing()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'F2' && mode === 'editor' && !isEditing) {
      e.preventDefault()
      startEditing()
    }
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleExpanded(tagIdStr)
  }

  if (!matchesSearch && children.length === 0) {
    return null
  }

  const content = (
    <div className="select-none" onKeyDown={handleKeyDown} tabIndex={0}>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors group',
          'hover:bg-accent/50',
          isSelected && 'bg-primary/10 text-primary',
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Icon with optional expand overlay */}
        <div className="relative flex items-center justify-center w-5 h-5">
          {/* Tag icon - TreeStructure for parents, Tag for leaves */}
          {hasChildren ? (
            <TreeStructure
              size={14}
              weight="duotone"
              style={{ color: tag.color || 'currentColor' }}
              className="group-hover:opacity-0 transition-opacity"
            />
          ) : (
            <Tag
              size={14}
              weight="duotone"
              style={{ color: tag.color || 'currentColor' }}
            />
          )}

          {/* Expand button - appears on hover over icon for parent items */}
          {hasChildren && (
            <button
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-accent"
              onClick={handleExpandClick}
            >
              {isExpanded ? (
                <CaretDown size={12} weight="bold" />
              ) : (
                <CaretRight size={12} weight="bold" />
              )}
            </button>
          )}
        </div>

        {/* Checkbox (filter mode only) */}
        {mode === 'filter' && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelected(tagIdStr)}
            className="mr-1"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Tag name - editable in editor mode */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={saveEdit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm px-1 py-0 bg-transparent outline outline-1 outline-primary/50 rounded focus:outline-primary min-w-0"
          />
        ) : (
          <span className="text-sm truncate flex-1">{tag.name}</span>
        )}

        {/* Configurable indicator */}
        {isConfigurable && (
          <button
            className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-accent transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onViewSchema?.(tag.id, tag.name)
            }}
            title="View schema"
          >
            <Gear size={12} />
          </button>
        )}
      </div>

      {/* Children - with connector line */}
      {isExpanded && hasChildren && (
        <div className="relative ml-3 border-l border-muted-foreground/20">
          {children.map((child) => (
            <TagTreeItem
              key={child.tag.id}
              node={child}
              level={level + 1}
              mode={mode}
              onSelect={onSelect}
              searchQuery={searchQuery}
              configurableTagIds={configurableTagIds}
              onViewSchema={onViewSchema}
            />
          ))}
        </div>
      )}
    </div>
  )

  // Wrap ALL levels in DraggableTagItem in editor mode for multi-level nesting
  if (mode === 'editor') {
    return (
      <SortableTagItemWithIndicator id={tagIdStr}>
        {content}
      </SortableTagItemWithIndicator>
    )
  }

  return content
}

interface TagTreeProps {
  mode: 'editor' | 'filter'
  onSelect?: (tagId: number) => void
  className?: string
}

/**
 * TagTree - Shared tree component for both editor and filter modes
 */
export function TagTree({ mode, onSelect, className }: TagTreeProps) {
  const tags = useTagDataStore((s) => s.tags)
  const isInitialized = useTagDataStore((s) => s.isInitialized)
  const initialize = useTagDataStore((s) => s.initialize)
  const addTag = useTagDataStore((s) => s.addTag)
  const getRootTags = useTagDataStore((s) => s.getRootTags)
  const getChildren = useTagDataStore((s) => s.getChildren)

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showAddInput, setShowAddInput] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [schemaModalTag, setSchemaModalTag] = useState<{
    id: number
    name: string
  } | null>(null)

  // Fetch configurable tags (now returns integer tagIds)
  const { data: configurableTagsResult } = useQuery({
    queryKey: ['configurable-tags'],
    queryFn: () => getAllConfigurableTagsServerFn(),
  })

  // Build a set of configurable tag IDs for O(1) lookup
  const configurableTagIds = React.useMemo(() => {
    const result = configurableTagsResult as
      | { success: boolean; data?: Array<{ tagId: number }> }
      | undefined
    if (!result?.success || !result.data) return new Set<number>()

    // Create a set of configurable tag IDs
    return new Set(result.data.map(({ tagId }) => tagId))
  }, [configurableTagsResult])

  useEffect(() => {
    initialize()
  }, [initialize])

  const treeNodes = buildTagTree({
    tags,
    isInitialized,
    isLoading: false,
    getRootTags,
    getChildren,
    getTag: (id) => tags.get(id),
    getAncestors: () => [],
    getDescendants: () => [],
    getAllTags: () => Array.from(tags.values()),
    initialize: async () => {},
    addTag: async () => ({}) as any,
    updateTag: async () => {},
    deleteTag: async () => {},
    moveTag: async () => {},
  })

  // Get root tag IDs for sortable context (as strings for DnD)
  const rootTagIds = treeNodes.map((n) => String(n.tag.id))

  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    await addTag({ name: newTagName.trim(), parentId: null })
    setNewTagName('')
    setShowAddInput(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTag()
    } else if (e.key === 'Escape') {
      setShowAddInput(false)
      setNewTagName('')
    }
  }

  if (!isInitialized) {
    return (
      <div className={cn('p-4 text-muted-foreground text-sm', className)}>
        Loading tags...
      </div>
    )
  }

  const treeContent = (
    <>
      {treeNodes.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          No tags yet.{' '}
          {mode === 'editor' && (
            <button
              onClick={() => setShowAddInput(true)}
              className="text-primary hover:underline"
            >
              Create one
            </button>
          )}
        </div>
      ) : (
        treeNodes.map((node) => (
          <TagTreeItem
            key={node.tag.id}
            node={node}
            level={0}
            mode={mode}
            onSelect={onSelect}
            searchQuery={searchQuery}
            configurableTagIds={configurableTagIds}
            onViewSchema={(id, name) => setSchemaModalTag({ id, name })}
          />
        ))
      )}
    </>
  )

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors"
        >
          {isCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
          Tags
          <span className="text-xs text-muted-foreground ml-1">
            ({tags.size})
          </span>
        </button>
        {mode === 'editor' && !isCollapsed && (
          <button
            onClick={() => setShowAddInput(true)}
            className="p-1 rounded hover:bg-accent"
            title="Add tag"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <>
          {/* Search input */}
          {treeNodes.length > 5 && (
            <div className="px-2 py-1 border-b">
              <div className="relative">
                <MagnifyingGlass
                  size={14}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tags..."
                  className="w-full pl-7 pr-2 py-1 text-xs bg-transparent border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Add tag input */}
          {showAddInput && (
            <div className="px-2 py-2 border-b flex gap-1">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tag name..."
                autoFocus
                className="flex-1 px-2 py-1 text-sm bg-transparent border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTagName.trim()}
                className="p-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => {
                  setShowAddInput(false)
                  setNewTagName('')
                }}
                className="p-1 rounded hover:bg-accent"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Tree content - wrapped in DnD context for editor mode */}
          <div className="flex-1 overflow-auto py-1">
            {mode === 'editor' ? (
              <TagDndContext
                items={rootTagIds}
                onExpandParent={(parentId) => {
                  // Auto-expand parent when child is dropped into it
                  useTagUIStore.getState().toggleExpanded(parentId)
                  // Ensure it's expanded (not collapsed)
                  if (!useTagUIStore.getState().expandedIds.has(parentId)) {
                    useTagUIStore.getState().toggleExpanded(parentId)
                  }
                }}
              >
                {treeContent}
              </TagDndContext>
            ) : (
              treeContent
            )}
          </div>
        </>
      )}

      {/* Schema Modal */}
      {schemaModalTag && (
        <TagSchemaModal
          tagId={schemaModalTag.id}
          tagName={schemaModalTag.name}
          open={!!schemaModalTag}
          onOpenChange={(open) => !open && setSchemaModalTag(null)}
        />
      )}
    </div>
  )
}
