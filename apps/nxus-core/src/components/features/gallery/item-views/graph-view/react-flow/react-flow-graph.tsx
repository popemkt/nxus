import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useNavigate } from '@tanstack/react-router'
import dagre from 'dagre'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force'
import type { ItemNodeData } from './hooks'
import type { Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { cn } from '@nxus/ui'
import {
  CommandNode,
  DependencyEdge,
  ForceArrowEdge,
  ForceArrowMarkerDefs,
  GraphControls,
  GraphLegend,
  ItemNode,
  SimpleNode,
} from './components'
import type { Item, ItemType } from '@nxus/db'
import type {
  GraphLayout,
  GraphNodeStyle,
} from '@/stores/view-mode.store'
import type {
  Simulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force'
import { useViewModeStore } from '@/stores/view-mode.store'
import { APP_TYPE_COLORS, APP_TYPE_ICONS } from '@/lib/app-constants'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { useTagDataStore } from '@/stores/tag-data.store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, React.ComponentType<any>> = {
  item: ItemNode,
  command: CommandNode,
  simple: SimpleNode,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: Record<string, React.ComponentType<any>> = {
  dependency: DependencyEdge,
  forceArrow: ForceArrowEdge,
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const SIMPLE_NODE_SIZE = 24

interface ReactFlowGraphProps {
  items: Array<Item>
  searchQuery: string
  className?: string
}

interface ForceNode extends SimulationNodeDatum {
  id: string
}

function createNodes(
  items: Array<Item>,
  matchedIds: Set<string>,
  hasActiveFilter: boolean,
  options: {
    nodeStyle: GraphNodeStyle
    filterMode: string
    showLabels: boolean
    isForceLayout: boolean
  },
): Array<Node> {
  const { nodeStyle, filterMode, showLabels, isForceLayout } = options

  const dependentsCount = new Map<string, number>()
  items.forEach((item) => {
    if (item.dependencies) {
      item.dependencies.forEach((depId: string) => {
        dependentsCount.set(depId, (dependentsCount.get(depId) || 0) + 1)
      })
    }
  })

  return items
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
      const nodeImportance = dependentsCount.get(item.id) || 0

      if (nodeStyle === 'simple') {
        return {
          id: item.id,
          type: 'simple',
          position: { x: 0, y: 0 },
          data: {
            type: item.type,
            status: item.status,
            label: item.name,
            isDimmed,
            isHighlighted: hasActiveFilter && isMatched && !isDimmed,
            dependencyCount: nodeImportance,
            showLabel: showLabels,
            isForceLayout,
          },
        } as Node
      }

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
          isHighlighted: hasActiveFilter && isMatched && !isDimmed,
          app: item,
          TypeIcon: APP_TYPE_ICONS[item.type as keyof typeof APP_TYPE_ICONS],
        },
      } as Node
    })
}

function createEdges(
  items: Array<Item>,
  visibleIds: Set<string>,
  matchedIds: Set<string>,
  edgeType: 'dependency' | 'forceArrow',
): Array<Edge> {
  const edges: Array<Edge> = []

  items.forEach((item) => {
    if (item.dependencies && visibleIds.has(item.id)) {
      item.dependencies.forEach((depId: string) => {
        if (visibleIds.has(depId)) {
          const isMatched = matchedIds.has(item.id) && matchedIds.has(depId)
          edges.push({
            id: `${item.id}->${depId}`,
            source: item.id,
            target: depId,
            type: edgeType,
            data: { isMatched },
          })
        }
      })
    }
  })

  return edges
}

function applyDagreLayout(
  nodes: Array<Node>,
  edges: Array<Edge>,
  nodeStyle: GraphNodeStyle,
): Array<Node> {
  if (nodes.length === 0) return []

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    nodesep: nodeStyle === 'simple' ? 40 : 60,
    ranksep: nodeStyle === 'simple' ? 100 : 120,
    marginx: 50,
    marginy: 50,
  })

  nodes.forEach((node) => {
    const width = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE + 60 : NODE_WIDTH
    const height = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE + 30 : NODE_HEIGHT
    g.setNode(node.id, { width, height })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    const width = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE : NODE_WIDTH
    const height = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE : NODE_HEIGHT
    return {
      ...node,
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
    }
  })
}

