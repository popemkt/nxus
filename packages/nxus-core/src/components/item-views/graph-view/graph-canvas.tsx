import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { App } from '@/types/app'
import {
  ItemNode,
  CommandNode,
  DependencyEdge,
  GraphControls,
} from './components'
import { type ItemNodeData } from './hooks'
import {
  useViewModeStore,
  type GraphLayout,
  type GraphOptions,
} from '@/stores/view-mode.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { useTagDataStore } from '@/stores/tag-data.store'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import dagre from 'dagre'
import { APP_TYPE_ICONS } from '@/lib/app-constants'

// Node and edge type registrations
const nodeTypes: Record<string, React.ComponentType<any>> = {
  item: ItemNode,
  command: CommandNode,
}

const edgeTypes: Record<string, React.ComponentType<any>> = {
  dependency: DependencyEdge,
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const COMMAND_NODE_SIZE = 60

interface GraphCanvasProps {
  items: App[]
  searchQuery: string
  className?: string
}

// Pure function to create nodes from items
function createNodesAndEdges(
  items: App[],
  matchedIds: Set<string>,
  hasActiveFilter: boolean,
  graphOptions: GraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const { showCommands, filterMode } = graphOptions

  // Build item nodes
  const nodes: Node[] = items
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
    .map((item) => {
      const isMatched = matchedIds.has(item.id)
      const isDimmed =
        hasActiveFilter && filterMode === 'highlight' && !isMatched

      return {
        id: item.id,
        type: 'item',
        position: { x: 0, y: 0 },
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
      } as Node
    })

  // Build edges from dependencies
  const visibleIds = new Set(nodes.map((n) => n.id))
  const edges: Edge[] = []

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

  return { nodes, edges }
}

// Apply dagre layout to nodes
function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return []

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 120,
    marginx: 50,
    marginy: 50,
  })

  nodes.forEach((node) => {
    const isCommand = node.type === 'command'
    dagreGraph.setNode(node.id, {
      width: isCommand ? COMMAND_NODE_SIZE : NODE_WIDTH,
      height: isCommand ? COMMAND_NODE_SIZE : NODE_HEIGHT,
    })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  return nodes.map((node) => {
    const pos = dagreGraph.node(node.id)
    const isCommand = node.type === 'command'
    const width = isCommand ? COMMAND_NODE_SIZE : NODE_WIDTH
    const height = isCommand ? COMMAND_NODE_SIZE : NODE_HEIGHT
    return {
      ...node,
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
      targetPosition: 'left',
      sourcePosition: 'right',
    } as Node
  })
}

function GraphCanvasInner({ items, searchQuery, className }: GraphCanvasProps) {
  const navigate = useNavigate()
  const [isLocked, setIsLocked] = useState(false)
  const hasInitialized = useRef(false)
  const nodeIdsRef = useRef<string>('')

  // View mode store
  const graphOptions = useViewModeStore((s) => s.graphOptions)
  const setGraphLayout = useViewModeStore((s) => s.setGraphLayout)

  // Tag filter state
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const tags = useTagDataStore((s) => s.tags)

  // Compute matched IDs based on filters
  const matchedIds = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()
    const hasActiveFilter = lowerQuery !== '' || selectedTagIds.size > 0

    if (!hasActiveFilter) {
      return new Set(items.map((i) => i.id))
    }

    const tagNamesSet = new Set<string>()
    selectedTagIds.forEach((id) => {
      const tag = tags.get(id)
      if (tag) tagNamesSet.add(tag.name)
    })

    const matched = new Set<string>()
    items.forEach((item) => {
      let matchesSearch = true
      let matchesTags = true

      if (lowerQuery) {
        matchesSearch =
          item.name.toLowerCase().includes(lowerQuery) ||
          item.description.toLowerCase().includes(lowerQuery) ||
          item.metadata.tags.some((t) => t.toLowerCase().includes(lowerQuery))
      }

      if (tagNamesSet.size > 0) {
        matchesTags = item.metadata.tags.some((t) => tagNamesSet.has(t))
      }

      if (matchesSearch && matchesTags) {
        matched.add(item.id)
      }
    })

    return matched
  }, [items, searchQuery, selectedTagIds, tags])

  const hasActiveFilter = searchQuery.trim() !== '' || selectedTagIds.size > 0

  // Create a stable key for the current set of items
  const itemsKey = useMemo(() => {
    return items
      .map((i) => i.id)
      .sort()
      .join(',')
  }, [items])

  // Initial nodes/edges computed once
  const initialData = useMemo(() => {
    const { nodes, edges } = createNodesAndEdges(
      items,
      matchedIds,
      hasActiveFilter,
      graphOptions,
    )
    return { nodes: applyLayout(nodes, edges), edges }
  }, []) // Empty deps - only on mount

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges)
  const { fitView } = useReactFlow()

  // Handle initial mount and item changes
  useEffect(() => {
    if (nodeIdsRef.current !== itemsKey) {
      // Items changed - recompute layout
      const { nodes: newNodes, edges: newEdges } = createNodesAndEdges(
        items,
        matchedIds,
        hasActiveFilter,
        graphOptions,
      )
      const layouted = applyLayout(newNodes, newEdges)
      setNodes(layouted)
      setEdges(newEdges)
      nodeIdsRef.current = itemsKey

      if (hasInitialized.current) {
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
      } else {
        hasInitialized.current = true
        setTimeout(() => fitView({ padding: 0.2 }), 100)
      }
    } else {
      // Same items - just update data (preserve positions)
      const { nodes: newNodes, edges: newEdges } = createNodesAndEdges(
        items,
        matchedIds,
        hasActiveFilter,
        graphOptions,
      )
      setNodes((current) => {
        const posMap = new Map(current.map((n) => [n.id, n.position]))
        return newNodes.map((n) => ({
          ...n,
          position: posMap.get(n.id) || n.position,
        }))
      })
      setEdges(newEdges)
    }
  }, [
    itemsKey,
    matchedIds,
    hasActiveFilter,
    graphOptions.filterMode,
    graphOptions.showCommands,
  ])

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'item') {
        navigate({ to: '/apps/$appId', params: { appId: node.id } })
      }
    },
    [navigate],
  )

  // Handle layout change
  const handleLayoutChange = useCallback(
    (layout: GraphLayout) => {
      setGraphLayout(layout)
      setNodes((current) => applyLayout(current, edges))
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
    },
    [setGraphLayout, edges, setNodes, fitView],
  )

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === 'command') return 'var(--muted-foreground)'
    const data = node.data as ItemNodeData | undefined
    if (data?.isDimmed) return 'var(--muted)'
    return data?.status === 'installed'
      ? 'var(--primary)'
      : 'var(--muted-foreground)'
  }, [])

  return (
    <div className={cn('w-full h-full min-h-[500px]', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1, 2]}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
          className="opacity-50"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-popover/90 !border-border rounded-lg shadow-lg"
        />
        <GraphControls
          isLocked={isLocked}
          onToggleLock={() => setIsLocked(!isLocked)}
          layout={graphOptions.layout}
          onLayoutChange={handleLayoutChange}
          onFitView={handleFitView}
        />
      </ReactFlow>
    </div>
  )
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
