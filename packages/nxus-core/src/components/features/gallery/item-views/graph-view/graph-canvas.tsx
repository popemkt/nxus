import { useCallback, useMemo, useEffect, useRef } from 'react'
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

import type { Item } from '@nxus/db'
import {
  ItemNode,
  CommandNode,
  SimpleNode,
  DependencyEdge,
  ForceArrowEdge,
  ForceArrowMarkerDefs,
  GraphControls,
  GraphLegend,
} from './components'
import { type ItemNodeData } from './hooks'
import {
  useViewModeStore,
  type GraphLayout,
  type GraphNodeStyle,
} from '@/stores/view-mode.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { useTagDataStore } from '@/stores/tag-data.store'
import { cn } from '@nxus/ui'
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

// Edge types
const edgeTypes: Record<string, React.ComponentType<any>> = {
  dependency: DependencyEdge,
  forceArrow: ForceArrowEdge,
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const SIMPLE_NODE_SIZE = 24

interface GraphCanvasProps {
  items: Item[]
  searchQuery: string
  className?: string
}

// Force simulation interface
interface ForceNode extends SimulationNodeDatum {
  id: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create nodes from items. Node data includes isForceLayout flag.
 */
function createNodes(
  items: Item[],
  matchedIds: Set<string>,
  hasActiveFilter: boolean,
  options: {
    nodeStyle: GraphNodeStyle
    filterMode: string
    showLabels: boolean
    isForceLayout: boolean
  },
): Node[] {
  const { nodeStyle, filterMode, showLabels, isForceLayout } = options

  // Calculate how many items depend on each item (dependents count)
  // This makes "foundation" items like git larger since more things depend on them
  const dependentsCount = new Map<string, number>()
  items.forEach((item) => {
    if (item.dependencies) {
      item.dependencies.forEach((depId) => {
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
      // Use dependents count for node size - more dependents = larger node (more important)
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
          TypeIcon: APP_TYPE_ICONS[item.type],
        },
      } as Node
    })
}

/**
 * Create edges from item dependencies.
 */
function createEdges(
  items: Item[],
  visibleIds: Set<string>,
  matchedIds: Set<string>,
  edgeType: 'dependency' | 'forceArrow',
): Edge[] {
  const edges: Edge[] = []

  items.forEach((item) => {
    if (item.dependencies && visibleIds.has(item.id)) {
      item.dependencies.forEach((depId) => {
        if (visibleIds.has(depId)) {
          const isMatched = matchedIds.has(item.id) && matchedIds.has(depId)
          // Edge goes FROM dependent TO dependency (repos -> git means "repos depends on git")
          edges.push({
            id: `${item.id}->${depId}`,
            source: item.id, // The dependent (repos)
            target: depId, // The dependency (git)
            type: edgeType,
            data: { isMatched },
          })
        }
      })
    }
  })

  return edges
}

/**
 * Apply dagre hierarchical layout to nodes.
 */
function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  nodeStyle: GraphNodeStyle,
): Node[] {
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function GraphCanvasInner({ items, searchQuery, className }: GraphCanvasProps) {
  const navigate = useNavigate()

  // Refs for tracking state
  const isInitializedRef = useRef(false)
  const currentLayoutRef = useRef<GraphLayout>('hierarchical')
  const currentNodeStyleRef = useRef<GraphNodeStyle>('detailed')
  const simulationRef = useRef<Simulation<
    ForceNode,
    SimulationLinkDatum<ForceNode>
  > | null>(null)
  const nodesRef = useRef<Node[]>([])

  // Store subscriptions
  const graphOptions = useViewModeStore((s) => s.graphOptions)
  const setGraphOptions = useViewModeStore((s) => s.setGraphOptions)
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const tags = useTagDataStore((s) => s.tags)

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const matchedIds = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()
    const hasActiveFilter = lowerQuery !== '' || selectedTagIds.size > 0

    if (!hasActiveFilter) {
      return new Set(items.map((i) => i.id))
    }

    // Convert string tag IDs to tag names for matching
    const tagNamesSet = new Set<string>()
    selectedTagIds.forEach((idStr) => {
      const tagId = parseInt(idStr, 10)
      if (isNaN(tagId)) return
      const tag = tags.get(tagId)
      if (tag) tagNamesSet.add(tag.name)
    })

    const matched = new Set<string>()
    items.forEach((item) => {
      const matchesSearch =
        !lowerQuery ||
        item.name.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery) ||
        item.metadata.tags.some((t) =>
          t.name.toLowerCase().includes(lowerQuery),
        )

      const matchesTags =
        tagNamesSet.size === 0 ||
        item.metadata.tags.some((t) => tagNamesSet.has(t.name))

      if (matchesSearch && matchesTags) {
        matched.add(item.id)
      }
    })

    return matched
  }, [items, searchQuery, selectedTagIds, tags])

  const hasActiveFilter = searchQuery.trim() !== '' || selectedTagIds.size > 0

  // ============================================================================
  // INITIAL DATA
  // ============================================================================

  const initialData = useMemo(() => {
    const { nodeStyle, filterMode, showLabels, layout } = graphOptions
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
  }, []) // Only on mount

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges)
  const { fitView } = useReactFlow()

  // Keep nodesRef updated
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // ============================================================================
  // SIMULATION MANAGEMENT
  // ============================================================================

  const stopSimulation = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }
  }, [])

  const startForceSimulation = useCallback(
    (initialNodes: Node[], edgeData: Edge[]) => {
      stopSimulation()

      // Create force nodes from current positions
      const forceNodes: ForceNode[] = initialNodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      }))

      const forceLinks: SimulationLinkDatum<ForceNode>[] = edgeData.map(
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

      // Create a stable node ID to ForceNode reference map
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

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSimulation()
  }, [stopSimulation])

  // ============================================================================
  // MODE CHANGE HANDLER
  // ============================================================================

  useEffect(() => {
    const { layout, nodeStyle, filterMode, showLabels } = graphOptions
    const layoutChanged = currentLayoutRef.current !== layout
    const nodeStyleChanged = currentNodeStyleRef.current !== nodeStyle

    // Determine if we're in force mode (only for simple nodes)
    const isForceMode = layout === 'force' && nodeStyle === 'simple'
    const wasForceMode =
      currentLayoutRef.current === 'force' &&
      currentNodeStyleRef.current === 'simple'

    // First initialization
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

    // ========================================
    // NODE STYLE CHANGED - Full rebuild
    // ========================================
    if (nodeStyleChanged) {
      stopSimulation()

      // When node style changes, reset to hierarchical layout
      const newLayout: GraphLayout = 'hierarchical'
      const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
        nodeStyle,
        filterMode,
        showLabels,
        isForceLayout: false, // Always false when resetting
      })
      const visibleIds = new Set(newNodes.map((n) => n.id))
      const newEdges = createEdges(items, visibleIds, matchedIds, 'dependency')
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)

      setNodes(layoutedNodes)
      setEdges(newEdges)

      // Update store to hierarchical if it wasn't already
      if (layout !== 'hierarchical') {
        setGraphOptions({ layout: 'hierarchical' })
      }

      currentNodeStyleRef.current = nodeStyle
      currentLayoutRef.current = 'hierarchical'

      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      return
    }

    // ========================================
    // LAYOUT CHANGED
    // ========================================
    if (layoutChanged) {
      // Can only use force layout with simple nodes
      if (layout === 'force' && nodeStyle !== 'simple') {
        // Invalid state - force with detailed nodes, reset to hierarchical
        setGraphOptions({ layout: 'hierarchical' })
        return
      }

      if (layout === 'force') {
        // Switching TO force mode
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

        // Preserve current positions for smooth transition
        const currentPositions = new Map(
          nodesRef.current.map((n) => [n.id, n.position]),
        )
        const positionedNodes = newNodes.map((n) => ({
          ...n,
          position: currentPositions.get(n.id) || n.position,
        }))

        setNodes(positionedNodes)
        setEdges(newEdges)

        // Start simulation with positioned nodes
        setTimeout(() => {
          startForceSimulation(positionedNodes, newEdges)
        }, 50)
      } else {
        // Switching TO hierarchical mode
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

    // ========================================
    // ONLY DATA CHANGED (filters, labels, etc.)
    // ========================================
    const newNodes = createNodes(items, matchedIds, hasActiveFilter, {
      nodeStyle,
      filterMode,
      showLabels,
      isForceLayout: isForceMode,
    })
    const visibleIds = new Set(newNodes.map((n) => n.id))
    const edgeType = isForceMode ? 'forceArrow' : 'dependency'
    const newEdges = createEdges(items, visibleIds, matchedIds, edgeType)

    // Check if structure changed
    const currentIds = new Set(nodesRef.current.map((n) => n.id))
    const newIds = new Set(newNodes.map((n) => n.id))
    const structureChanged =
      currentIds.size !== newIds.size ||
      [...newIds].some((id) => !currentIds.has(id))

    if (structureChanged) {
      // Structure changed - need full relayout
      stopSimulation()
      const layoutedNodes = applyDagreLayout(newNodes, newEdges, nodeStyle)
      setNodes(layoutedNodes)
      setEdges(newEdges)
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
    } else {
      // Just update data without changing positions
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
    graphOptions,
    setNodes,
    setEdges,
    setGraphOptions,
    fitView,
    startForceSimulation,
    stopSimulation,
  ])

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

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
      useViewModeStore.getState().graphOptions
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
      // Start fresh force simulation
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
      const data = node.data as { type: Item['type']; isDimmed: boolean }
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

  // Lock handling
  const handleNodesChange = graphOptions.nodesLocked ? undefined : onNodesChange

  // ============================================================================
  // RENDER
  // ============================================================================

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
        {/* Arrow marker definitions for force layout */}
        <ForceArrowMarkerDefs />
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
