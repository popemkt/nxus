import { useState, useCallback, createContext, useContext } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
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

// Context for sharing drop indicator state
interface TagDndDropContextValue {
  dropIndicator: DropIndicator
  activeId: string | null
}

const TagDndDropContext = createContext<TagDndDropContextValue>({
  dropIndicator: { overId: null, type: null },
  activeId: null,
})

export function useTagDndDropIndicator() {
  return useContext(TagDndDropContext)
}

/**
 * Hook for tag tree drag and drop functionality
 * Uses raw @dnd-kit/core (not sortable) to prevent automatic transforms
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
  const [currentPointer, setCurrentPointer] = useState<{
    x: number
    y: number
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  // Track pointer position during drag
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      // Get delta from event and calculate current position
      const { delta } = event
      if (event.activatorEvent instanceof MouseEvent) {
        setCurrentPointer({
          x: event.activatorEvent.clientX + delta.x,
          y: event.activatorEvent.clientY + delta.y,
        })
      }

      const { over } = event
      if (!over || event.active.id === over.id) {
        setDropIndicator({ overId: null, type: null })
        return
      }

      const overRect = over.rect
      if (!overRect || !currentPointer) {
        setDropIndicator({ overId: over.id as string, type: null })
        return
      }

      const pointerY = currentPointer.y
      const pointerX = currentPointer.x

      // Tight zones: top/bottom 20% for reorder
      const topThreshold = overRect.top + overRect.height * 0.2
      const bottomThreshold = overRect.top + overRect.height * 0.8
      const rightHalfStart = overRect.left + overRect.width * 0.5

      let type: DropType = null

      if (pointerY < topThreshold) {
        type = 'before'
      } else if (pointerY > bottomThreshold) {
        type = 'after'
      } else if (pointerX > rightHalfStart) {
        // Right 50% of middle = nest
        type = 'nest'
      }

      setDropIndicator({ overId: over.id as string, type })
    },
    [currentPointer],
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const currentIndicator = dropIndicator

    setActiveId(null)
    setDropIndicator({ overId: null, type: null })
    setCurrentPointer(null)

    if (!over || active.id === over.id || currentIndicator.type === null) return

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
    } else if (
      currentIndicator.type === 'before' ||
      currentIndicator.type === 'after'
    ) {
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
    setCurrentPointer(null)
  }

  return {
    sensors,
    activeId,
    dropIndicator,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  }
}

interface DraggableTagItemProps {
  id: string
  children: React.ReactNode
}

/**
 * Draggable wrapper using raw @dnd-kit/core (no automatic transforms on siblings)
 */
export function DraggableTagItem({ id, children }: DraggableTagItemProps) {
  const { dropIndicator, activeId } = useTagDndDropIndicator()

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id })

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })

  // Combine refs
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  const isOverThis = dropIndicator.overId === id
  const dropType = isOverThis ? dropIndicator.type : null

  // Only the dragged item gets transform
  const style = isDragging
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: 0.6,
        zIndex: 100,
      }
    : undefined

  return (
    <div className="relative">
      {/* Before drop indicator - thin blue line */}
      {dropType === 'before' && (
        <div className="absolute -top-0.5 left-0 right-0 h-1 bg-primary rounded-full z-10" />
      )}

      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          isDragging && 'cursor-grabbing shadow-lg',
          dropType === 'nest' &&
            'ring-2 ring-yellow-500 bg-yellow-500/10 rounded-md',
        )}
      >
        {children}
      </div>

      {/* After drop indicator - thin blue line */}
      {dropType === 'after' && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-1 bg-primary rounded-full z-10" />
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
 * Uses raw DndContext (not SortableContext) to prevent automatic sibling transforms
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
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  } = useTagDnd({ onMoveTag, onExpandParent })

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <TagDndDropContext.Provider value={{ dropIndicator, activeId }}>
        {children}
      </TagDndDropContext.Provider>
    </DndContext>
  )
}

// Legacy export for compatibility (will be replaced)
export function SortableTagItem({
  id,
  children,
  dropIndicator,
}: {
  id: string
  children: React.ReactNode
  dropIndicator?: DropIndicator
}) {
  return <DraggableTagItem id={id}>{children}</DraggableTagItem>
}

export { DndContext }
