import { useCallback } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { useOutlineStore } from '@/stores/outline.store'
import type { OutlineDropPosition } from '@/types/outline'

function getCurrentPointer(event: DragMoveEvent): { x: number; y: number } | null {
  const activatorEvent = event.activatorEvent

  if (
    !(activatorEvent instanceof MouseEvent) &&
    !(activatorEvent instanceof PointerEvent)
  ) {
    return null
  }

  return {
    x: activatorEvent.clientX + event.delta.x,
    y: activatorEvent.clientY + event.delta.y,
  }
}

function getDropPosition(event: DragMoveEvent): OutlineDropPosition | null {
  const pointer = getCurrentPointer(event)
  const overRect = event.over?.rect
  if (!pointer || !overRect) return null

  const topThreshold = overRect.top + overRect.height * 0.25
  const bottomThreshold = overRect.top + overRect.height * 0.75
  const insideThreshold = overRect.left + overRect.width * 0.45

  if (pointer.y <= topThreshold) return 'before'
  if (pointer.y >= bottomThreshold) return 'after'
  if (pointer.x >= insideThreshold) return 'inside'

  return null
}

export function OutlineDndProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const setDragState = useOutlineStore((s) => s.setDragState)
  const clearDragState = useOutlineStore((s) => s.clearDragState)
  const { moveNode } = useOutlineSync()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setDragState(event.active.id as string, null, null)
    },
    [setDragState],
  )

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const activeId = event.active.id as string
      const overId = event.over?.id as string | undefined

      if (!overId || activeId === overId) {
        setDragState(activeId, null, null)
        return
      }

      setDragState(activeId, overId, getDropPosition(event))
    },
    [setDragState],
  )

  const finalizeDrag = useCallback(
    (event: DragEndEvent) => {
      const activeId = event.active.id as string
      const { dropTargetId, dropPosition } = useOutlineStore.getState()

      clearDragState()

      if (!event.over || !dropTargetId || !dropPosition) return

      const overId = event.over.id as string
      if (activeId === overId || dropTargetId !== overId) return

      moveNode(activeId, overId, dropPosition)
    },
    [clearDragState, moveNode],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={finalizeDrag}
      onDragCancel={clearDragState}
    >
      {children}
    </DndContext>
  )
}
