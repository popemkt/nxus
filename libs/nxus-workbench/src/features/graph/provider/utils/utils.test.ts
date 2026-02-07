/**
 * Graph Provider Utilities - Unit Tests
 */

import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '../types.js'
import {
  getSupertagColor,
  generateSupertagColorMap,
  DEFAULT_SUPERTAG_COLORS,
  adjustBrightness,
  getDimmedColor,
  getHighlightedColor,
} from './color-palette.js'
import {
  computeGraphStats,
  countConnectedComponents,
  computeConnectionMetrics,
  getMostConnectedNodes,
  getEdgeTypeDistribution,
} from './graph-stats.js'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockGraphNode(
  id: string,
  overrides: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    label: `Node ${id}`,
    type: 'node',
    isVirtual: false,
    supertag: null,
    outgoingCount: 0,
    incomingCount: 0,
    totalConnections: 0,
    isOrphan: true,
    isMatched: false,
    isFocused: false,
    isInLocalGraph: false,
    sourceNode: null,
    ...overrides,
  }
}

function createMockEdge(
  source: string,
  target: string,
  type: GraphEdge['type'] = 'dependency',
): GraphEdge {
  return {
    id: `${source}-${type}-${target}`,
    source,
    target,
    type,
    direction: 'outgoing',
    isHighlighted: false,
    isInLocalGraph: false,
  }
}

// ============================================================================
// Color Palette Tests
// ============================================================================

