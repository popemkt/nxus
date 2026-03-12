import type { Edge, Node } from '@xyflow/react'
import type { Item, ItemType } from '@nxus/db'
import type { GraphFilterResult } from './use-graph-filter'
import type { ReactFlowGraphOptions } from '@/stores/view-mode.store'
import { getFirstTypeIcon } from '@/lib/app-constants'

export interface ItemNodeData extends Record<string, unknown> {
  label: string
  description: string
  types: Array<ItemType>
  type: ItemType
  status: Item['status']
  isMatched: boolean
  isDimmed: boolean
  isHighlighted?: boolean
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
  graphOptions: ReactFlowGraphOptions
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

  const itemNodes: Array<ItemNode> = items
    .filter((item) => {
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
        position: { x: 0, y: index * 150 },
        data: {
          label: item.name,
          description: item.description,
          types: item.types ?? [],
          type: item.types?.[0] ?? item.type,
          status: item.status,
          isMatched,
          isDimmed,
          app: item,
          TypeIcon: getFirstTypeIcon(item),
        },
      }
    })

  const commandNodes: Array<CommandNode> = []
  if (showCommands) {
    items.forEach((item) => {
      if (item.commands && item.commands.length > 0) {
        item.commands.forEach((cmd: { id: string; name: string; icon: string }) => {
          commandNodes.push({
            id: `${item.id}-cmd-${cmd.id}`,
            type: 'command' as const,
            position: { x: 0, y: 0 },
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

  const visibleIds = new Set(itemNodes.map((n) => n.id))
  const edges: Array<DependencyEdge> = []

  items.forEach((item) => {
    if (item.dependencies && visibleIds.has(item.id)) {
      item.dependencies.forEach((depId: string) => {
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
