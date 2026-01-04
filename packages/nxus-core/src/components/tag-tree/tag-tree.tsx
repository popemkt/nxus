import { useEffect, useState } from 'react'
import {
  CaretRight,
  CaretDown,
  Tag,
  Plus,
  X,
  MagnifyingGlass,
  DotsSixVertical,
} from '@phosphor-icons/react'
import {
  useTagDataStore,
  type TagTreeNode,
  buildTagTree,
} from '@/stores/tag-data.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { cn } from '@/lib/utils'
import { TagDndContext, SortableTagItem } from './use-tag-dnd'

interface TagTreeItemProps {
  node: TagTreeNode
  level: number
  mode: 'editor' | 'filter'
  onSelect?: (tagId: string) => void
  searchQuery?: string
}

function TagTreeItem({
  node,
  level,
  mode,
  onSelect,
  searchQuery,
}: TagTreeItemProps) {
  const { tag, children } = node
  const hasChildren = children.length > 0

  const expandedIds = useTagUIStore((s) => s.expandedIds)
  const toggleExpanded = useTagUIStore((s) => s.toggleExpanded)
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const toggleSelected = useTagUIStore((s) => s.toggleSelected)

  const isExpanded = expandedIds.has(tag.id)
  const isSelected = selectedTagIds.has(tag.id)

  // Filter: show if matches search or has matching children
  const matchesSearch =
    !searchQuery || tag.name.toLowerCase().includes(searchQuery.toLowerCase())

  const handleClick = () => {
    // Always toggle selection (for filter bar)
    toggleSelected(tag.id)
    // In editor mode, also call the onSelect callback
    if (mode === 'editor') {
      onSelect?.(tag.id)
    }
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleExpanded(tag.id)
  }

  if (!matchesSearch && children.length === 0) {
    return null
  }

  const content = (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors group',
          'hover:bg-accent/50',
          isSelected && 'bg-primary/10 text-primary',
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Drag handle (editor mode only) */}
        {mode === 'editor' && level === 0 && (
          <DotsSixVertical
            size={14}
            className="text-muted-foreground/50 group-hover:text-muted-foreground cursor-grab active:cursor-grabbing"
            weight="bold"
          />
        )}

        {/* Expand/collapse caret */}
        <button
          className={cn(
            'p-0.5 rounded hover:bg-accent',
            !hasChildren && 'invisible',
          )}
          onClick={handleExpandClick}
        >
          {isExpanded ? (
            <CaretDown size={14} weight="bold" />
          ) : (
            <CaretRight size={14} weight="bold" />
          )}
        </button>

        {/* Checkbox (filter mode only) */}
        {mode === 'filter' && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelected(tag.id)}
            className="mr-1"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Tag icon */}
        <Tag
          size={14}
          weight="duotone"
          style={{ color: tag.color || 'currentColor' }}
        />

        {/* Tag name */}
        <span className="text-sm truncate">{tag.name}</span>
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
            />
          ))}
        </div>
      )}
    </div>
  )

  // Only wrap root-level items in sortable for now
  if (mode === 'editor' && level === 0) {
    return <SortableTagItem id={tag.id}>{content}</SortableTagItem>
  }

  return content
}

interface TagTreeProps {
  mode: 'editor' | 'filter'
  onSelect?: (tagId: string) => void
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

  // Get root tag IDs for sortable context
  const rootTagIds = treeNodes.map((n) => n.tag.id)

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
    </div>
  )
}
