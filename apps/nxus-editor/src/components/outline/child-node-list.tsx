import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useOutlineStore } from '@/stores/outline.store'
import { VIRTUALIZE_CHILDREN_THRESHOLD } from '@/lib/tree-loading'
import type { NodeMap } from '@/types/outline'

interface ChildNodeListProps {
  childIds: string[]
  depth: number
  scrollElement?: HTMLElement | null
  renderNode: (nodeId: string, depth: number) => ReactNode
}

function findContainingChild(
  childIds: string[],
  nodes: NodeMap,
  targetId: string | null,
): string | null {
  if (!targetId) return null
  const visited = new Set<string>()

  function contains(nodeId: string): boolean {
    if (nodeId === targetId) return true
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    const node = nodes.get(nodeId)
    if (!node) return false
    return node.children.some((childId) => contains(childId))
  }

  return childIds.find((childId) => contains(childId)) ?? null
}

function getClosestOutlineScroller(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null
  const closest = element.closest('.outline-body')
  return closest instanceof HTMLElement ? closest : null
}

function measureScrollMargin(
  listElement: HTMLElement | null,
  scrollElement: HTMLElement | null,
): number {
  if (!listElement || !scrollElement) return 0
  const listRect = listElement.getBoundingClientRect()
  const scrollRect = scrollElement.getBoundingClientRect()
  return listRect.top - scrollRect.top + scrollElement.scrollTop
}

export function ChildNodeList({
  childIds,
  depth,
  scrollElement,
  renderNode,
}: ChildNodeListProps) {
  const nodes = useOutlineStore((s) => s.nodes)
  const activeNodeId = useOutlineStore((s) => s.activeNodeId)
  const selectedNodeId = useOutlineStore((s) => s.selectedNodeId)
  const shouldVirtualize = childIds.length > VIRTUALIZE_CHILDREN_THRESHOLD
  const listRef = useRef<HTMLDivElement | null>(null)
  const [discoveredScrollElement, setDiscoveredScrollElement] =
    useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const resolvedScrollElement = scrollElement ?? discoveredScrollElement
  const pinnedActiveChildId = useMemo(
    () => findContainingChild(childIds, nodes, activeNodeId),
    [activeNodeId, childIds, nodes],
  )
  const focusedChildId = useMemo(
    () => findContainingChild(childIds, nodes, activeNodeId ?? selectedNodeId),
    [activeNodeId, childIds, nodes, selectedNodeId],
  )
  const focusedIndex = focusedChildId ? childIds.indexOf(focusedChildId) : -1

  const updateScrollMargin = useCallback(() => {
    const nextScrollElement =
      scrollElement ?? getClosestOutlineScroller(listRef.current)
    if (nextScrollElement !== discoveredScrollElement) {
      setDiscoveredScrollElement(nextScrollElement)
    }
    setScrollMargin(measureScrollMargin(listRef.current, nextScrollElement))
  }, [discoveredScrollElement, scrollElement])

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: childIds.length,
    getScrollElement: () => resolvedScrollElement,
    getItemKey: (index) => childIds[index] ?? index,
    estimateSize: () => 32,
    overscan: 12,
    scrollMargin,
  })

  useLayoutEffect(() => {
    if (!shouldVirtualize) return
    updateScrollMargin()
  }, [shouldVirtualize, updateScrollMargin])

  useEffect(() => {
    if (!shouldVirtualize) return
    const scrollRoot = resolvedScrollElement
    const listElement = listRef.current
    if (!scrollRoot || !listElement) return

    const observer = new ResizeObserver(updateScrollMargin)
    observer.observe(scrollRoot)
    observer.observe(listElement)
    window.addEventListener('resize', updateScrollMargin)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScrollMargin)
    }
  }, [resolvedScrollElement, shouldVirtualize, updateScrollMargin])

  useEffect(() => {
    if (!shouldVirtualize || focusedIndex < 0) return
    rowVirtualizer.scrollToIndex(focusedIndex, { align: 'auto' })
  }, [focusedIndex, rowVirtualizer, shouldVirtualize])

  if (!shouldVirtualize) {
    return (
      <>
        {childIds.map((childId) => renderNode(childId, depth))}
      </>
    )
  }

  const virtualItems = rowVirtualizer.getVirtualItems()
  const pinnedActiveIndex = pinnedActiveChildId
    ? childIds.indexOf(pinnedActiveChildId)
    : -1
  const renderIndexes = new Set(virtualItems.map((item) => item.index))
  if (pinnedActiveIndex >= 0) renderIndexes.add(pinnedActiveIndex)

  return (
    <div ref={listRef} className="relative">
      <div
        className="relative"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {[...renderIndexes]
          .sort((a, b) => a - b)
          .map((index) => {
            const childId = childIds[index]
            if (!childId) return null
            const virtualItem = virtualItems.find((item) => item.index === index)
            const offsetForIndex = rowVirtualizer.getOffsetForIndex(index, 'start')
            const start = virtualItem?.start ?? offsetForIndex?.[0] ?? index * 32
            return (
              <div
                key={childId}
                ref={(element) => {
                  if (element) rowVirtualizer.measureElement(element)
                }}
                data-index={index}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${start - scrollMargin}px)`,
                }}
              >
                {renderNode(childId, depth)}
              </div>
            )
          })}
      </div>
    </div>
  )
}
