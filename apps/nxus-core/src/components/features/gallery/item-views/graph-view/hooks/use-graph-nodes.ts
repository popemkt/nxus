import type { Edge, Node } from '@xyflow/react'
import type { Item, ItemType } from '@nxus/db'
import type { GraphFilterResult } from './use-graph-filter'
import type { GraphOptions } from '@/stores/view-mode.store'
import { getFirstTypeIcon } from '@/lib/app-constants'

export interface ItemNodeData extends Record<string, unknown> {
  label: string
  description: string
  types: Array<ItemType>
  /** @deprecated Use types[0] instead */
  type: ItemType
  status: Item['status']
  isMatched: boolean
  isDimmed: boolean
  isHighlighted?: boolean // True when matched with active filter
  app: Item
  TypeIcon: React.ComponentType<{ className?: string }>
}

export interface CommandNodeData extends Record<string, unknown> {
  label: string
  parentId: string
  icon: string
}

export type ItemNode = Node<ItemNodeData, 'item'>
export type CommandNode = Node<CommandNodeData, 'command'>
export type DependencyEdge = Edge<{ isMatched: boolean }>

interface UseGraphNodesProps {
  items: Array<Item>
  filterResult: GraphFilterResult
  graphOptions: GraphOptions
}

export function useGraphNodes({
  items,
  filterResult,
  graphOptions,
}: UseGraphNodesProps): {
  nodes: Array<ItemNode | CommandNode>
  edges: Array<DependencyEdge>
} {
  const { matchedIds, hasActiveFilter } = filterResult
  const { showCommands, filterMode } = graphOptions

  // Build item nodes
  const itemNodes: Array<ItemNode> = items
    .filter((item) => {
      // In show-only mode, filter out unmatched items
      if (
        hasActiveFilter &&
        filterMode === 'show-only' &&
        !matchedIds.has(item.id)
      ) {
        return false
      }
      return true
    })
    .map((item, index) => {
      const isMatched = matchedIds.has(item.id)
      const isDimmed =
        hasActiveFilter && filterMode === 'highlight' && !isMatched

      return {
        id: item.id,
        type: 'item' as const,
        position: { x: 0, y: index * 150 }, // Will be laid out later
        data: {
          label: item.name,
          description: item.description,
          types: item.types ?? [],
          type: item.types?.[0] ?? item.type, // Backward compat
          status: item.status,
          isMatched,
          isDimmed,
          app: item,
          TypeIcon: getFirstTypeIcon(item),
        },
      }
    })

  // Build command nodes if enabled
  const commandNodes: Array<CommandNode> = []
  if (showCommands) {
    items.forEach((item) => {
      if (item.commands && item.commands.length > 0) {
        item.commands.forEach((cmd) => {
          commandNodes.push({
            id: `${item.id}-cmd-${cmd.id}`,
            type: 'command' as const,
            position: { x: 0, y: 0 }, // Will be positioned relative to parent
            data: {
              label: cmd.name,
              parentId: item.id,
              icon: cmd.icon,
            },
          })
        })
      }
    })
  }

  // Build edges from dependencies
  const visibleIds = new Set(itemNodes.map((n) => n.id))
  const edges: Array<DependencyEdge> = []

  items.forEach((item) => {
    if (item.dependencies && visibleIds.has(item.id)) {
      item.dependencies.forEach((depId) => {
        if (visibleIds.has(depId)) {
          const isMatched = matchedIds.has(item.id) && matchedIds.has(depId)
          edges.push({
            id: `${depId}->${item.id}`,
            source: depId,
            target: item.id,
            type: 'dependency',
            data: { isMatched },
          })
        }
      })
    }
  })

  // Add edges from command nodes to parent items
  if (showCommands) {
    commandNodes.forEach((cmdNode) => {
      edges.push({
        id: `${cmdNode.data.parentId}->${cmdNode.id}`,
        source: cmdNode.data.parentId,
        target: cmdNode.id,
        type: 'dependency',
        data: { isMatched: true },
        style: { strokeDasharray: '5,5', opacity: 0.5 },
      })
    })
  }

  return {
    nodes: [...itemNodes, ...commandNodes],
    edges,
  }
}
