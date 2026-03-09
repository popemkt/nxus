/**
 * Canvas2DGraph — performant canvas-based 2D graph with convex hull overlays.
 *
 * Replaces the previous React Flow graph. Uses react-force-graph-2d for
 * O(1) per-frame rendering regardless of node count.
 *
 * Reads options from useViewModeStore:
 * - filterMode: highlight vs show-only
 * - showLabels: toggle node labels
 * - nodesLocked: disable node dragging
 * - groupingDimension: convex hull grouping
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import { polygonHull } from 'd3-polygon'
import type { Item } from '@nxus/db'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nxus/ui'
import {
  ArrowsOutCardinalIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  GearSixIcon,
  LockIcon,
  LockOpenIcon,
  StackIcon,
  TagIcon,
  XIcon,
} from '@phosphor-icons/react'
import { APP_TYPE_COLORS } from '@/lib/app-constants'
import { GROUPING_DIMENSIONS } from '@/lib/graph-grouping'
import { useViewModeStore } from '@/stores/view-mode.store'
import { useTagUIStore } from '@/stores/tag-ui.store'
import { useTagDataStore } from '@/stores/tag-data.store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Library has loose generic types
type ForceGraphComponent = ComponentType<Record<string, any>>

/** Subset of ForceGraph methods we use via ref */
interface ForceGraphRef {
  d3Force: (
    name: string,
  ) => { strength: (v: number) => void; distance?: (v: number) => void } | undefined
  zoomToFit: (duration: number, padding: number) => void
  d3ReheatSimulation: () => void
}

// ============================================================================
// Types
// ============================================================================

interface GraphNode {
  id: string
  name: string
  item: Item
  val: number
  color: string
  x?: number
  y?: number
  fx?: number
  fy?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}

interface Canvas2DGraphProps {
  items: Array<Item>
  searchQuery: string
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

/** BFS to find N-hop neighborhood from a focus node */
function getEgoSubgraph(
  items: Array<Item>,
  focusId: string,
  depth: number,
): Set<string> {
  const visited = new Set<string>([focusId])
  let frontier = [focusId]

  const adj = new Map<string, Set<string>>()
  for (const item of items) {
    if (!adj.has(item.id)) adj.set(item.id, new Set())
    for (const depId of item.dependencies ?? []) {
      adj.get(item.id)!.add(depId)
      if (!adj.has(depId)) adj.set(depId, new Set())
      adj.get(depId)!.add(item.id)
    }
  }

  for (let d = 0; d < depth; d++) {
    const next: Array<string> = []
    for (const id of frontier) {
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          next.push(neighbor)
        }
      }
    }
    frontier = next
  }
  return visited
}

/** Expand hull points outward from centroid */
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

