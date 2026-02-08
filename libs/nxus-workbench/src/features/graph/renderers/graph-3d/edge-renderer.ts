/**
 * Custom 3D Edge/Link Rendering
 *
 * Provides utilities for customizing edge appearance in the 3D force graph.
 * Uses directional particles to show edge direction (like the 2D renderer).
 */

import type { Object3D } from 'three'
import type { Graph3DLink } from './use-3d-graph'
import type { EdgeDirection, EdgeType } from '../../provider/types'
import type { EdgeStyleOption } from '../../store/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for edge rendering
 */
export interface EdgeRenderOptions {
  /** Edge rendering style */
  edgeStyle: EdgeStyleOption
  /** Whether to show arrow heads */
  showArrows?: boolean
  /** Whether to show directional particles */
  showParticles?: boolean
}

/**
 * Result of computing edge visual properties
 */
export interface EdgeVisuals {
  /** Edge color (hex string or rgba) */
  color: string
  /** Edge width in pixels */
  width: number
  /** Opacity (0-1) */
  opacity: number
  /** Number of particles for animation */
  particleCount: number
  /** Particle speed (0-1) */
  particleSpeed: number
  /** Arrow length (0 = no arrow) */
  arrowLength: number
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Colors for different edge directions (matches 2D renderer)
 */
export const EDGE_DIRECTION_COLORS: Record<EdgeDirection, string> = {
  outgoing: '#14b8a6', // Teal-500
  incoming: '#8b5cf6', // Violet-500
}

/**
 * Colors for different edge types
 */
export const EDGE_TYPE_COLORS: Record<EdgeType, string> = {
  dependency: '#3b82f6', // Blue-500
  backlink: '#8b5cf6', // Violet-500
  reference: '#6b7280', // Gray-500
  hierarchy: '#22c55e', // Green-500
  tag: '#eab308', // Yellow-500
}

/**
 * Dimmed edge color for edges not in local graph
 */
export const DIMMED_EDGE_COLOR = 'rgba(107, 114, 128, 0.15)'

/**
 * Edge width values
 */
export const EDGE_WIDTHS = {
  normal: 1,
  highlighted: 2,
  hovered: 2.5,
}

/**
 * Particle settings
 */
export const PARTICLE_SETTINGS = {
  normal: {
    count: 2,
    speed: 0.005,
    width: 2,
  },
  highlighted: {
    count: 4,
    speed: 0.008,
    width: 3,
  },
  static: {
    count: 0,
    speed: 0,
    width: 0,
  },
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get edge color based on direction and state.
 *
 * @param link - The graph link
 * @param useDirectionColors - Whether to color by direction (true) or type (false)
 * @returns Hex color string or rgba
 */
export function getEdgeColor(
  link: Graph3DLink,
  useDirectionColors: boolean = true,
): string {
  // Dimmed if not in local graph and not highlighted
  if (!link.isInLocalGraph && !link.isHighlighted) {
    return DIMMED_EDGE_COLOR
  }

  // Color by direction
  if (useDirectionColors) {
    return EDGE_DIRECTION_COLORS[link.direction] ?? EDGE_DIRECTION_COLORS.outgoing
  }

  // Color by type
  return EDGE_TYPE_COLORS[link.type] ?? EDGE_TYPE_COLORS.reference
}

/**
 * Get edge width based on state.
 */
export function getEdgeWidth(link: Graph3DLink): number {
  if (link.isHovered) {
    return EDGE_WIDTHS.hovered
  }
  if (link.isHighlighted) {
    return EDGE_WIDTHS.highlighted
  }
  return EDGE_WIDTHS.normal
}

/**
 * Get edge opacity based on state.
 */
export function getEdgeOpacity(link: Graph3DLink): number {
  if (!link.isInLocalGraph && !link.isHighlighted) {
    return 0.15
  }
  if (link.isHighlighted || link.isHovered) {
    return 1
  }
  return 0.6
}

/**
 * Get particle count for edge animation.
 */
export function getParticleCount(
  link: Graph3DLink,
  edgeStyle: EdgeStyleOption,
): number {
  if (edgeStyle === 'solid') {
    return 0
  }
  if (!link.isInLocalGraph && !link.isHighlighted) {
    return 0 // No particles for dimmed edges
  }
  if (link.isHighlighted) {
    return PARTICLE_SETTINGS.highlighted.count
  }
  return PARTICLE_SETTINGS.normal.count
}

/**
 * Get particle speed for edge animation.
 */
export function getParticleSpeed(
  link: Graph3DLink,
  _edgeStyle: EdgeStyleOption,
): number {
  if (link.isHighlighted) {
    return PARTICLE_SETTINGS.highlighted.speed
  }
  return PARTICLE_SETTINGS.normal.speed
}

/**
 * Compute all visual properties for an edge.
 */
export function computeEdgeVisuals(
  link: Graph3DLink,
  options: EdgeRenderOptions,
): EdgeVisuals {
  const { edgeStyle, showArrows = true, showParticles = true } = options
  const isAnimated = edgeStyle === 'animated' && showParticles

  return {
    color: getEdgeColor(link, true),
    width: getEdgeWidth(link),
    opacity: getEdgeOpacity(link),
    particleCount: isAnimated ? getParticleCount(link, edgeStyle) : 0,
    particleSpeed: isAnimated ? getParticleSpeed(link, edgeStyle) : 0,
    arrowLength: showArrows ? 6 : 0,
  }
}

// ============================================================================
// 3d-force-graph Callback Factories
// ============================================================================

/**
 * Create a linkColor callback for 3d-force-graph.
 *
 * @example
 * ```ts
 * graph.linkColor(createLinkColorCallback())
 * ```
 */
export function createLinkColorCallback() {
  return (link: Graph3DLink): string => {
    return getEdgeColor(link, true)
  }
}

/**
 * Create a linkWidth callback for 3d-force-graph.
 */
export function createLinkWidthCallback() {
  return (link: Graph3DLink): number => {
    return getEdgeWidth(link)
  }
}

/**
 * Create a linkDirectionalParticles callback for 3d-force-graph.
 *
 * @param edgeStyle - Current edge style setting
 */
export function createParticleCountCallback(edgeStyle: EdgeStyleOption) {
  return (link: Graph3DLink): number => {
    return getParticleCount(link, edgeStyle)
  }
}

/**
 * Create a linkDirectionalParticleSpeed callback for 3d-force-graph.
 *
 * @param edgeStyle - Current edge style setting
 */
export function createParticleSpeedCallback(edgeStyle: EdgeStyleOption) {
  return (link: Graph3DLink): number => {
    return getParticleSpeed(link, edgeStyle)
  }
}

/**
 * Create a linkDirectionalParticleColor callback for 3d-force-graph.
 */
export function createParticleColorCallback() {
  return (link: Graph3DLink): string => {
    // Match particle color to edge direction
    return EDGE_DIRECTION_COLORS[link.direction] ?? EDGE_DIRECTION_COLORS.outgoing
  }
}

// ============================================================================
// Custom Three.js Edge Objects (for advanced customization)
// ============================================================================

/**
 * Create a custom Three.js object for an edge.
 *
 * Note: 3d-force-graph has good built-in link rendering with particles.
 * This is provided for advanced customization if needed.
 *
 * @example
 * ```ts
 * graph.linkThreeObject((link) => createLinkObject(link, options))
 * ```
 */
export function createLinkObject(
  _link: Graph3DLink,
  _options: EdgeRenderOptions,
): Object3D | undefined {
  // For now, return undefined to use default line rendering
  // The built-in rendering with directional particles works well

  // To enable custom rendering, uncomment and import THREE:
  /*
  import * as THREE from 'three'

  const { color, width, opacity } = computeEdgeVisuals(_link, _options)

  // Create a tube geometry for curved edges
  // Note: Positions are set by 3d-force-graph at runtime
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
  })

  // For straight lines
  const geometry = new THREE.BufferGeometry()
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth: width, // Note: linewidth > 1 only works on some systems
  }))

  return line
  */

  return undefined
}

// ============================================================================
// Link Curvature (for better visualization of bidirectional edges)
// ============================================================================

/**
 * Calculate link curvature to prevent overlapping bidirectional edges.
 *
 * When two nodes have edges in both directions, we curve them so they don't overlap.
 *
 * @param link - The graph link
 * @param allLinks - All links in the graph (to detect bidirectional pairs)
 * @returns Curvature value (0 = straight, positive = curve up, negative = curve down)
 */
export function calculateLinkCurvature(
  link: Graph3DLink,
  allLinks: Graph3DLink[],
): number {
  // Get source and target IDs
  const sourceId = typeof link.source === 'string' ? link.source : link.source.id
  const targetId = typeof link.target === 'string' ? link.target : link.target.id

  // Check if there's a reverse edge
  const hasReverse = allLinks.some((other) => {
    const otherSourceId = typeof other.source === 'string' ? other.source : other.source.id
    const otherTargetId = typeof other.target === 'string' ? other.target : other.target.id
    return otherSourceId === targetId && otherTargetId === sourceId
  })

  if (!hasReverse) {
    return 0 // Straight line
  }

  // Curve based on direction to prevent overlap
  return link.direction === 'outgoing' ? 0.3 : -0.3
}

/**
 * Create a linkCurvature callback for 3d-force-graph.
 *
 * @param allLinks - All links in the graph
 * @returns Callback function for 3d-force-graph
 *
 * @example
 * ```ts
 * const links = graphData.links
 * graph.linkCurvature(createLinkCurvatureCallback(links))
 * ```
 */
export function createLinkCurvatureCallback(allLinks: Graph3DLink[]) {
  return (link: Graph3DLink): number => {
    return calculateLinkCurvature(link, allLinks)
  }
}