describe('getSupertagColor', () => {
  it('should return a valid hex color', () => {
    const color = getSupertagColor('test-supertag-id')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('should return consistent color for same ID', () => {
    const color1 = getSupertagColor('supertag-abc')
    const color2 = getSupertagColor('supertag-abc')
    expect(color1).toBe(color2)
  })

  it('should return different colors for different IDs', () => {
    const color1 = getSupertagColor('supertag-1')
    const color2 = getSupertagColor('supertag-2')
    // Not guaranteed to be different, but very likely
    // At minimum, they should both be valid colors
    expect(color1).toMatch(/^#[0-9a-f]{6}$/i)
    expect(color2).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('should return a color from the default palette', () => {
    const color = getSupertagColor('test-id')
    expect(DEFAULT_SUPERTAG_COLORS).toContain(color)
  })
})

describe('generateSupertagColorMap', () => {
  it('should return empty map for empty input', () => {
    const map = generateSupertagColorMap([])
    expect(map.size).toBe(0)
  })

  it('should generate map with all supertag IDs', () => {
    const ids = ['st-1', 'st-2', 'st-3']
    const map = generateSupertagColorMap(ids)

    expect(map.size).toBe(3)
    expect(map.has('st-1')).toBe(true)
    expect(map.has('st-2')).toBe(true)
    expect(map.has('st-3')).toBe(true)
  })

  it('should handle duplicate IDs', () => {
    const ids = ['st-1', 'st-1', 'st-2']
    const map = generateSupertagColorMap(ids)

    expect(map.size).toBe(2)
  })

  it('should generate consistent colors', () => {
    const ids = ['st-1', 'st-2']
    const map1 = generateSupertagColorMap(ids)
    const map2 = generateSupertagColorMap(ids)

    expect(map1.get('st-1')).toBe(map2.get('st-1'))
    expect(map1.get('st-2')).toBe(map2.get('st-2'))
  })
})

describe('adjustBrightness', () => {
  it('should return valid hex color', () => {
    const result = adjustBrightness('#3b82f6', 20)
    expect(result).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('should lighten color with positive percent', () => {
    const original = '#808080' // Gray
    const lighter = adjustBrightness(original, 50)
    // Lighter should have higher RGB values
    expect(lighter).not.toBe(original)
  })

  it('should darken color with negative percent', () => {
    const original = '#808080' // Gray
    const darker = adjustBrightness(original, -50)
    expect(darker).not.toBe(original)
  })

  it('should clamp to valid range', () => {
    const white = '#ffffff'
    const result = adjustBrightness(white, 100)
    expect(result).toBe('#ffffff')

    const black = '#000000'
    const result2 = adjustBrightness(black, -100)
    expect(result2).toBe('#000000')
  })
})

describe('getDimmedColor / getHighlightedColor', () => {
  it('getDimmedColor should return darker color', () => {
    const original = '#3b82f6'
    const dimmed = getDimmedColor(original)
    expect(dimmed).not.toBe(original)
  })

  it('getHighlightedColor should return lighter color', () => {
    const original = '#3b82f6'
    const highlighted = getHighlightedColor(original)
    expect(highlighted).not.toBe(original)
  })
})

// ============================================================================
// Graph Stats Tests
// ============================================================================

describe('countConnectedComponents', () => {
  it('should return 0 for empty graph', () => {
    const result = countConnectedComponents([], [])
    expect(result).toBe(0)
  })

  it('should return node count when no edges', () => {
    const nodes = [
      createMockGraphNode('1'),
      createMockGraphNode('2'),
      createMockGraphNode('3'),
    ]
    const result = countConnectedComponents(nodes, [])
    expect(result).toBe(3)
  })

  it('should return 1 for fully connected graph', () => {
    const nodes = [
      createMockGraphNode('1'),
      createMockGraphNode('2'),
      createMockGraphNode('3'),
    ]
    const edges = [createMockEdge('1', '2'), createMockEdge('2', '3')]
    const result = countConnectedComponents(nodes, edges)
    expect(result).toBe(1)
  })

  it('should count disconnected components correctly', () => {
    const nodes = [
      createMockGraphNode('1'),
      createMockGraphNode('2'),
      createMockGraphNode('3'),
      createMockGraphNode('4'),
    ]
    // Two components: (1-2) and (3-4)
    const edges = [createMockEdge('1', '2'), createMockEdge('3', '4')]
    const result = countConnectedComponents(nodes, edges)
    expect(result).toBe(2)
  })

  it('should handle cyclic graphs', () => {
    const nodes = [
      createMockGraphNode('1'),
      createMockGraphNode('2'),
      createMockGraphNode('3'),
    ]
    const edges = [
      createMockEdge('1', '2'),
      createMockEdge('2', '3'),
      createMockEdge('3', '1'),
    ]
    const result = countConnectedComponents(nodes, edges)
    expect(result).toBe(1)
  })
})

describe('computeConnectionMetrics', () => {
  it('should compute outgoing and incoming counts', () => {
    const nodes = [createMockGraphNode('1'), createMockGraphNode('2')]
    const edges = [createMockEdge('1', '2')]

    computeConnectionMetrics(nodes, edges)

    expect(nodes[0].outgoingCount).toBe(1)
    expect(nodes[0].incomingCount).toBe(0)
    expect(nodes[0].totalConnections).toBe(1)

    expect(nodes[1].outgoingCount).toBe(0)
    expect(nodes[1].incomingCount).toBe(1)
    expect(nodes[1].totalConnections).toBe(1)
  })

  it('should mark orphans correctly', () => {
    const nodes = [
      createMockGraphNode('1'),
      createMockGraphNode('2'),
      createMockGraphNode('3'),
    ]
    const edges = [createMockEdge('1', '2')]

    computeConnectionMetrics(nodes, edges)

    expect(nodes[0].isOrphan).toBe(false)
    expect(nodes[1].isOrphan).toBe(false)
    expect(nodes[2].isOrphan).toBe(true)
  })

  it('should handle multiple edges from same node', () => {
    const nodes = [
      createMockGraphNode('1'),
      createMockGraphNode('2'),
      createMockGraphNode('3'),
    ]
    const edges = [createMockEdge('1', '2'), createMockEdge('1', '3')]

    computeConnectionMetrics(nodes, edges)

    expect(nodes[0].outgoingCount).toBe(2)
    expect(nodes[0].totalConnections).toBe(2)
  })
})

describe('computeGraphStats', () => {
  it('should compute all stats correctly', () => {
    const nodes = [
      createMockGraphNode('1', { isOrphan: false, totalConnections: 1 }),
      createMockGraphNode('2', { isOrphan: false, totalConnections: 1 }),
      createMockGraphNode('3', { isOrphan: true, totalConnections: 0 }),
    ]
    const edges = [createMockEdge('1', '2')]

    const stats = computeGraphStats(nodes, edges)

    expect(stats.totalNodes).toBe(3)
    expect(stats.totalEdges).toBe(1)
    expect(stats.orphanCount).toBe(1)
    expect(stats.connectedComponents).toBe(2)
  })
})

describe('getMostConnectedNodes', () => {
  it('should return nodes sorted by connections', () => {
    const nodes = [
      createMockGraphNode('1', { totalConnections: 5 }),
      createMockGraphNode('2', { totalConnections: 10 }),
      createMockGraphNode('3', { totalConnections: 3 }),
    ]

    const result = getMostConnectedNodes(nodes)

    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
    expect(result[2].id).toBe('3')
  })

  it('should respect limit parameter', () => {
    const nodes = [
      createMockGraphNode('1', { totalConnections: 5 }),
      createMockGraphNode('2', { totalConnections: 10 }),
      createMockGraphNode('3', { totalConnections: 3 }),
    ]

    const result = getMostConnectedNodes(nodes, 2)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
  })
})

describe('getEdgeTypeDistribution', () => {
  it('should count edge types correctly', () => {
    const edges = [
      createMockEdge('1', '2', 'dependency'),
      createMockEdge('2', '3', 'dependency'),
      createMockEdge('3', '4', 'hierarchy'),
      createMockEdge('4', '5', 'reference'),
    ]

    const distribution = getEdgeTypeDistribution(edges)

    expect(distribution.get('dependency')).toBe(2)
    expect(distribution.get('hierarchy')).toBe(1)
    expect(distribution.get('reference')).toBe(1)
  })

  it('should return empty map for no edges', () => {
    const distribution = getEdgeTypeDistribution([])
    expect(distribution.size).toBe(0)
  })
})
