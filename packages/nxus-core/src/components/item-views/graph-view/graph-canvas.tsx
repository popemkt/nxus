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
  StraightEdge,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { App } from '@/types/app'
import {
  ItemNode,
  CommandNode,
  SimpleNode,
  DependencyEdge,
  GraphControls,
  GraphLegend,
} from './components'
import { type ItemNodeData } from './hooks'
import {
  useViewModeStore,
  type GraphOptions,
  type GraphLayout,
  type GraphNodeStyle,
} from '@/stores/view-mode.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { useTagDataStore } from '@/stores/tag-data.store'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import dagre from 'dagre'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { APP_TYPE_ICONS } from '@/lib/app-constants'

// Node type registrations
const nodeTypes: Record<string, React.ComponentType<any>> = {
  item: ItemNode,
  command: CommandNode,
  simple: SimpleNode,
}

// Edge types - use straight lines for force layout
const edgeTypes: Record<string, React.ComponentType<any>> = {
  dependency: DependencyEdge,
  straight: StraightEdge,
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const SIMPLE_NODE_SIZE = 24

interface GraphCanvasProps {
  items: App[]
  searchQuery: string
  className?: string
}

// Create nodes from items based on style
function createNodesAndEdges(
  items: App[],
  matchedIds: Set<string>,
  hasActiveFilter: boolean,
  graphOptions: GraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const { filterMode, nodeStyle, showLabels } = graphOptions

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
      const dependencyCount = item.dependencies?.length || 0

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
            dependencyCount,
            showLabel: showLabels,
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
            type: 'dependency', // Will be overridden for force layout
            data: { isMatched },
          })
        }
      })
    }
  })

  return { nodes, edges }
}

