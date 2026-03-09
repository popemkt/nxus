/**
 * GraphCanvas Component
 *
 * Canvas-based 2D graph renderer using react-force-graph-2d.
 * Replaces the React Flow-based Graph2D with performant Canvas rendering.
 *
 * Features:
 * - Convex hull overlays for grouping (controlled by display.groupingDimension)
 * - Reads physics/display/filter/localGraph from the shared graph store
 * - Reheats simulation when grouping or physics change
 * - Custom node/link painting with dimming for local graph and search
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { polygonHull } from 'd3-polygon'

import type { GraphData, GraphNode, GraphEdge } from '../../provider/types'
import {
  useGraphPhysics,
  useGraphDisplay,
  useGraphLocalGraph,
} from '../../store'
import {
  NO_SUPERTAG_COLOR,
  VIRTUAL_NODE_COLOR,
} from '../../provider/utils/color-palette'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Library has loose generic types
type ForceGraphComponent = ComponentType<Record<string, any>>

/** Subset of ForceGraph methods we use via ref */
interface ForceGraphRef {
  d3Force: (
    name: string,
  ) =>
    | { strength: (v: number) => void; distance?: (v: number) => void }
    | undefined
  zoomToFit: (duration: number, padding: number) => void
  d3ReheatSimulation: () => void
}

// ============================================================================
// Types
// ============================================================================

/** Internal node type for react-force-graph-2d */
interface CanvasNode {
  id: string
  label: string
  graphNode: GraphNode
  val: number
  color: string
  x?: number
  y?: number
  fx?: number
  fy?: number
}

/** Internal link type for react-force-graph-2d */
interface CanvasLink {
  source: string | CanvasNode
  target: string | CanvasNode
  graphEdge: GraphEdge
}

