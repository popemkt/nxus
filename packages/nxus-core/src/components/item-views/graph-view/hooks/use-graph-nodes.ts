import type { Node, Edge } from '@xyflow/react'
import type { App } from '@/types/app'
import { APP_TYPE_ICONS } from '@/lib/app-constants'
import type { GraphFilterResult } from './use-graph-filter'
import type { GraphOptions } from '@/stores/view-mode.store'

export interface ItemNodeData extends Record<string, unknown> {
  label: string
  description: string
  type: App['type']
  status: App['status']
  isMatched: boolean
  isDimmed: boolean
  app: App
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
  items: App[]
  filterResult: GraphFilterResult
  graphOptions: GraphOptions
}

export function useGraphNodes({
  items,
  filterResult,
  graphOptions,
}: UseGraphNodesProps): {
  nodes: (ItemNode | CommandNode)[]
  edges: DependencyEdge[]
} {
  const { matchedIds, hasActiveFilter } = filterResult
  const { showCommands, filterMode } = graphOptions

  // Build item nodes
  const itemNodes: ItemNode[] = items
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
          type: item.type,
          status: item.status,
          isMatched,
          isDimmed,
          app: item,
          TypeIcon: APP_TYPE_ICONS[item.type],
        },
      }
    })

  // Build command nodes if enabled
  const commandNodes: CommandNode[] = []
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
  const edges: DependencyEdge[] = []

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
