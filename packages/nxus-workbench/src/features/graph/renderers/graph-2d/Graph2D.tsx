/**
 * Graph2D Component
 *
 * Main 2D graph renderer using React Flow.
 * Converts GraphData from the provider into an interactive visualization.
 *
 * Uses continuous force simulation like Obsidian for smooth, interactive graphs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type NodeMouseHandler,
  BackgroundVariant,
  ConnectionMode,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { GraphData, GraphNode, GraphEdge } from '../../provider/types'
import {
  useGraphStore,
  useGraphPhysics,
  useGraphDisplay,
  useGraphLocalGraph,
} from '../../store'
import { graphNodeTypes, type GraphNodeData } from './nodes'
import { graphEdgeTypes, type GraphEdgeData } from './edges'
import { useForceLayout } from './layouts'

// ============================================================================
// Types
// ============================================================================

export interface Graph2DProps {
  /** Graph data from the provider */
  data: GraphData
  /** Callback when a node is clicked (for selection) */
  onNodeClick?: (nodeId: string, node: GraphNode) => void
  /** Callback when a node is double-clicked (for navigation) */
  onNodeDoubleClick?: (nodeId: string, node: GraphNode) => void
  /** Callback when background is clicked (clear selection) */
  onBackgroundClick?: () => void
  /** Currently selected node ID */
  selectedNodeId?: string | null
  /** CSS class name */
  className?: string
}

// ============================================================================
// Data Conversion
// ============================================================================

/**
 * Convert GraphNode[] to React Flow Node[]
 *
 * Note: We use type assertion because React Flow expects Record<string, unknown>
 * but our GraphNodeData interface is more strictly typed.
 */
function convertToFlowNodes(
  graphNodes: GraphNode[],
  displayOptions: {
    nodeSize: 'uniform' | 'connections'
    nodeLabels: 'always' | 'hover' | 'never'
  },
  hoveredNodeId: string | null,
  selectedNodeId: string | null,
): Node[] {
  return graphNodes.map((graphNode) => {
    const nodeData: GraphNodeData = {
      ...graphNode,
      nodeSize: displayOptions.nodeSize,
      labelVisibility: displayOptions.nodeLabels,
      isHovered: graphNode.id === hoveredNodeId,
    }
    return {
      id: graphNode.id,
      type: 'simple' as const, // Use simple nodes for force-directed layout
      position: { x: 0, y: 0 }, // Initial position, will be set by layout
      data: nodeData as unknown as Record<string, unknown>,
      selected: graphNode.id === selectedNodeId,
    }
  })
}

/**
 * Convert GraphEdge[] to React Flow Edge[]
 *
 * Note: We use type assertion because React Flow expects Record<string, unknown>
 * but our GraphEdgeData interface is more strictly typed.
 */
function convertToFlowEdges(
  graphEdges: GraphEdge[],
  displayOptions: {
    edgeStyle: 'solid' | 'animated'
    edgeLabels: 'always' | 'hover' | 'never'
  },
  hoveredEdgeId: string | null,
): Edge[] {
  return graphEdges.map((graphEdge) => {
    const edgeData: GraphEdgeData = {
      ...graphEdge,
      edgeStyle: displayOptions.edgeStyle,
      labelVisibility: displayOptions.edgeLabels,
      isHovered: graphEdge.id === hoveredEdgeId,
    }
    // Use straight edges for minimalist look like Obsidian
    // 'animated' uses particles, 'solid' uses simple straight lines
    const edgeType = displayOptions.edgeStyle === 'animated' ? 'animated' : 'straight'
    return {
      id: graphEdge.id,
      source: graphEdge.source,
      target: graphEdge.target,
      type: edgeType,
      data: edgeData as unknown as Record<string, unknown>,
    }
  })
}

// ============================================================================
// Inner Component (must be inside ReactFlowProvider)
// ============================================================================

