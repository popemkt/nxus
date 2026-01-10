import { useCallback, useMemo, useRef } from 'react'
import dagre from 'dagre'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'
import type { GraphLayout } from '@/stores/view-mode.store'

const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const COMMAND_NODE_SIZE = 60

interface UseGraphLayoutProps {
  nodes: Node[]
  edges: Edge[]
  layout: GraphLayout
}

interface ForceNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
}

export function useGraphLayout({ nodes, edges, layout }: UseGraphLayoutProps) {
  const { fitView, setNodes } = useReactFlow()
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map())
  const lastLayoutKey = useRef<string>('')

  // Dagre hierarchical layout
  const getDagreLayout = useCallback(
    (inputNodes: Node[], inputEdges: Edge[], direction: 'LR' | 'TB' = 'LR') => {
      const dagreGraph = new dagre.graphlib.Graph()
      dagreGraph.setDefaultEdgeLabel(() => ({}))
      dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 60,
        ranksep: 120,
        marginx: 50,
        marginy: 50,
      })

      inputNodes.forEach((node) => {
        const isCommand = node.type === 'command'
        dagreGraph.setNode(node.id, {
          width: isCommand ? COMMAND_NODE_SIZE : NODE_WIDTH,
          height: isCommand ? COMMAND_NODE_SIZE : NODE_HEIGHT,
        })
      })

      inputEdges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target)
      })

      dagre.layout(dagreGraph)

      const isHorizontal = direction === 'LR'
      return inputNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        const isCommand = node.type === 'command'
        const width = isCommand ? COMMAND_NODE_SIZE : NODE_WIDTH
        const height = isCommand ? COMMAND_NODE_SIZE : NODE_HEIGHT
        const position = {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        }
        positionCache.current.set(node.id, position)
        return {
          ...node,
          position,
          targetPosition: isHorizontal ? 'left' : 'top',
          sourcePosition: isHorizontal ? 'right' : 'bottom',
        } as Node
      })
    },
    [],
  )

  // D3 force-directed layout
  const getForceLayout = useCallback(
    (inputNodes: Node[], inputEdges: Edge[]) => {
      const forceNodes: ForceNode[] = inputNodes.map((node) => ({
        id: node.id,
        x: positionCache.current.get(node.id)?.x ?? Math.random() * 800,
        y: positionCache.current.get(node.id)?.y ?? Math.random() * 600,
        width: node.type === 'command' ? COMMAND_NODE_SIZE : NODE_WIDTH,
        height: node.type === 'command' ? COMMAND_NODE_SIZE : NODE_HEIGHT,
      }))

      const forceLinks: SimulationLinkDatum<ForceNode>[] = inputEdges.map(
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
            .distance(180),
        )
        .force('charge', forceManyBody().strength(-400))
        .force('center', forceCenter(400, 300))
        .force(
          'collide',
          forceCollide<ForceNode>().radius(
            (d) => Math.max(d.width, d.height) / 2 + 20,
          ),
        )
        .stop()

      // Run simulation
      for (let i = 0; i < 300; i++) {
        simulation.tick()
      }

      const nodeMap = new Map(forceNodes.map((n) => [n.id, n]))

      return inputNodes.map((node) => {
        const forceNode = nodeMap.get(node.id)
        const position = {
          x: forceNode?.x ?? 0,
          y: forceNode?.y ?? 0,
        }
        positionCache.current.set(node.id, position)
        return {
          ...node,
          position,
        } as Node
      })
    },
    [],
  )

  // Compute layout based on current layout type
  const layoutedElements = useMemo(() => {
    if (nodes.length === 0) {
      positionCache.current.clear()
      lastLayoutKey.current = ''
      return { nodes: [], edges }
    }

    const layoutKey = `${layout}-${nodes
      .map((n) => n.id)
      .sort()
      .join(',')}`

    // Only recompute if layout type or structure changed
    if (layoutKey === lastLayoutKey.current) {
      // Just update node data, preserve positions
      return {
        nodes: nodes.map((node) => ({
          ...node,
          position: positionCache.current.get(node.id) || { x: 0, y: 0 },
        })),
        edges,
      }
    }

    lastLayoutKey.current = layoutKey

    const layoutedNodes =
      layout === 'hierarchical'
        ? getDagreLayout(nodes, edges, 'LR')
        : getForceLayout(nodes, edges)

    return { nodes: layoutedNodes, edges }
  }, [nodes, edges, layout, getDagreLayout, getForceLayout])

  // Manual re-layout function
  const runLayout = useCallback(
    (newLayout: GraphLayout) => {
      const layoutedNodes =
        newLayout === 'hierarchical'
          ? getDagreLayout(nodes, edges, 'LR')
          : getForceLayout(nodes, edges)

      setNodes(layoutedNodes)
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 })
      }, 50)
    },
    [nodes, edges, getDagreLayout, getForceLayout, setNodes, fitView],
  )

  return {
    layoutedNodes: layoutedElements.nodes,
    layoutedEdges: layoutedElements.edges,
    runLayout,
  }
}
