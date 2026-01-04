import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTagDataStore, type TagTreeNode } from '@/stores/tag-data.store'
import { cn } from '@/lib/utils'

interface UseTagDndOptions {
  onMoveTag?: (id: string, parentId: string | null, order: number) => void
  onExpandParent?: (parentId: string) => void
}

/**
 * Hook for tag tree drag and drop functionality
 */
export function useTagDnd(options?: UseTagDndOptions) {
  const moveTag = useTagDataStore((s) => s.moveTag)
  const getChildren = useTagDataStore((s) => s.getChildren)
  const tags = useTagDataStore((s) => s.tags)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverId((event.over?.id as string) ?? null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    setActiveId(null)
    setOverId(null)

    if (!over || active.id === over.id) return

    const activeTagId = active.id as string
    const overTagId = over.id as string

    const overTag = tags.get(overTagId)
    const activeTag = tags.get(activeTagId)

    if (!overTag || !activeTag) return

    // Only reorder if same parent - keeps DnD simple and predictable
    // Different parent tags are ignored (no accidental nesting)
    if (activeTag.parentId === overTag.parentId) {
      const siblings = getChildren(activeTag.parentId)
      const oldIndex = siblings.findIndex((s) => s.id === activeTagId)
      const newIndex = siblings.findIndex((s) => s.id === overTagId)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        await moveTag(activeTagId, activeTag.parentId, newIndex)
        options?.onMoveTag?.(activeTagId, activeTag.parentId, newIndex)
      }
    }
    // Note: Nesting removed from DnD - use context menu or dedicated UI instead
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setOverId(null)
  }

  return {
    sensors,
    activeId,
    overId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}

interface SortableTagItemProps {
  id: string
  children: React.ReactNode
  disabled?: boolean
}

/**
 * Wrapper component to make tag items sortable
 */
export function SortableTagItem({
  id,
  children,
  disabled,
}: SortableTagItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        isDragging && 'z-50',
        isOver && !isDragging && 'ring-2 ring-primary ring-offset-1 rounded-md',
      )}
    >
      {children}
    </div>
  )
}

interface TagDndContextProps {
  children: React.ReactNode
  items: string[]
  onMoveTag?: (id: string, parentId: string | null, order: number) => void
  onExpandParent?: (parentId: string) => void
}

/**
 * Context provider for tag drag and drop
 */
export function TagDndContext({
  children,
  items,
  onMoveTag,
  onExpandParent,
}: TagDndContextProps) {
  const {
    sensors,
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useTagDnd({ onMoveTag, onExpandParent })

  const tags = useTagDataStore((s) => s.tags)
  const activeTag = activeId ? tags.get(activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>

      <DragOverlay>
        {activeTag && (
          <div className="px-3 py-1.5 bg-background border rounded-md shadow-lg text-sm">
            {activeTag.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

export { DndContext, SortableContext }