function ReactFlowGraphInner({
  items,
  searchQuery,
  className,
}: ReactFlowGraphProps) {
  const navigate = useNavigate()

  const isInitializedRef = useRef(false)
  const currentLayoutRef = useRef<GraphLayout>('hierarchical')
  const currentNodeStyleRef = useRef<GraphNodeStyle>('detailed')
  const simulationRef = useRef<Simulation<
    ForceNode,
    SimulationLinkDatum<ForceNode>
  > | null>(null)
  const nodesRef = useRef<Array<Node>>([])

  const reactFlowOptions = useViewModeStore((s) => s.reactFlowOptions)
  const setReactFlowOptions = useViewModeStore((s) => s.setReactFlowOptions)
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const tags = useTagDataStore((s) => s.tags)

  const matchedIds = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()
    const hasActiveFilter = lowerQuery !== '' || selectedTagIds.size > 0

    if (!hasActiveFilter) {
      return new Set(items.map((i) => i.id))
    }

    const tagNamesSet = new Set<string>()
    selectedTagIds.forEach((idStr) => {
      const tag = tags.get(idStr)
      if (tag) tagNamesSet.add(tag.name)
    })

    const matched = new Set<string>()
    items.forEach((item) => {
      const matchesSearch =
        !lowerQuery ||
        item.name.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery) ||
        item.metadata.tags.some((t: { name: string }) =>
          t.name.toLowerCase().includes(lowerQuery),
        )

      const matchesTags =
        tagNamesSet.size === 0 ||
        item.metadata.tags.some((t: { name: string }) => tagNamesSet.has(t.name))

      if (matchesSearch && matchesTags) {
        matched.add(item.id)
      }
    })

    return matched
  }, [items, searchQuery, selectedTagIds, tags])

  const hasActiveFilter = searchQuery.trim() !== '' || selectedTagIds.size > 0

  const initialData = useMemo(() => {
    const { nodeStyle, filterMode, showLabels, layout } = reactFlowOptions
    const isForce = layout === 'force'

    const nodes = createNodes(items, matchedIds, hasActiveFilter, {
      nodeStyle,
      filterMode,
      showLabels,
      isForceLayout: isForce && nodeStyle === 'simple',
    })

    const visibleIds = new Set(nodes.map((n) => n.id))
    const edgeType =
      isForce && nodeStyle === 'simple' ? 'forceArrow' : 'dependency'
    const edges = createEdges(items, visibleIds, matchedIds, edgeType)

    const layoutedNodes = applyDagreLayout(nodes, edges, nodeStyle)

    return { nodes: layoutedNodes, edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges)
  const { fitView } = useReactFlow()

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const stopSimulation = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }
  }, [])

  const startForceSimulation = useCallback(
    (initialNodes: Array<Node>, edgeData: Array<Edge>) => {
      stopSimulation()

      const forceNodes: Array<ForceNode> = initialNodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      }))

      const forceLinks: Array<SimulationLinkDatum<ForceNode>> = edgeData.map(
        (edge) => ({
          source: edge.source,
          target: edge.target,
        }),
      )

      const simulation = forceSimulation(forceNodes)
        .force(
          'link',
          forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(forceLinks)
            .id((d) => d.id)
            .distance(100)
            .strength(0.4),
        )
        .force('charge', forceManyBody().strength(-200))
        .force('center', forceCenter(400, 300).strength(0.05))
        .force('collide', forceCollide().radius(50).strength(0.7))
        .force('x', forceX(400).strength(0.02))
        .force('y', forceY(300).strength(0.02))
        .alphaDecay(0.015)
        .velocityDecay(0.35)

      const forceNodeMap = new Map(forceNodes.map((n) => [n.id, n]))

      simulation.on('tick', () => {
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            const forceNode = forceNodeMap.get(node.id)
            if (
              forceNode &&
              forceNode.x !== undefined &&
              forceNode.y !== undefined
            ) {
              return {
                ...node,
                position: { x: forceNode.x, y: forceNode.y },
              }
            }
            return node
          }),
        )
      })

      simulationRef.current = simulation
    },
    [stopSimulation, setNodes],
  )

  useEffect(() => {
    return () => stopSimulation()
  }, [stopSimulation])

  useEffect(() => {
    const { layout, nodeStyle, filterMode, showLabels } = reactFlowOptions
    const layoutChanged = currentLayoutRef.current !== layout
    const nodeStyleChanged = currentNodeStyleRef.current !== nodeStyle

    const isForceMode = layout === 'force' && nodeStyle === 'simple'

    if (!isInitializedRef.current) {
      const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
        nodeStyle,
        filterMode,
        showLabels,
        isForceLayout: isForceMode,
      })
      const visibleIds = new Set(newNodes.map((n) => n.id))
      const edgeType = isForceMode ? 'forceArrow' : 'dependency'
      const newEdges = createEdges(items, visibleIds, matchedIds, edgeType)
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)

      setNodes(layoutedNodes)
      setEdges(newEdges)

      currentLayoutRef.current = layout
      currentNodeStyleRef.current = nodeStyle
      isInitializedRef.current = true

      setTimeout(() => fitView({ padding: 0.2 }), 100)
      return
    }

    if (nodeStyleChanged) {
      stopSimulation()

      const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
        nodeStyle,
        filterMode,
        showLabels,
        isForceLayout: false,
      })
      const visibleIds = new Set(newNodes.map((n) => n.id))
      const newEdges = createEdges(items, visibleIds, matchedIds, 'dependency')
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)

      setNodes(layoutedNodes)
      setEdges(newEdges)

      if (layout !== 'hierarchical') {
        setReactFlowOptions({ layout: 'hierarchical' })
      }

      currentNodeStyleRef.current = nodeStyle
      currentLayoutRef.current = 'hierarchical'

      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      return
    }

    if (layoutChanged) {
      if (layout === 'force' && nodeStyle !== 'simple') {
        setReactFlowOptions({ layout: 'hierarchical' })
        return
      }

      if (layout === 'force') {
        const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
          nodeStyle,
          filterMode,
          showLabels,
          isForceLayout: true,
        })
        const visibleIds = new Set(newNodes.map((n) => n.id))
        const newEdges = createEdges(
          items,
          visibleIds,
          matchedIds,
          'forceArrow',
        )

        const currentPositions = new Map(
          nodesRef.current.map((n) => [n.id, n.position]),
        )
        const positionedNodes = newNodes.map((n) => ({
          ...n,
          position: currentPositions.get(n.id) || n.position,
        }))

        setNodes(positionedNodes)
        setEdges(newEdges)

        setTimeout(() => {
          startForceSimulation(positionedNodes, newEdges)
        }, 50)
      } else {
        stopSimulation()

        const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
          nodeStyle,
          filterMode,
          showLabels,
          isForceLayout: false,
        })
        const visibleIds = new Set(newNodes.map((n) => n.id))
        const newEdges = createEdges(
          items,
          visibleIds,
          matchedIds,
          'dependency',
        )
        const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)

        setNodes(layoutedNodes)
        setEdges(newEdges)

        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      }

      currentLayoutRef.current = layout
      return
    }

    const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
      nodeStyle,
      filterMode,
      showLabels,
      isForceLayout: isForceMode,
    })
    const visibleIds = new Set(newNodes.map((n) => n.id))
    const edgeType = isForceMode ? 'forceArrow' : 'dependency'
    const newEdges = createEdges(items, visibleIds, matchedIds, edgeType)

    const currentIds = new Set(nodesRef.current.map((n) => n.id))
    const newIds = new Set(newNodes.map((n) => n.id))
    const structureChanged =
      currentIds.size !== newIds.size ||
      [...newIds].some((id) => !currentIds.has(id))

    if (structureChanged) {
      stopSimulation()
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)
      setNodes(layoutedNodes)
      setEdges(newEdges)
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
    } else {
      setNodes((current) => {
        const nodeDataMap = new Map(newNodes.map((n) => [n.id, n.data]))
        return current.map((node) => ({
          ...node,
          data: nodeDataMap.get(node.id) || node.data,
        }))
      })
      setEdges(newEdges)
    }
  }, [
    items,
    matchedIds,
    hasActiveFilter,
    reactFlowOptions,
    setNodes,
    setEdges,
    setReactFlowOptions,
    fitView,
    startForceSimulation,
    stopSimulation,
  ])

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'item' || node.type === 'simple') {
        navigate({ to: '/apps/$appId', params: { appId: node.id } })
      }
    },
    [navigate],
  )

  const handleRunLayout = useCallback(() => {
    const { layout, nodeStyle, filterMode, showLabels } =
      useViewModeStore.getState().reactFlowOptions
    const isForceMode = layout === 'force' && nodeStyle === 'simple'

    const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
      nodeStyle,
      filterMode,
      showLabels,
      isForceLayout: isForceMode,
    })
    const visibleIds = new Set(newNodes.map((n) => n.id))
    const edgeType = isForceMode ? 'forceArrow' : 'dependency'
    const newEdges = createEdges(items, visibleIds, matchedIds, edgeType)

    if (isForceMode) {
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)
      setNodes(layoutedNodes)
      setEdges(newEdges)
      setTimeout(() => {
        startForceSimulation(layoutedNodes, newEdges)
      }, 50)
    } else {
      stopSimulation()
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)
      setNodes(layoutedNodes)
      setEdges(newEdges)
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
    }
  }, [
    items,
    matchedIds,
    hasActiveFilter,
    setNodes,
    setEdges,
    fitView,
    startForceSimulation,
    stopSimulation,
  ])

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === 'simple') {
      const data = node.data as {
        types?: Array<ItemType>
        type?: ItemType
        isDimmed: boolean
      }
      if (data?.isDimmed) return 'var(--muted)'
      const firstType = data?.types?.[0] ?? data?.type
      if (firstType && firstType in APP_TYPE_COLORS) {
        return APP_TYPE_COLORS[firstType as keyof typeof APP_TYPE_COLORS]
      }
      return 'var(--muted-foreground)'
    }
    const data = node.data as ItemNodeData | undefined
    if (data?.isDimmed) return 'var(--muted)'
    return data?.status === 'installed'
      ? 'var(--primary)'
      : 'var(--muted-foreground)'
  }, [])

  const handleNodesChange = reactFlowOptions.nodesLocked
    ? undefined
    : onNodesChange

  return (
    <div className={cn('w-full h-full min-h-[500px]', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
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
          options={reactFlowOptions}
          onOptionsChange={setReactFlowOptions}
          onFitView={handleFitView}
          onRunLayout={handleRunLayout}
        />
        <GraphLegend nodeStyle={reactFlowOptions.nodeStyle} />
        <ForceArrowMarkerDefs />
      </ReactFlow>
    </div>
  )
}

export function ReactFlowGraph(props: ReactFlowGraphProps) {
  return (
    <ReactFlowProvider>
      <ReactFlowGraphInner {...props} />
    </ReactFlowProvider>
  )
}
