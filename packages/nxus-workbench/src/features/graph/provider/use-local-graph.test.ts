/**
 * Local Graph Filtering - Unit Tests
 */

import { describe, expect, it } from 'vitest'
import type { GraphData, GraphNode, GraphEdge, LocalGraphOptions } from './types.js'
import { DEFAULT_LOCAL_GRAPH_OPTIONS } from './types.js'
import {
  buildAdjacencyLists,
  bfsTraversal,
  filterLocalGraph,
  getLocalGraphOnly,
} from './use-local-graph.js'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockNode(
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

function createMockGraphData(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphData {
  return {
    nodes,
    edges,
    supertagColors: new Map(),
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      orphanCount: nodes.filter((n) => n.isOrphan).length,
      connectedComponents: 1,
    },
  }
}

function createLocalGraphOptions(
  overrides: Partial<LocalGraphOptions> = {},
): LocalGraphOptions {
  return {
    ...DEFAULT_LOCAL_GRAPH_OPTIONS,
    enabled: true,
    ...overrides,
  }
}

// ============================================================================
// buildAdjacencyLists Tests
// ============================================================================

describe('buildAdjacencyLists', () => {
  it('should return empty map for empty edges', () => {
    const adjacency = buildAdjacencyLists([])
    expect(adjacency.size).toBe(0)
  })

  it('should build bidirectional adjacency for single edge', () => {
    const edges = [createMockEdge('A', 'B')]
    const adjacency = buildAdjacencyLists(edges)

    // Source node should have outgoing entry
    const sourceAdj = adjacency.get('A')
    expect(sourceAdj).toHaveLength(1)
    expect(sourceAdj![0]).toMatchObject({
      nodeId: 'B',
      isOutgoing: true,
    })

    // Target node should have incoming entry
    const targetAdj = adjacency.get('B')
    expect(targetAdj).toHaveLength(1)
    expect(targetAdj![0]).toMatchObject({
      nodeId: 'A',
      isOutgoing: false,
    })
  })

  it('should handle multiple edges from same node', () => {
    const edges = [
      createMockEdge('A', 'B'),
      createMockEdge('A', 'C'),
    ]
    const adjacency = buildAdjacencyLists(edges)

    const sourceAdj = adjacency.get('A')
    expect(sourceAdj).toHaveLength(2)
    expect(sourceAdj!.map((e) => e.nodeId).sort()).toEqual(['B', 'C'])
  })

  it('should handle nodes with both incoming and outgoing edges', () => {
    const edges = [
      createMockEdge('A', 'B'),
      createMockEdge('C', 'B'),
    ]
    const adjacency = buildAdjacencyLists(edges)

    const bAdj = adjacency.get('B')
    expect(bAdj).toHaveLength(2)
    expect(bAdj!.every((e) => !e.isOutgoing)).toBe(true) // All incoming
  })
})

// ============================================================================
// bfsTraversal Tests
// ============================================================================

describe('bfsTraversal', () => {
  /**
   * Test graph structure:
   *
   *     A --> B --> C --> D
   *     |         ^
   *     v        /
   *     E ------+
   */
  function createTestGraph() {
    const edges = [
      createMockEdge('A', 'B'),
      createMockEdge('B', 'C'),
      createMockEdge('C', 'D'),
      createMockEdge('A', 'E'),
      createMockEdge('E', 'C'),
    ]
    return buildAdjacencyLists(edges)
  }

  describe('depth traversal', () => {
    it('should include only focus node at depth 0', () => {
      const adjacency = createTestGraph()
      const result = bfsTraversal('A', adjacency, 0, ['both'])

      // Depth 0 means we don't traverse at all, only include focus
      expect(result.nodeIds.size).toBe(1)
      expect(result.nodeIds.has('A')).toBe(true)
      expect(result.edgeIds.size).toBe(0)
    })

    it('should traverse 1 level at depth 1', () => {
      const adjacency = createTestGraph()
      const result = bfsTraversal('A', adjacency, 1, ['both'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'E']))
      expect(result.edgeIds.size).toBe(2)
      expect(result.distances.get('A')).toBe(0)
      expect(result.distances.get('B')).toBe(1)
      expect(result.distances.get('E')).toBe(1)
    })

    it('should traverse 2 levels at depth 2', () => {
      const adjacency = createTestGraph()
      const result = bfsTraversal('A', adjacency, 2, ['both'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'E', 'C']))
      expect(result.distances.get('C')).toBe(2)
    })

    it('should traverse 3 levels at depth 3', () => {
      const adjacency = createTestGraph()
      const result = bfsTraversal('A', adjacency, 3, ['both'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'E', 'C', 'D']))
      expect(result.distances.get('D')).toBe(3)
    })
  })

  describe('direction filtering', () => {
    /**
     *   A --> B --> C
     *   ^
     *   |
     *   X
     */
    function createDirectionTestGraph() {
      const edges = [
        createMockEdge('A', 'B'),
        createMockEdge('B', 'C'),
        createMockEdge('X', 'A'), // X points to A
      ]
      return buildAdjacencyLists(edges)
    }

    it('should only follow outgoing edges when linkTypes is outgoing', () => {
      const adjacency = createDirectionTestGraph()
      const result = bfsTraversal('A', adjacency, 2, ['outgoing'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'C']))
      expect(result.nodeIds.has('X')).toBe(false) // X is incoming, not outgoing
    })

    it('should only follow incoming edges when linkTypes is incoming', () => {
      const adjacency = createDirectionTestGraph()
      const result = bfsTraversal('A', adjacency, 2, ['incoming'])

      expect(result.nodeIds).toEqual(new Set(['A', 'X']))
      expect(result.nodeIds.has('B')).toBe(false) // B is outgoing, not incoming
    })

    it('should follow both directions when linkTypes is both', () => {
      const adjacency = createDirectionTestGraph()
      const result = bfsTraversal('A', adjacency, 2, ['both'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'C', 'X']))
    })

    it('should follow both when array contains outgoing and incoming', () => {
      const adjacency = createDirectionTestGraph()
      const result = bfsTraversal('A', adjacency, 2, ['outgoing', 'incoming'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'C', 'X']))
    })
  })

  describe('circular reference handling', () => {
    /**
     * Circular: A --> B --> C --> A
     */
    function createCircularGraph() {
      const edges = [
        createMockEdge('A', 'B'),
        createMockEdge('B', 'C'),
        createMockEdge('C', 'A'), // Back to A
      ]
      return buildAdjacencyLists(edges)
    }

    it('should not loop infinitely with circular references', () => {
      const adjacency = createCircularGraph()
      const result = bfsTraversal('A', adjacency, 10, ['both'])

      // Should visit each node exactly once
      expect(result.nodeIds).toEqual(new Set(['A', 'B', 'C']))
      expect(result.edgeIds.size).toBe(3)
    })

    it('should record correct distances despite cycles', () => {
      const adjacency = createCircularGraph()
      const result = bfsTraversal('A', adjacency, 10, ['both'])

      expect(result.distances.get('A')).toBe(0)
      expect(result.distances.get('B')).toBe(1)
      // C is reachable via incoming edge C→A at distance 1 (when traversing 'both')
      expect(result.distances.get('C')).toBe(1)
    })

    it('should record correct distances in outgoing-only traversal', () => {
      const adjacency = createCircularGraph()
      const result = bfsTraversal('A', adjacency, 10, ['outgoing'])

      expect(result.distances.get('A')).toBe(0)
      expect(result.distances.get('B')).toBe(1)
      // When only following outgoing edges: A→B→C
      expect(result.distances.get('C')).toBe(2)
    })
  })

  describe('disconnected graph', () => {
    it('should only traverse connected component', () => {
      const edges = [
        createMockEdge('A', 'B'),
        createMockEdge('X', 'Y'), // Disconnected from A
      ]
      const adjacency = buildAdjacencyLists(edges)
      const result = bfsTraversal('A', adjacency, 3, ['both'])

      expect(result.nodeIds).toEqual(new Set(['A', 'B']))
      expect(result.nodeIds.has('X')).toBe(false)
      expect(result.nodeIds.has('Y')).toBe(false)
    })
  })

  describe('isolated node', () => {
    it('should return only focus node when it has no connections', () => {
      const adjacency = new Map()
      const result = bfsTraversal('isolated', adjacency, 3, ['both'])

      expect(result.nodeIds).toEqual(new Set(['isolated']))
      expect(result.edgeIds.size).toBe(0)
    })
  })
})

