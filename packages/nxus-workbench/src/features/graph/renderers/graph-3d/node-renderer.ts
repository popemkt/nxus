/**
 * Custom 3D Node Rendering
 *
 * Creates custom Three.js objects for nodes in the 3D force graph.
 * Uses sprite-based labels and colored spheres for nodes.
 */

import type { Object3D } from 'three'
import type { Graph3DNode } from './use-3d-graph'
import type { ColorByOption, NodeSizeOption } from '../../store/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for node rendering
 */
export interface NodeRenderOptions {
  /** What property to use for coloring */
  colorBy: ColorByOption
  /** How to size nodes */
  nodeSize: NodeSizeOption
  /** Base size for nodes */
  baseSize?: number
}

/**
 * Result of computing node visual properties
 */
export interface NodeVisuals {
  /** Node color (hex string) */
  color: string
  /** Node size (relative value) */
  size: number
  /** Opacity (0-1) */
  opacity: number
  /** Whether to show glow effect */
  glow: boolean
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default colors for different node states
 */
export const NODE_COLORS = {
  /** Default color when no supertag */
  default: '#6b7280', // Gray-500
  /** Focused node color */
  focused: '#f59e0b', // Amber-500
  /** Virtual node (tag) color */
  virtual: '#a855f7', // Purple-500
  /** Highlighted node color (uses supertag or fallback) */
  highlighted: '#3b82f6', // Blue-500
  /** Dimmed node color */
  dimmed: 'rgba(107, 114, 128, 0.3)',
  /** Orphan indicator color */
  orphan: '#ef4444', // Red-500
} as const

/**
 * Node type colors when colorBy is 'type'
 */
export const NODE_TYPE_COLORS: Record<Graph3DNode['type'], string> = {
  node: '#3b82f6', // Blue-500
  tag: '#eab308', // Yellow-500
  supertag: '#a855f7', // Purple-500
}

/**
 * Size multipliers for different states
 */
export const SIZE_MULTIPLIERS = {
  /** Minimum size multiplier */
  min: 0.8,
  /** Maximum size multiplier (for highly connected nodes) */
  max: 3,
  /** Focused node gets larger */
  focused: 1.5,
  /** Highlighted nodes get slightly larger */
  highlighted: 1.2,
  /** Dimmed nodes stay normal size */
  dimmed: 1,
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate node color based on options and node state.
 */
export function getNodeColor(
  node: Graph3DNode,
  colorBy: ColorByOption,
): string {
  // Check special states first
  if (!node.isInLocalGraph && !node.isFocused) {
    return NODE_COLORS.dimmed
  }

  if (node.isFocused) {
    return NODE_COLORS.focused
  }

  // Apply colorBy option
  switch (colorBy) {
    case 'supertag':
      if (node.isVirtual) {
        return NODE_COLORS.virtual
      }
      return node.supertag?.color ?? NODE_COLORS.default

    case 'type':
      return NODE_TYPE_COLORS[node.type] ?? NODE_COLORS.default

    case 'none':
    default:
      return NODE_COLORS.default
  }
}

/**
 * Calculate node size based on options and connections.
 */
export function getNodeSize(
  node: Graph3DNode,
  sizeOption: NodeSizeOption,
  baseSize: number = 4,
): number {
  let size = baseSize

  if (sizeOption === 'connections') {
    // Scale by connections: min 0.8x to max 3x
    const connectionScale = Math.min(
      SIZE_MULTIPLIERS.min + node.totalConnections * 0.15,
      SIZE_MULTIPLIERS.max,
    )
    size *= connectionScale
  }

  // Apply state multipliers
  if (node.isFocused) {
    size *= SIZE_MULTIPLIERS.focused
  } else if (node.isHighlighted) {
    size *= SIZE_MULTIPLIERS.highlighted
  }

  return size
}

/**
 * Calculate node opacity based on state.
 */
export function getNodeOpacity(node: Graph3DNode): number {
  if (!node.isInLocalGraph && !node.isFocused) {
    return 0.3
  }
  if (node.isHighlighted || node.isFocused) {
    return 1
  }
  return 0.8
}

/**
 * Compute all visual properties for a node.
 */
export function computeNodeVisuals(
  node: Graph3DNode,
  options: NodeRenderOptions,
): NodeVisuals {
  const { colorBy, nodeSize, baseSize = 4 } = options

  return {
    color: getNodeColor(node, colorBy),
    size: getNodeSize(node, nodeSize, baseSize),
    opacity: getNodeOpacity(node),
    glow: node.isFocused || node.isHighlighted === true,
  }
}

// ============================================================================
// Three.js Object Creation (for custom rendering)
// ============================================================================

/**
 * Create a custom Three.js object for a node.
 *
 * Note: 3d-force-graph has built-in rendering that works well for most cases.
 * This function is provided for advanced customization if needed.
 *
 * @example
 * ```ts
 * graph.nodeThreeObject((node) => createNodeObject(node, options))
 * ```
 */
export function createNodeObject(
  node: Graph3DNode,
  options: NodeRenderOptions,
): Object3D | undefined {
  // For now, return undefined to use default sphere rendering
  // Custom Three.js objects can be expensive and may not be needed
  // The nodeColor, nodeVal, and nodeOpacity callbacks provide sufficient customization

  // To enable custom rendering, uncomment and import THREE:
  /*
  import * as THREE from 'three'

  const { color, size, opacity, glow } = computeNodeVisuals(node, options)

  // Create sphere
  const geometry = new THREE.SphereGeometry(size, 16, 16)
  const material = new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    opacity,
  })
  const sphere = new THREE.Mesh(geometry, material)

  // Add glow for focused/highlighted nodes
  if (glow) {
    const glowGeometry = new THREE.SphereGeometry(size * 1.3, 16, 16)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
    })
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial)
    sphere.add(glowSphere)
  }

  return sphere
  */

  return undefined
}

/**
 * Create a sprite label for a node.
 *
 * Note: 3d-force-graph has built-in nodeLabel that shows on hover.
 * This function creates a permanent label sprite if always-visible labels are needed.
 */
export function createNodeLabel(
  node: Graph3DNode,
  _options: { fontSize?: number; color?: string } = {},
): Object3D | undefined {
  // For now, return undefined to use default hover labels
  // Permanent labels can clutter the 3D view

  // To enable permanent labels, uncomment and import THREE:
  /*
  import * as THREE from 'three'
  import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'

  const { fontSize = 12, color = '#ffffff' } = _options

  const div = document.createElement('div')
  div.textContent = node.label
  div.style.color = color
  div.style.fontSize = `${fontSize}px`
  div.style.fontFamily = 'system-ui, sans-serif'
  div.style.padding = '2px 6px'
  div.style.background = 'rgba(0, 0, 0, 0.6)'
  div.style.borderRadius = '4px'
  div.style.pointerEvents = 'none'

  const label = new CSS2DObject(div)
  label.position.set(0, node.size + 5, 0)

  return label
  */

  return undefined
}

// ============================================================================
// Node Value Calculation (for 3d-force-graph's nodeVal)
// ============================================================================

/**
 * Calculate the node value for 3d-force-graph's nodeVal callback.
 * This value determines the node's visual size in the default sphere rendering.
 *
 * @param node - The graph node
 * @param nodeSize - Size option from store
 * @returns Value that determines node size (scales as cube root)
 */
export function calculateNodeVal(
  node: Graph3DNode,
  nodeSize: NodeSizeOption,
): number {
  // Base value
  let val = 2

  if (nodeSize === 'connections') {
    // Add based on connections (3d-force-graph uses cube root for radius)
    val += Math.min(node.totalConnections * 0.5, 10)
  }

  // Focused nodes are larger
  if (node.isFocused) {
    val *= 2
  }

  // Highlighted nodes slightly larger
  if (node.isHighlighted) {
    val *= 1.5
  }

  return val
}
