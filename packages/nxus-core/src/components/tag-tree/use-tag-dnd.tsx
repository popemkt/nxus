import { useState, useCallback } from 'react'
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
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTagDataStore } from '@/stores/tag-data.store'
import { cn } from '@/lib/utils'

interface UseTagDndOptions {
  onMoveTag?: (id: string, parentId: string | null, order: number) => void
  onExpandParent?: (parentId: string) => void
}

type DropType = 'before' | 'after' | 'nest' | null

interface DropIndicator {
  overId: string | null
  type: DropType
}

/**
 * Hook for tag tree drag and drop functionality
 * Supports both reordering (drop between) and nesting (drop on center)
 */
export function useTagDnd(options?: UseTagDndOptions) {
  const moveTag = useTagDataStore((s) => s.moveTag)
  const getChildren = useTagDataStore((s) => s.getChildren)
  const tags = useTagDataStore((s) => s.tags)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator>({
    overId: null,
    type: null,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      setDropIndicator({ overId: null, type: null })
      return
    }

    const overRect = over.rect
    const activeRect = active.rect.current.translated

    if (!overRect || !activeRect) {
      setDropIndicator({ overId: over.id as string, type: 'nest' })
      return
    }

    // Calculate position within the target
    const overCenterY = overRect.top + overRect.height / 2
    const activeCenterY = activeRect.top + activeRect.height / 2

    // Top 25% = before, bottom 25% = after, middle 50% = nest
    const topThreshold = overRect.top + overRect.height * 0.25
    const bottomThreshold = overRect.top + overRect.height * 0.75

    let type: DropType = 'nest'
    if (activeCenterY < topThreshold) {
      type = 'before'
    } else if (activeCenterY > bottomThreshold) {
      type = 'after'
    }

    setDropIndicator({ overId: over.id as string, type })
  }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const currentIndicator = dropIndicator

    setActiveId(null)
    setDropIndicator({ overId: null, type: null })

    if (!over || active.id === over.id) return

    const activeTagId = active.id as string
    const overTagId = over.id as string

    const overTag = tags.get(overTagId)
    const activeTag = tags.get(activeTagId)

    if (!overTag || !activeTag) return

    if (currentIndicator.type === 'nest') {
      // Nest: make active tag a child of over tag
      const targetChildren = getChildren(overTagId)
      await moveTag(activeTagId, overTagId, targetChildren.length)
      options?.onMoveTag?.(activeTagId, overTagId, targetChildren.length)
      options?.onExpandParent?.(overTagId)
    } else {
      // Reorder within same parent level
      const parentId = overTag.parentId
      const siblings = getChildren(parentId)
      const overIndex = siblings.findIndex((s) => s.id === overTagId)

      if (overIndex !== -1) {
        const newIndex =
          currentIndicator.type === 'after' ? overIndex + 1 : overIndex
        await moveTag(activeTagId, parentId, newIndex)
        options?.onMoveTag?.(activeTagId, parentId, newIndex)
      }
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setDropIndicator({ overId: null, type: null })
  }

  return {
    sensors,
    activeId,
    dropIndicator,
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
  dropIndicator?: DropIndicator
}

/**
 * Wrapper component to make tag items sortable with drop indicators
 */
export function SortableTagItem({
  id,
  children,
  disabled,
  dropIndicator,
}: SortableTagItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isOverThis = dropIndicator?.overId === id
  const dropType = isOverThis ? dropIndicator?.type : null

  return (
    <div className="relative">
      {/* Before drop indicator */}
      {dropType === 'before' && (
        <div className="absolute -top-0.5 left-0 right-0 h-0.5 bg-primary rounded z-10" />
      )}

      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          isDragging && 'z-50',
          dropType === 'nest' && 'ring-2 ring-primary bg-primary/10 rounded-md',
        )}
      >
        {children}
      </div>

      {/* After drop indicator */}
      {dropType === 'after' && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-primary rounded z-10" />
      )}
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
    dropIndicator,
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
        {/* Pass dropIndicator to children */}
        <TagDndDropContext.Provider value={{ dropIndicator }}>
          {children}
        </TagDndDropContext.Provider>
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

// Context to pass drop indicator to children
import { createContext, useContext } from 'react'

interface TagDndDropContextValue {
  dropIndicator: DropIndicator
}

const TagDndDropContext = createContext<TagDndDropContextValue>({
  dropIndicator: { overId: null, type: null },
})

export function useTagDndDropIndicator() {
  return useContext(TagDndDropContext)
}

export { DndContext, SortableContext }