export interface GraphCanvasProps {
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
// Grouping Dimensions
// ============================================================================

interface GroupInfo {
  key: string
  label: string
  color: string
}

interface GroupingDimension {
  id: string
  getGroups: (node: GraphNode) => Array<GroupInfo>
}

const GROUPING_DIMENSIONS: Array<GroupingDimension> = [
  {
    id: 'supertag',
    getGroups: (node) =>
      node.supertag
        ? [
            {
              key: node.supertag.id,
              label: node.supertag.name,
              color: node.supertag.color,
            },
          ]
        : [],
  },
  {
    id: 'type',
    getGroups: (node) => [
      {
        key: node.type,
        label: node.type,
        color:
          node.type === 'node'
            ? '#3b82f6'
            : node.type === 'tag'
              ? '#22c55e'
              : '#a855f7',
      },
    ],
  },
]

// ============================================================================
// Helpers
// ============================================================================

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return `rgba(128,128,128,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(128,128,128,${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function expandHull(
  hull: Array<[number, number]>,
  padding: number,
): Array<[number, number]> {
  if (hull.length < 3) return hull
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist === 0) return [x + padding, y] as [number, number]
    const scale = (dist + padding) / dist
    return [cx + dx * scale, cy + dy * scale] as [number, number]
  })
}

function drawSmoothCurve(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
) {
  if (points.length < 3) return
  ctx.beginPath()
  const last = points[points.length - 1]!
  const first = points[0]!
  ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2)
  for (let i = 0; i < points.length; i++) {
    const curr = points[i]!
    const next = points[(i + 1) % points.length]!
    ctx.quadraticCurveTo(
      curr[0],
      curr[1],
      (curr[0] + next[0]) / 2,
      (curr[1] + next[1]) / 2,
    )
  }
  ctx.closePath()
}

function getNodeColor(
  node: GraphNode,
  colorBy: 'supertag' | 'type' | 'none',
  supertagColors: Map<string, string>,
): string {
  if (colorBy === 'none') return '#9ca3af'
  if (node.isVirtual) return VIRTUAL_NODE_COLOR
  if (colorBy === 'supertag' && node.supertag) {
    return supertagColors.get(node.supertag.id) ?? node.supertag.color
  }
  if (colorBy === 'type') {
    if (node.type === 'node') return '#3b82f6'
    if (node.type === 'tag') return '#22c55e'
    return '#a855f7'
  }
  return NO_SUPERTAG_COLOR
}

function getNodeVal(
  node: GraphNode,
  sizeBy: 'uniform' | 'connections',
): number {
  if (sizeBy === 'uniform') return 4
  return 3 + node.totalConnections * 1.5
}

// ============================================================================
// Main Component
// ============================================================================

export function GraphCanvas({
  data,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
  selectedNodeId,
  className,
}: GraphCanvasProps) {
  const graphRef = useRef<ForceGraphRef>(null)

  // Dynamic import (Canvas API requires browser, not SSR-safe)
  const [ForceGraph2D, setForceGraph2D] = useState<ForceGraphComponent | null>(
    null,
  )
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    import('react-force-graph-2d')
      .then((mod) => setForceGraph2D(() => mod.default))
      .catch((err) => {
        console.error('Failed to load graph renderer', err)
        setLoadError(true)
      })
  }, [])

  // Store settings
  const physics = useGraphPhysics()
  const display = useGraphDisplay()
  const localGraph = useGraphLocalGraph()

  // Hover state
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)

  // Double-click detection
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  // Track whether any node matches search (for dimming logic)
  const hasSearchMatches = useMemo(
    () => data.nodes.some((n) => n.isMatched),
    [data.nodes],
  )
  // Treat search as "active" only when some nodes are matched but not all
  const isSearchFiltering = useMemo(
    () => hasSearchMatches && data.nodes.some((n) => !n.isMatched),
    [data.nodes, hasSearchMatches],
  )

  // ============================================================================
  // Canvas graph data
  // ============================================================================

  const canvasData = useMemo(() => {
    const nodes: Array<CanvasNode> = data.nodes.map((gn) => ({
      id: gn.id,
      label: gn.label,
      graphNode: gn,
      val: getNodeVal(gn, display.nodeSize),
      color: getNodeColor(gn, display.colorBy, data.supertagColors),
    }))

    const nodeIdSet = new Set(data.nodes.map((n) => n.id))
    const links: Array<CanvasLink> = data.edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((ge) => ({
        source: ge.source,
        target: ge.target,
        graphEdge: ge,
      }))

    return { nodes, links }
  }, [data, display.nodeSize, display.colorBy])

  // ============================================================================
  // Active grouping dimension
  // ============================================================================

  const activeDimension = useMemo(
    () =>
      display.groupingDimension
        ? (GROUPING_DIMENSIONS.find(
            (d) => d.id === display.groupingDimension,
          ) ?? null)
        : null,
    [display.groupingDimension],
  )

  // ============================================================================
  // Force configuration — reads store physics, adapts to node count
  // Reheats when grouping or physics change
  // ============================================================================

  const prevGroupingRef = useRef(display.groupingDimension)

  useEffect(() => {
    const fg = graphRef.current
    if (!fg) return

    const n = canvasData.nodes.length
    // Adaptive charge: use store repelForce as base, scale with node count
    const baseCharge = -physics.repelForce
    const charge =
      n > 100 ? baseCharge * 0.5 : n > 50 ? baseCharge * 0.8 : baseCharge

    fg.d3Force('charge')?.strength(charge)
    fg.d3Force('link')?.distance?.(physics.linkDistance)
    fg.d3Force('center')?.strength(physics.centerForce * 0.1)

    // Reheat when grouping changes so nodes can reorganize around new hulls
    if (prevGroupingRef.current !== display.groupingDimension) {
      prevGroupingRef.current = display.groupingDimension
      fg.d3ReheatSimulation()
    }
  }, [
    canvasData.nodes.length,
    physics.repelForce,
    physics.linkDistance,
    physics.centerForce,
    display.groupingDimension,
  ])

  // Also reheat when physics sliders change so the user sees immediate feedback
  useEffect(() => {
    graphRef.current?.d3ReheatSimulation()
  }, [physics.repelForce, physics.linkDistance, physics.centerForce, physics.linkForce])

  // ============================================================================
  // Node rendering
  // ============================================================================

  const paintNode = useCallback(
    (node: CanvasNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const { x, y, val, color, label, id, graphNode } = node
      if (x == null || y == null) return

      const radius = Math.sqrt(val) * 2
      const isHovered = id === hoverNodeId
      const isSelected = id === selectedNodeId
      const isFocused = graphNode.isFocused
      const isDimmedByLocalGraph =
        localGraph.enabled &&
        !graphNode.isInLocalGraph &&
        !graphNode.isFocused
      const isDimmedBySearch = isSearchFiltering && !graphNode.isMatched
      const isDimmed = isDimmedByLocalGraph || isDimmedBySearch

      // Node circle
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = isDimmed ? hexToRgba(color, 0.25) : color
      ctx.fill()

      // Selection/hover/focus ring
      if (isSelected || isHovered || isFocused) {
        ctx.strokeStyle = isSelected
          ? '#fff'
          : isFocused
            ? '#fbbf24'
            : hexToRgba(color, 0.8)
        ctx.lineWidth = (isSelected || isFocused ? 2.5 : 1.5) / globalScale
        ctx.stroke()
      }

      // Label
      const showLabel =
        display.nodeLabels === 'always' ||
        (display.nodeLabels === 'hover' &&
          (isHovered || isSelected || isFocused)) ||
        globalScale > 1.2
      if (showLabel) {
        const fontSize = Math.max(10 / globalScale, 3)
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isDimmed
          ? 'rgba(255,255,255,0.3)'
          : 'rgba(255,255,255,0.9)'
        ctx.fillText(label, x, y + radius + 2 / globalScale)
      }
    },
    [
      hoverNodeId,
      selectedNodeId,
      localGraph.enabled,
      display.nodeLabels,
      isSearchFiltering,
      canvasData,
    ],
  )

  const nodePointerArea = useCallback(
    (node: CanvasNode, color: string, ctx: CanvasRenderingContext2D) => {
      const { x, y, val } = node
      if (x == null || y == null) return
      const radius = Math.sqrt(val) * 2 + 3
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    [],
  )

  // ============================================================================
  // Link rendering
  // ============================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-force-graph-2d link type
  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = link.source
      const target = link.target
      if (source?.x == null || source?.y == null || target?.x == null || target?.y == null) return

      const graphEdge: GraphEdge | undefined = link.graphEdge
      const isDimmed =
        localGraph.enabled && graphEdge && !graphEdge.isInLocalGraph

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist === 0) return

      // Clip line to node outlines (not center-to-center)
      const sourceRadius = Math.sqrt(source.val || 3) * 2
      const targetRadius = Math.sqrt(target.val || 3) * 2
      const sourceRatio = sourceRadius / dist
      const targetRatio = targetRadius / dist

      const x1 = source.x + dx * sourceRatio
      const y1 = source.y + dy * sourceRatio
      const x2 = target.x - dx * targetRatio
      const y2 = target.y - dy * targetRatio

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = isDimmed
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = (isDimmed ? 0.3 : 0.5) / globalScale
      ctx.stroke()

      // Arrow head at target outline
      if (!isDimmed) {
        const arrowLen = 4 / globalScale
        const arrowAngle = Math.PI / 6
        const angle = Math.atan2(dy, dx)

        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(
          x2 - arrowLen * Math.cos(angle - arrowAngle),
          y2 - arrowLen * Math.sin(angle - arrowAngle),
        )
        ctx.lineTo(
          x2 - arrowLen * Math.cos(angle + arrowAngle),
          y2 - arrowLen * Math.sin(angle + arrowAngle),
        )
        ctx.closePath()
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.fill()
      }
    },
    [localGraph.enabled],
  )

  // ============================================================================
  // Convex hull overlay
  // ============================================================================

  const drawHulls = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!activeDimension) return

      const groupPoints = new Map<
        string,
        { points: Array<[number, number]>; color: string; label: string }
      >()

      for (const node of canvasData.nodes) {
        if (node.x == null || node.y == null) continue
        const groups = activeDimension.getGroups(node.graphNode)
        for (const g of groups) {
          if (!groupPoints.has(g.key)) {
            groupPoints.set(g.key, {
              points: [],
              color: g.color,
              label: g.label,
            })
          }
          groupPoints.get(g.key)!.points.push([node.x, node.y])
        }
      }

      const padding = 25 / globalScale

      for (const [, { points, color, label }] of groupPoints) {
        if (points.length === 0) continue

        if (points.length === 1) {
          const p = points[0]!
          ctx.beginPath()
          ctx.arc(p[0], p[1], padding, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba(color, 0.08)
          ctx.strokeStyle = hexToRgba(color, 0.3)
          ctx.lineWidth = 1.5 / globalScale
          ctx.fill()
          ctx.stroke()
        } else if (points.length === 2) {
          const p0 = points[0]!
          const p1 = points[1]!
          const mx = (p0[0] + p1[0]) / 2
          const my = (p0[1] + p1[1]) / 2
          const dx = p1[0] - p0[0]
          const dy = p1[1] - p0[1]
          const dist = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx)

          ctx.save()
          ctx.translate(mx, my)
          ctx.rotate(angle)
          ctx.beginPath()
          ctx.ellipse(0, 0, dist / 2 + padding, padding, 0, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba(color, 0.08)
          ctx.strokeStyle = hexToRgba(color, 0.3)
          ctx.lineWidth = 1.5 / globalScale
          ctx.fill()
          ctx.stroke()
          ctx.restore()
        } else {
          const hull = polygonHull(points)
          if (!hull) continue
          const expanded = expandHull(hull, padding)
          drawSmoothCurve(ctx, expanded)
          ctx.fillStyle = hexToRgba(color, 0.08)
          ctx.strokeStyle = hexToRgba(color, 0.3)
          ctx.lineWidth = 1.5 / globalScale
          ctx.fill()
          ctx.stroke()
        }

        // Group label
        if (points.length > 0 && globalScale > 0.4) {
          const cx = points.reduce((s, p) => s + p[0], 0) / points.length
          const topY =
            Math.min(...points.map((p) => p[1])) -
            padding -
            5 / globalScale
          const fontSize = Math.max(11 / globalScale, 4)
          ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillStyle = hexToRgba(color, 0.7)
          ctx.fillText(label, cx, topY)
        }
      }
    },
    [activeDimension, canvasData.nodes],
  )

  // ============================================================================
  // Interactions
  // ============================================================================

  const handleNodeClick = useCallback(
    (node: CanvasNode) => {
      const now = Date.now()
      const last = lastClickRef.current

      // Double-click detection
      if (last && last.id === node.id && now - last.time < 300) {
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
        lastClickRef.current = null
        onNodeDoubleClick?.(node.id, node.graphNode)
        return
      }

      lastClickRef.current = { id: node.id, time: now }

      // Delay single click to allow double-click detection
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        onNodeClick?.(node.id, node.graphNode)
      }, 300)
    },
    [onNodeClick, onNodeDoubleClick],
  )

  const handleNodeHover = useCallback((node: CanvasNode | null) => {
    setHoverNodeId(node?.id ?? null)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    onBackgroundClick?.()
  }, [onBackgroundClick])

  // ============================================================================
  // Render
  // ============================================================================

  if (!ForceGraph2D) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-background ${className ?? ''}`}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <span className="text-sm">
            {loadError ? 'Failed to load graph renderer' : 'Loading graph...'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <ForceGraph2D
        ref={graphRef}
        graphData={canvasData}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={nodePointerArea}
        linkCanvasObject={paintLink}
        onRenderFramePre={drawHulls}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        backgroundColor="hsl(240 10% 4%)"
        cooldownTime={8000}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag
        enableZoomPanInteraction
        minZoom={0.1}
        maxZoom={8}
      />
    </div>
  )
}