// ============================================================================
// filterLocalGraph Tests
// ============================================================================

describe('filterLocalGraph', () => {
  function createTestGraphData(): GraphData {
    const nodes = [
      createMockNode('A'),
      createMockNode('B'),
      createMockNode('C'),
      createMockNode('D'),
    ]
    const edges = [
      createMockEdge('A', 'B'),
      createMockEdge('B', 'C'),
      createMockEdge('C', 'D'),
    ]
    return createMockGraphData(nodes, edges)
  }

  describe('disabled mode', () => {
    it('should return all nodes with flags cleared when disabled', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        enabled: false,
        focusNodeId: 'A',
      })

      const result = filterLocalGraph(graphData, options)

      expect(result.data.nodes).toHaveLength(4)
      expect(result.data.nodes.every((n) => !n.isFocused)).toBe(true)
      expect(result.data.nodes.every((n) => !n.isInLocalGraph)).toBe(true)
      expect(result.localNodeIds.size).toBe(0)
      expect(result.focusNode).toBeNull()
    })

    it('should return all nodes when focusNodeId is null', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        enabled: true,
        focusNodeId: null,
      })

      const result = filterLocalGraph(graphData, options)

      expect(result.data.nodes).toHaveLength(4)
      expect(result.localNodeIds.size).toBe(0)
    })
  })

  describe('focus node handling', () => {
    it('should return empty local graph when focus node not found', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'nonexistent',
        depth: 2,
      })

      const result = filterLocalGraph(graphData, options)

      expect(result.focusNode).toBeNull()
      expect(result.localNodeIds.size).toBe(0)
    })

    it('should mark focus node with isFocused flag', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'A',
        depth: 1,
      })

      const result = filterLocalGraph(graphData, options)

      const focusNode = result.data.nodes.find((n) => n.id === 'A')
      expect(focusNode?.isFocused).toBe(true)
      expect(result.focusNode?.isFocused).toBe(true)

      // Other nodes should not be focused
      const otherNodes = result.data.nodes.filter((n) => n.id !== 'A')
      expect(otherNodes.every((n) => !n.isFocused)).toBe(true)
    })
  })

  describe('local graph flags', () => {
    it('should mark nodes within depth as isInLocalGraph', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'A',
        depth: 1,
        linkTypes: ['outgoing'],
      })

      const result = filterLocalGraph(graphData, options)

      const nodeA = result.data.nodes.find((n) => n.id === 'A')
      const nodeB = result.data.nodes.find((n) => n.id === 'B')
      const nodeC = result.data.nodes.find((n) => n.id === 'C')

      expect(nodeA?.isInLocalGraph).toBe(true)
      expect(nodeB?.isInLocalGraph).toBe(true)
      expect(nodeC?.isInLocalGraph).toBe(false) // Beyond depth 1
    })

    it('should mark edges within local graph as isInLocalGraph', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'A',
        depth: 1,
        linkTypes: ['outgoing'],
      })

      const result = filterLocalGraph(graphData, options)

      const edgeAB = result.data.edges.find((e) => e.source === 'A')
      const edgeBC = result.data.edges.find((e) => e.source === 'B')

      expect(edgeAB?.isInLocalGraph).toBe(true)
      expect(edgeBC?.isInLocalGraph).toBe(false)
    })

    it('should mark direct edges as isHighlighted', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'B',
        depth: 2,
        linkTypes: ['both'],
      })

      const result = filterLocalGraph(graphData, options)

      // Edges directly connected to B should be highlighted
      const edgeAB = result.data.edges.find(
        (e) => e.source === 'A' && e.target === 'B',
      )
      const edgeBC = result.data.edges.find(
        (e) => e.source === 'B' && e.target === 'C',
      )
      const edgeCD = result.data.edges.find(
        (e) => e.source === 'C' && e.target === 'D',
      )

      expect(edgeAB?.isHighlighted).toBe(true) // Direct
      expect(edgeBC?.isHighlighted).toBe(true) // Direct
      expect(edgeCD?.isHighlighted).toBe(false) // Not direct to B
    })
  })

  describe('node distances', () => {
    it('should record correct distances from focus node', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'A',
        depth: 3,
        linkTypes: ['outgoing'],
      })

      const result = filterLocalGraph(graphData, options)

      expect(result.nodeDistances.get('A')).toBe(0)
      expect(result.nodeDistances.get('B')).toBe(1)
      expect(result.nodeDistances.get('C')).toBe(2)
      expect(result.nodeDistances.get('D')).toBe(3)
    })
  })

  describe('result structure', () => {
    it('should include localNodeIds set', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'A',
        depth: 1,
        linkTypes: ['outgoing'],
      })

      const result = filterLocalGraph(graphData, options)

      expect(result.localNodeIds).toBeInstanceOf(Set)
      expect(result.localNodeIds.has('A')).toBe(true)
      expect(result.localNodeIds.has('B')).toBe(true)
    })

    it('should include localEdgeIds set', () => {
      const graphData = createTestGraphData()
      const options = createLocalGraphOptions({
        focusNodeId: 'A',
        depth: 1,
        linkTypes: ['outgoing'],
      })

      const result = filterLocalGraph(graphData, options)

      expect(result.localEdgeIds).toBeInstanceOf(Set)
      expect(result.localEdgeIds.size).toBe(1)
    })
  })
})