function Graph2DInner({
  data,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
  selectedNodeId,
}: Omit<Graph2DProps, 'className'>) {
  const reactFlowInstance = useReactFlow()

  // Store hooks
  const physics = useGraphPhysics()
  const display = useGraphDisplay()
  const localGraph = useGraphLocalGraph()
  const setLocalGraph = useGraphStore((s) => s.setLocalGraph)

  // Local state - use refs to avoid triggering re-renders that reset layout
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const isInitialLayoutDone = useRef(false)

  // Create node map for quick lookups
  const nodeMap = useMemo(() => {
    return new Map(data.nodes.map((n) => [n.id, n]))
  }, [data.nodes])

  // Convert GraphData to React Flow format - exclude hover state to prevent re-layout
  const flowNodes = useMemo(
    () =>
      convertToFlowNodes(
        data.nodes,
        { nodeSize: display.nodeSize, nodeLabels: display.nodeLabels },
        null, // Don't include hover in initial conversion
        selectedNodeId ?? null,
      ),
    [data.nodes, display.nodeSize, display.nodeLabels, selectedNodeId],
  )

  const flowEdges = useMemo(
    () =>
      convertToFlowEdges(
        data.edges,
        { edgeStyle: display.edgeStyle, edgeLabels: display.edgeLabels },
        null, // Don't include hover in initial conversion
      ),
    [data.edges, display.edgeStyle, display.edgeLabels],
  )

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  // Force layout hook with continuous simulation
  // Center at origin (0,0) - React Flow handles viewport positioning
  const layout = useForceLayout({
    physics,
    continuous: true, // Enable continuous simulation like Obsidian
    centerX: 0,
    centerY: 0,
  })

  // Track node IDs to detect actual structure changes
  const nodeIdsRef = useRef<string>('')
  const edgeIdsRef = useRef<string>('')

  // Start continuous simulation when data changes (not on hover!)
  useEffect(() => {
    // Create stable identifiers for the graph structure
    const currentNodeIds = data.nodes.map((n) => n.id).sort().join(',')
    const currentEdgeIds = data.edges.map((e) => e.id).sort().join(',')

    // Only restart simulation if actual graph structure changed
    if (currentNodeIds !== nodeIdsRef.current || currentEdgeIds !== edgeIdsRef.current) {
      nodeIdsRef.current = currentNodeIds
      edgeIdsRef.current = currentEdgeIds

      if (flowNodes.length > 0) {
        // Start continuous simulation
        layout.startSimulation(flowNodes, flowEdges)

        // Fit view after simulation settles a bit
        if (!isInitialLayoutDone.current) {
          isInitialLayoutDone.current = true
        }
        // Always fit view when graph structure changes
        setTimeout(() => {
          reactFlowInstance.fitView({ padding: 0.2, duration: 300 })
        }, 100)
      }
    }
  }, [data.nodes, data.edges, flowNodes, flowEdges, layout, reactFlowInstance])

  // Fit view once after simulation has settled (alpha drops below threshold)
  const hasAutoFittedRef = useRef(false)
  useEffect(() => {
    const alpha = layout.simulationState?.alpha ?? 1
    // When simulation cools down enough (alpha < 0.1), fit view once
    if (alpha < 0.1 && !hasAutoFittedRef.current && nodes.length > 0) {
      hasAutoFittedRef.current = true
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 })
    }
    // Reset the flag when simulation restarts (alpha goes back up)
    if (alpha > 0.5) {
      hasAutoFittedRef.current = false
    }
  }, [layout.simulationState?.alpha, nodes.length, reactFlowInstance])

  // Update edges when they change (without affecting simulation)
  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  // Update physics when they change (for force layout)
  useEffect(() => {
    layout.updatePhysics(physics)
  }, [physics, layout])

  // Handle node click
  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const graphNode = nodeMap.get(node.id)
      if (graphNode && onNodeClick) {
        onNodeClick(node.id, graphNode)
      }
    },
    [nodeMap, onNodeClick],
  )

  // Handle node double-click (navigation or focus)
  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const graphNode = nodeMap.get(node.id)
      if (graphNode) {
        // If local graph is enabled, double-click changes focus
        if (localGraph.enabled) {
          setLocalGraph({ focusNodeId: node.id })
        }
        // Also fire the navigation callback
        if (onNodeDoubleClick) {
          onNodeDoubleClick(node.id, graphNode)
        }
      }
    },
    [nodeMap, localGraph.enabled, setLocalGraph, onNodeDoubleClick],
  )

  // Handle node hover - update node data directly without triggering full re-render
  const handleNodeMouseEnter: NodeMouseHandler = useCallback((event, node) => {
    setHoveredNodeId(node.id)
    // Update just the hovered node's data without changing positions
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === node.id) {
          return {
            ...n,
            data: { ...n.data, isHovered: true },
          }
        }
        return n
      }),
    )
  }, [setNodes])

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    const prevHoveredId = hoveredNodeId
    setHoveredNodeId(null)
    // Update just the previously hovered node's data
    if (prevHoveredId) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === prevHoveredId) {
            return {
              ...n,
              data: { ...n.data, isHovered: false },
            }
          }
          return n
        }),
      )
    }
  }, [hoveredNodeId, setNodes])

  // Handle pane click (background)
  const handlePaneClick = useCallback(() => {
    setHoveredNodeId(null)
    if (onBackgroundClick) {
      onBackgroundClick()
    }
  }, [onBackgroundClick])

  // Handle node drag (update simulation if in force mode)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)

      // Update position cache for dragged nodes
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.dragging) {
          // Pin node during drag if simulation is running
          if (layout.pinNode && layout.simulationState?.isRunning) {
            layout.pinNode(change.id, change.position.x, change.position.y)
          }
        }
        if (change.type === 'position' && !change.dragging && change.position) {
          // Unpin node after drag ends
          if (layout.unpinNode && layout.simulationState?.isRunning) {
            layout.unpinNode(change.id)
          }
        }
      })
    },
    [onNodesChange, layout],
  )

  // Minimap node color based on supertag
  const minimapNodeColor = useCallback(
    (node: Node) => {
      const graphNode = nodeMap.get(node.id)
      if (!graphNode) return '#6b7280'
      if (graphNode.isVirtual) return '#a855f7' // Purple for virtual
      return graphNode.supertag?.color ?? '#6b7280'
    },
    [nodeMap],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={graphNodeTypes}
      edgeTypes={graphEdgeTypes}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      onPaneClick={handlePaneClick}
      connectionMode={ConnectionMode.Loose}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      selectNodesOnDrag={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      panOnScroll={false}
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      {/* Background grid */}
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="hsl(var(--muted-foreground) / 0.2)"
      />

      {/* Minimap */}
      <MiniMap
        nodeColor={minimapNodeColor}
        nodeStrokeWidth={3}
        zoomable
        pannable
        className="!bg-background/80 !border-border"
      />

      {/* Zoom controls */}
      <Controls
        showZoom
        showFitView
        showInteractive={false}
        className="!bg-background/80 !border-border !shadow-lg"
      />

      {/* Stats panel */}
      <Panel position="bottom-left" className="text-xs text-muted-foreground">
        {data.stats.totalNodes} nodes · {data.stats.totalEdges} edges
        {data.stats.orphanCount > 0 && ` · ${data.stats.orphanCount} orphans`}
      </Panel>
    </ReactFlow>
  )
}

// ============================================================================
// Main Component
// ============================================================================

import { ReactFlowProvider } from '@xyflow/react'

/**
 * Graph2D - 2D graph visualization using React Flow.
 *
 * Features:
 * - Force-directed and hierarchical layouts
 * - Custom node components (SimpleNode, DetailedNode)
 * - Animated edges with directional particles
 * - Interactive physics controls
 * - Minimap and zoom controls
 * - Node selection and navigation
 *
 * @example
 * ```tsx
 * <Graph2D
 *   data={graphData}
 *   onNodeClick={(id, node) => setSelectedNode(id)}
 *   onNodeDoubleClick={(id, node) => navigate(`/node/${id}`)}
 *   selectedNodeId={selectedNode}
 * />
 * ```
 */
export function Graph2D({ className, ...props }: Graph2DProps) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <Graph2DInner {...props} />
      </ReactFlowProvider>
    </div>
  )
}

export default Graph2D