// Apply dagre hierarchical layout
function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  nodeStyle: GraphNodeStyle,
): Node[] {
  if (nodes.length === 0) return []

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: nodeStyle === 'simple' ? 40 : 60,
    ranksep: nodeStyle === 'simple' ? 100 : 120,
    marginx: 50,
    marginy: 50,
  })

  nodes.forEach((node) => {
    const size = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE + 60 : NODE_WIDTH // Extra space for labels
    const height = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE + 30 : NODE_HEIGHT
    dagreGraph.setNode(node.id, { width: size, height })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  return nodes.map((node) => {
    const pos = dagreGraph.node(node.id)
    const size = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE : NODE_WIDTH
    const height = nodeStyle === 'simple' ? SIMPLE_NODE_SIZE : NODE_HEIGHT
    return {
      ...node,
      position: { x: pos.x - size / 2, y: pos.y - height / 2 },
      targetPosition: 'left',
      sourcePosition: 'right',
    } as Node
  })
}

// Force simulation interface
interface ForceNode extends SimulationNodeDatum {
  id: string
}

function GraphCanvasInner({ items, searchQuery, className }: GraphCanvasProps) {
  const navigate = useNavigate()
  const hasInitialized = useRef(false)
  const prevLayoutRef = useRef<GraphLayout>('hierarchical')
  const prevNodeStyleRef = useRef<GraphNodeStyle>('detailed')
  const simulationRef = useRef<Simulation<
    ForceNode,
    SimulationLinkDatum<ForceNode>
  > | null>(null)

  // View mode store - read current options directly
  const graphOptions = useViewModeStore((s) => s.graphOptions)
  const setGraphOptions = useViewModeStore((s) => s.setGraphOptions)

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

  // Initial nodes/edges - always start with hierarchical
  const initialData = useMemo(() => {
    const { nodes, edges } = createNodesAndEdges(
      items,
      matchedIds,
      hasActiveFilter,
      graphOptions,
    )
    return {
      nodes: applyDagreLayout(nodes, edges, graphOptions.nodeStyle),
      edges,
    }
  }, []) // Only on mount

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges)
  const { fitView } = useReactFlow()

  // Stop any running simulation
  const stopSimulation = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }
  }, [])

  // Start interactive force simulation
  const startForceSimulation = useCallback(
    (nodesToSimulate: Node[], edgesToSimulate: Edge[]) => {
      stopSimulation()

      const forceNodes: ForceNode[] = nodesToSimulate.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      }))

      const forceLinks: SimulationLinkDatum<ForceNode>[] = edgesToSimulate.map(
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
            .distance(80)
            .strength(0.5),
        )
        .force('charge', forceManyBody().strength(-200))
        .force('center', forceCenter(400, 300))
        .force('collide', forceCollide().radius(40).strength(0.8))
        .force('x', forceX(400).strength(0.02))
        .force('y', forceY(300).strength(0.02))
        .alphaDecay(0.02) // Slower decay for smoother animation
        .velocityDecay(0.3) // More friction

      simulation.on('tick', () => {
        const nodeMap = new Map(forceNodes.map((n) => [n.id, n]))
        setNodes((current) =>
          current.map((node) => {
            const forceNode = nodeMap.get(node.id)
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

  // Apply layout based on current options
  const applyLayout = useCallback(
    (layout: GraphLayout, nodeStyle: GraphNodeStyle) => {
      setNodes((currentNodes) => {
        const currentEdges =
          useViewModeStore.getState().graphOptions.layout === 'force'
            ? edges.map((e) => ({ ...e, type: 'straight' })) // straight lines for force
            : edges

        if (layout === 'force') {
          // Start interactive simulation
          setTimeout(() => {
            startForceSimulation(currentNodes, currentEdges)
          }, 0)
          // Update edge types to straight
          setEdges(edges.map((e) => ({ ...e, type: 'straight' })))
          return currentNodes // Don't change positions yet, simulation will
        } else {
          stopSimulation()
          // Update edge types to dependency (bezier)
          setEdges(edges.map((e) => ({ ...e, type: 'dependency' })))
          return applyDagreLayout(currentNodes, edges, nodeStyle)
        }
      })
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
    },
    [edges, setNodes, setEdges, startForceSimulation, stopSimulation, fitView],
  )

  // Handle initial mount and changes
  useEffect(() => {
    const { layout, nodeStyle, showLabels } = graphOptions
    const layoutChanged = prevLayoutRef.current !== layout
    const nodeStyleChanged = prevNodeStyleRef.current !== nodeStyle

    // Create fresh nodes/edges
    const { nodes: newNodes, edges: newEdges } = createNodesAndEdges(
      items,
      matchedIds,
      hasActiveFilter,
      graphOptions,
    )

    if (!hasInitialized.current) {
      // First render
      const layouted = applyDagreLayout(newNodes, newEdges, nodeStyle)
      setNodes(layouted)
      setEdges(newEdges)
      hasInitialized.current = true
      prevLayoutRef.current = layout
      prevNodeStyleRef.current = nodeStyle
      setTimeout(() => fitView({ padding: 0.2 }), 100)
      return
    }

    if (nodeStyleChanged) {
      // Node style changed - need to recreate nodes with new type
      stopSimulation()
      const layouted = applyDagreLayout(newNodes, newEdges, nodeStyle)
      setNodes(layouted)
      setEdges(newEdges.map((e) => ({ ...e, type: 'dependency' })))
      prevNodeStyleRef.current = nodeStyle
      prevLayoutRef.current = 'hierarchical' // Reset to hierarchical on style change
      setGraphOptions({ layout: 'hierarchical' })
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      return
    }

    if (layoutChanged) {
      // Layout changed - apply new layout
      if (layout === 'force') {
        setEdges(newEdges.map((e) => ({ ...e, type: 'straight' })))
        startForceSimulation(nodes, newEdges)
      } else {
        stopSimulation()
        const layouted = applyDagreLayout(nodes, newEdges, nodeStyle)
        setNodes(layouted)
        setEdges(newEdges.map((e) => ({ ...e, type: 'dependency' })))
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      }
      prevLayoutRef.current = layout
      return
    }

    // Just update node data (for filter/label changes) - preserve positions
    setNodes((current) => {
      const newNodeMap = new Map(newNodes.map((n) => [n.id, n]))
      const currentIds = new Set(current.map((n) => n.id))
      const newIds = new Set(newNodes.map((n) => n.id))

      // Check if nodes added/removed
      const structureChanged =
        currentIds.size !== newIds.size ||
        [...newIds].some((id) => !currentIds.has(id))

      if (structureChanged) {
        stopSimulation()
        return applyDagreLayout(newNodes, newEdges, nodeStyle)
      }

      return current.map((node) => {
        const newNode = newNodeMap.get(node.id)
        if (newNode) {
          return { ...node, data: newNode.data }
        }
        return node
      })
    })
    setEdges(
      newEdges.map((e) => ({
        ...e,
        type: graphOptions.layout === 'force' ? 'straight' : 'dependency',
      })),
    )
  }, [
    items,
    itemsKey,
    matchedIds,
    hasActiveFilter,
    graphOptions,
    setNodes,
    setEdges,
    fitView,
    startForceSimulation,
    stopSimulation,
  ])

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => stopSimulation()
  }, [stopSimulation])

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'item' || node.type === 'simple') {
        navigate({ to: '/apps/$appId', params: { appId: node.id } })
      }
    },
    [navigate],
  )

  // Manual re-layout
  const handleRunLayout = useCallback(() => {
    const { layout, nodeStyle } = useViewModeStore.getState().graphOptions
    applyLayout(layout, nodeStyle)
  }, [applyLayout])

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.type === 'simple') {
      const data = node.data as { type: App['type']; isDimmed: boolean }
      if (data?.isDimmed) return 'var(--muted)'
      switch (data?.type) {
        case 'tool':
          return '#22c55e'
        case 'remote-repo':
          return '#a855f7'
        case 'typescript':
          return '#3b82f6'
        case 'html':
          return '#f97316'
        default:
          return 'var(--muted-foreground)'
      }
    }
    const data = node.data as ItemNodeData | undefined
    if (data?.isDimmed) return 'var(--muted)'
    return data?.status === 'installed'
      ? 'var(--primary)'
      : 'var(--muted-foreground)'
  }, [])

  // Lock nodes - prevent dragging when locked
  const handleNodesChange = graphOptions.nodesLocked ? undefined : onNodesChange

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
          options={graphOptions}
          onOptionsChange={setGraphOptions}
          onFitView={handleFitView}
          onRunLayout={handleRunLayout}
        />
        <GraphLegend nodeStyle={graphOptions.nodeStyle} />
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