// ============================================================================
// getLocalGraphOnly Tests
// ============================================================================

describe('getLocalGraphOnly', () => {
  function createTestGraphData(): GraphData {
    const nodes = [
      createMockNode('A'),
      createMockNode('B'),
      createMockNode('C'),
      createMockNode('D'),
      createMockNode('isolated', { isOrphan: true }),
    ]
    const edges = [
      createMockEdge('A', 'B'),
      createMockEdge('B', 'C'),
      createMockEdge('C', 'D'),
    ]
    return createMockGraphData(nodes, edges)
  }

  it('should return full graph when disabled', () => {
    const graphData = createTestGraphData()
    const options = createLocalGraphOptions({
      enabled: false,
    })

    const result = getLocalGraphOnly(graphData, options)

    expect(result.nodes).toHaveLength(5)
    expect(result.edges).toHaveLength(3)
  })

  it('should return full graph when no focus node', () => {
    const graphData = createTestGraphData()
    const options = createLocalGraphOptions({
      enabled: true,
      focusNodeId: null,
    })

    const result = getLocalGraphOnly(graphData, options)

    expect(result.nodes).toHaveLength(5)
  })

  it('should return only local nodes and edges', () => {
    const graphData = createTestGraphData()
    const options = createLocalGraphOptions({
      focusNodeId: 'A',
      depth: 1,
      linkTypes: ['outgoing'],
    })

    const result = getLocalGraphOnly(graphData, options)

    expect(result.nodes).toHaveLength(2) // A and B only
    expect(result.edges).toHaveLength(1) // A->B only
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['A', 'B'])
  })

  it('should update stats for filtered graph', () => {
    const graphData = createTestGraphData()
    const options = createLocalGraphOptions({
      focusNodeId: 'A',
      depth: 1,
      linkTypes: ['outgoing'],
    })

    const result = getLocalGraphOnly(graphData, options)

    expect(result.stats.totalNodes).toBe(2)
    expect(result.stats.totalEdges).toBe(1)
    expect(result.stats.connectedComponents).toBe(1)
  })

  it('should preserve supertagColors map', () => {
    const graphData = createTestGraphData()
    graphData.supertagColors.set('supertag-1', '#ff0000')

    const options = createLocalGraphOptions({
      focusNodeId: 'A',
      depth: 1,
    })

    const result = getLocalGraphOnly(graphData, options)

    expect(result.supertagColors).toBe(graphData.supertagColors)
  })

  it('should handle isolated focus node', () => {
    const graphData = createTestGraphData()
    const options = createLocalGraphOptions({
      focusNodeId: 'isolated',
      depth: 3,
      linkTypes: ['both'],
    })

    const result = getLocalGraphOnly(graphData, options)

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('isolated')
    expect(result.edges).toHaveLength(0)
  })
})