/** Draw smooth closed curve through points using quadratic Bezier */
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

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return `rgba(128,128,128,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(128,128,128,${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ============================================================================
// Main Component
// ============================================================================

export function Canvas2DGraph({
  items,
  searchQuery,
  className,
}: Canvas2DGraphProps) {
  const navigate = useNavigate()
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

  // Ego network state
  const [egoNodeId, setEgoNodeId] = useState<string | null>(null)
  const [egoDepth, setEgoDepth] = useState(1)

  // Store options
  const graphOptions = useViewModeStore((s) => s.graphOptions)
  const setGraphOptions = useViewModeStore((s) => s.setGraphOptions)
  const { filterMode, nodesLocked, showLabels, groupingDimension } = graphOptions
  const selectedTagIds = useTagUIStore((s) => s.selectedTagIds)
  const tags = useTagDataStore((s) => s.tags)

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

  // ============================================================================
  // Computed: matched IDs for filtering
  // ============================================================================

  const matchedIds = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()
    const hasActiveFilter = lowerQuery !== '' || selectedTagIds.size > 0
    if (!hasActiveFilter) return new Set(items.map((i) => i.id))

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
        item.metadata.tags.some((t) =>
          t.name.toLowerCase().includes(lowerQuery),
        )
      const matchesTags =
        tagNamesSet.size === 0 ||
        item.metadata.tags.some((t) => tagNamesSet.has(t.name))
      if (matchesSearch && matchesTags) matched.add(item.id)
    })
    return matched
  }, [items, searchQuery, selectedTagIds, tags])

  const hasActiveFilter = searchQuery.trim() !== '' || selectedTagIds.size > 0

  // ============================================================================
  // Computed: graph data
  // ============================================================================

  const graphData = useMemo(() => {
    let visibleItems = items

    if (egoNodeId) {
      const egoSet = getEgoSubgraph(items, egoNodeId, egoDepth)
      visibleItems = items.filter((i) => egoSet.has(i.id))
    }

    if (hasActiveFilter && filterMode === 'show-only') {
      visibleItems = visibleItems.filter((i) => matchedIds.has(i.id))
    }

    // Dependents count for sizing
    const dependentsCount = new Map<string, number>()
    items.forEach((item) => {
      ;(item.dependencies ?? []).forEach((depId) => {
        dependentsCount.set(depId, (dependentsCount.get(depId) || 0) + 1)
      })
    })

    const visibleIds = new Set(visibleItems.map((i) => i.id))

    const nodes: Array<GraphNode> = visibleItems.map((item) => ({
      id: item.id,
      name: item.name,
      item,
      val: 3 + (dependentsCount.get(item.id) || 0) * 2,
      color: APP_TYPE_COLORS[item.type] ?? '#888',
    }))

    const links: Array<GraphLink> = []
    visibleItems.forEach((item) => {
      ;(item.dependencies ?? []).forEach((depId) => {
        if (visibleIds.has(depId)) {
          links.push({ source: item.id, target: depId })
        }
      })
    })

    return { nodes, links }
  }, [items, egoNodeId, egoDepth, hasActiveFilter, filterMode, matchedIds])

  // ============================================================================
  // Active grouping dimension
  // ============================================================================

  const activeDimension = useMemo(
    () =>
      groupingDimension
        ? (GROUPING_DIMENSIONS.find((d) => d.id === groupingDimension) ?? null)
        : null,
    [groupingDimension],
  )

  // ============================================================================
  // Force configuration (adaptive + reheat on grouping change)
  // ============================================================================

  const prevGroupingRef = useRef(groupingDimension)

  useEffect(() => {
    const fg = graphRef.current
    if (!fg) return

    const n = graphData.nodes.length
    const charge = n > 100 ? -100 : n > 50 ? -180 : -280
    const linkDist = n > 100 ? 40 : n > 50 ? 60 : 80

    fg.d3Force('charge')?.strength(charge)
    fg.d3Force('link')?.distance?.(linkDist)
    fg.d3Force('center')?.strength(0.05)

    // Reheat when grouping changes
    if (prevGroupingRef.current !== groupingDimension) {
      prevGroupingRef.current = groupingDimension
      fg.d3ReheatSimulation()
    }
  }, [graphData.nodes.length, groupingDimension])

  // ============================================================================
  // Node rendering
  // ============================================================================

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const { x, y, val, color, name, id } = node
      if (x == null || y == null) return

      const radius = Math.sqrt(val) * 2
      const isHovered = id === hoverNodeId
      const isEgoFocus = id === egoNodeId
      const isDimmed =
        hasActiveFilter &&
        filterMode === 'highlight' &&
        !matchedIds.has(id)

      // Node circle
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = isDimmed ? hexToRgba(color, 0.25) : color
      ctx.fill()

      // Hover/focus ring
      if (isHovered || isEgoFocus) {
        ctx.strokeStyle = isEgoFocus ? '#fff' : hexToRgba(color, 0.8)
        ctx.lineWidth = (isEgoFocus ? 2.5 : 1.5) / globalScale
        ctx.stroke()
      }

      // Label
      if (showLabels && (globalScale > 0.8 || isHovered || isEgoFocus)) {
        const fontSize = Math.max(10 / globalScale, 3)
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isDimmed
          ? 'rgba(255,255,255,0.3)'
          : 'rgba(255,255,255,0.9)'
        ctx.fillText(name, x, y + radius + 2 / globalScale)
      }
    },
    [hoverNodeId, egoNodeId, hasActiveFilter, filterMode, matchedIds, showLabels],
  )

  const nodePointerArea = useCallback(
    (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
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

      const isDimmed =
        hasActiveFilter &&
        filterMode === 'highlight' &&
        (!matchedIds.has(source.id) || !matchedIds.has(target.id))

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
    [hasActiveFilter, filterMode, matchedIds],
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

      for (const node of graphData.nodes) {
        if (node.x == null || node.y == null) continue
        const groups = activeDimension.getGroups(node.item)
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
    [activeDimension, graphData.nodes],
  )

  // ============================================================================
  // Interactions
  // ============================================================================

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const now = Date.now()
      const last = lastClickRef.current

      // Double-click detection
      if (last && last.id === node.id && now - last.time < 300) {
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
        lastClickRef.current = null
        navigate({ to: '/apps/$appId', params: { appId: node.id } })
        return
      }

      lastClickRef.current = { id: node.id, time: now }

      // Delay single click to allow double-click detection
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        setEgoNodeId((prev) => (prev === node.id ? null : node.id))
      }, 300)
    },
    [navigate],
  )

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNodeId(node?.id ?? null)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setEgoNodeId(null)
  }, [])

  const handleCenterGraph = useCallback(() => {
    graphRef.current?.zoomToFit(300, 40)
  }, [])

  // ============================================================================
  // Render
  // ============================================================================

  if (!ForceGraph2D) {
    return (
      <div
        className={cn(
          'w-full h-full min-h-[500px] flex items-center justify-center bg-background',
          className,
        )}
      >
        <span className="text-muted-foreground text-sm">
          {loadError ? 'Failed to load graph renderer' : 'Loading graph...'}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('relative w-full h-full min-h-[500px]', className)}>
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
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
        enableNodeDrag={!nodesLocked}
        enableZoomPanInteraction
        minZoom={0.1}
        maxZoom={8}
      />

      {/* Controls overlay */}
      <div className="absolute top-3 left-3 flex gap-1 p-1 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm z-10">
        {/* Lock toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', nodesLocked && 'bg-muted')}
          onClick={() => setGraphOptions({ nodesLocked: !nodesLocked })}
          title={nodesLocked ? 'Unlock nodes' : 'Lock nodes'}
        >
          {nodesLocked ? (
            <LockIcon className="h-4 w-4" />
          ) : (
            <LockOpenIcon className="h-4 w-4" />
          )}
        </Button>

        <div className="w-px bg-border" />

        {/* Center */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleCenterGraph}
          title="Center graph"
        >
          <ArrowsOutCardinalIcon className="h-4 w-4" />
        </Button>

        <div className="w-px bg-border" />

        {/* Grouping dimension picker */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground',
              groupingDimension && 'bg-muted',
            )}
            title="Group overlay"
          >
            <StackIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
              Group By
            </div>
            <DropdownMenuCheckboxItem
              checked={groupingDimension === null}
              onCheckedChange={() => setGraphOptions({ groupingDimension: null })}
            >
              None
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {GROUPING_DIMENSIONS.map((d) => (
              <DropdownMenuCheckboxItem
                key={d.id}
                checked={groupingDimension === d.id}
                onCheckedChange={() => setGraphOptions({ groupingDimension: d.id })}
              >
                {d.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px bg-border" />

        {/* Settings dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
            title="Graph options"
          >
            <GearSixIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {/* Filter mode */}
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
              Filter Mode
            </div>
            <DropdownMenuCheckboxItem
              checked={filterMode === 'highlight'}
              onCheckedChange={() => setGraphOptions({ filterMode: 'highlight' })}
            >
              <FunnelSimpleIcon className="h-4 w-4 mr-2" />
              Highlight matches
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filterMode === 'show-only'}
              onCheckedChange={() => setGraphOptions({ filterMode: 'show-only' })}
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              Show only matches
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            {/* Show labels toggle */}
            <DropdownMenuCheckboxItem
              checked={showLabels}
              onCheckedChange={(checked) =>
                setGraphOptions({ showLabels: !!checked })
              }
            >
              <TagIcon className="h-4 w-4 mr-2" />
              Show labels
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bottom-left: ego info (when focused) */}
      {egoNodeId && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-2 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm z-10">
          <span className="text-xs text-muted-foreground">Focused:</span>
          <span className="text-xs font-medium truncate max-w-[150px]">
            {items.find((i) => i.id === egoNodeId)?.name}
          </span>
          <div className="w-px h-4 bg-border" />
          <span className="text-xs text-muted-foreground">Depth:</span>
          {[1, 2, 3].map((d) => (
            <Button
              key={d}
              variant={egoDepth === d ? 'default' : 'ghost'}
              size="icon"
              className="h-6 w-6 text-xs"
              onClick={() => setEgoDepth(d)}
            >
              {d}
            </Button>
          ))}
          <div className="w-px h-4 bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setEgoNodeId(null)}
            title="Clear focus"
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Bottom-left: interaction hints (when not focused) */}
      {!egoNodeId && (
        <div className="absolute bottom-3 left-3 px-3 py-2 bg-popover/95 backdrop-blur-sm rounded-lg border shadow-sm z-10">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Click: focus</span>
            <span>Double-click: details</span>
          </div>
        </div>
      )}
    </div>
  )
}
