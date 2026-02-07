/**
 * Graph Data Provider - Unit Tests
 */

import type { AssembledNode } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'
import { describe, expect, it } from 'vitest'
import {
  transformToGraphData,
  isLargeGraph,
  LARGE_GRAPH_THRESHOLD,
} from './use-graph-data.js'
import { DEFAULT_GRAPH_DATA_OPTIONS } from './types.js'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockNode(overrides: Partial<AssembledNode> = {}): AssembledNode {
  return {
    id: `node-${Math.random().toString(36).slice(2, 10)}`,
    content: 'Test Node',
    systemId: null,
    ownerId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    deletedAt: null,
    properties: {},
    supertags: [],
    ...overrides,
  }
}

function createProperty(
  value: unknown,
  fieldName: string,
  fieldSystemId: string | null = null,
  order = 0,
) {
  return [
    {
      value,
      rawValue: JSON.stringify(value),
      fieldNodeId: `field-${fieldName.toLowerCase()}`,
      fieldName,
      fieldSystemId,
      order,
    },
  ]
}

// ============================================================================
// transformToGraphData Tests
// ============================================================================

describe('transformToGraphData', () => {
  describe('basic transformation', () => {
    it('should transform empty array to empty graph', () => {
      const result = transformToGraphData([])

      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
      expect(result.supertagColors.size).toBe(0)
      expect(result.stats).toEqual({
        totalNodes: 0,
        totalEdges: 0,
        orphanCount: 0,
        connectedComponents: 0,
      })
    })

    it('should transform single node without connections', () => {
      const node = createMockNode({
        id: 'node-1',
        content: 'Test Node',
      })

      const result = transformToGraphData([node])

      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0]).toMatchObject({
        id: 'node-1',
        label: 'Test Node',
        type: 'node',
        isVirtual: false,
        isOrphan: true,
        totalConnections: 0,
      })
      expect(result.edges).toHaveLength(0)
      expect(result.stats.orphanCount).toBe(1)
    })

    it('should preserve source node reference', () => {
      const node = createMockNode({ id: 'node-1' })
      const result = transformToGraphData([node])

      expect(result.nodes[0].sourceNode).toBe(node)
    })

    it('should use content as label', () => {
      const node = createMockNode({
        id: 'node-1',
        content: 'My Custom Content',
      })

      const result = transformToGraphData([node])

      expect(result.nodes[0].label).toBe('My Custom Content')
    })

    it('should fall back to systemId for label when content is null', () => {
      const node = createMockNode({
        id: 'node-1',
        content: null,
        systemId: 'system:my-node',
      })

      const result = transformToGraphData([node])

      expect(result.nodes[0].label).toBe('system:my-node')
    })

    it('should fall back to Untitled when no content or systemId', () => {
      const node = createMockNode({
        id: 'node-1',
        content: null,
        systemId: null,
      })

      const result = transformToGraphData([node])

      expect(result.nodes[0].label).toBe('Untitled')
    })
  })

  describe('supertag handling', () => {
    it('should extract supertag info from nodes', () => {
      const node = createMockNode({
        id: 'node-1',
        supertags: [
          { id: 'supertag-1', content: 'Item', systemId: 'supertag:item' },
        ],
      })

      const result = transformToGraphData([node])

      expect(result.nodes[0].supertag).toMatchObject({
        id: 'supertag-1',
        name: 'Item',
      })
      expect(result.nodes[0].supertag?.color).toBeDefined()
    })

    it('should use first supertag when multiple exist', () => {
      const node = createMockNode({
        id: 'node-1',
        supertags: [
          { id: 'supertag-1', content: 'Item', systemId: 'supertag:item' },
          { id: 'supertag-2', content: 'Tool', systemId: 'supertag:tool' },
        ],
      })

      const result = transformToGraphData([node])

      expect(result.nodes[0].supertag?.id).toBe('supertag-1')
    })

    it('should generate consistent colors for same supertag', () => {
      const node1 = createMockNode({
        id: 'node-1',
        supertags: [
          { id: 'supertag-1', content: 'Item', systemId: 'supertag:item' },
        ],
      })
      const node2 = createMockNode({
        id: 'node-2',
        supertags: [
          { id: 'supertag-1', content: 'Item', systemId: 'supertag:item' },
        ],
      })

      const result = transformToGraphData([node1, node2])

      expect(result.nodes[0].supertag?.color).toBe(
        result.nodes[1].supertag?.color,
      )
    })

    it('should populate supertagColors map', () => {
      const node1 = createMockNode({
        id: 'node-1',
        supertags: [
          { id: 'supertag-1', content: 'Item', systemId: 'supertag:item' },
        ],
      })
      const node2 = createMockNode({
        id: 'node-2',
        supertags: [
          { id: 'supertag-2', content: 'Tool', systemId: 'supertag:tool' },
        ],
      })

      const result = transformToGraphData([node1, node2])

      expect(result.supertagColors.size).toBe(2)
      expect(result.supertagColors.has('supertag-1')).toBe(true)
      expect(result.supertagColors.has('supertag-2')).toBe(true)
    })
  })

  describe('edge extraction', () => {
    it('should extract dependency edges', () => {
      const node1 = createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        content: 'Node 1',
        properties: {
          [SYSTEM_FIELDS.DEPENDENCIES]: createProperty(
            '22222222-2222-2222-2222-222222222222',
            'dependencies',
          ),
        },
      })
      const node2 = createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
        content: 'Node 2',
      })

      const result = transformToGraphData([node1, node2])

      const depEdges = result.edges.filter((e) => e.type === 'dependency')
      expect(depEdges).toHaveLength(1)
      expect(depEdges[0]).toMatchObject({
        source: '11111111-1111-1111-1111-111111111111',
        target: '22222222-2222-2222-2222-222222222222',
        direction: 'outgoing',
      })
    })

    it('should extract hierarchy edges when includeHierarchy is true', () => {
      const parent = createMockNode({
        id: 'parent-node',
        content: 'Parent',
      })
      const child = createMockNode({
        id: 'child-node',
        content: 'Child',
        ownerId: 'parent-node',
      })

      const result = transformToGraphData([parent, child], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        includeHierarchy: true,
      })

      const hierarchyEdges = result.edges.filter((e) => e.type === 'hierarchy')
      expect(hierarchyEdges).toHaveLength(1)
      expect(hierarchyEdges[0]).toMatchObject({
        source: 'child-node',
        target: 'parent-node',
      })
    })

    it('should not extract hierarchy edges when includeHierarchy is false', () => {
      const parent = createMockNode({
        id: 'parent-node',
        content: 'Parent',
      })
      const child = createMockNode({
        id: 'child-node',
        content: 'Child',
        ownerId: 'parent-node',
      })

      const result = transformToGraphData([parent, child], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        includeHierarchy: false,
      })

      const hierarchyEdges = result.edges.filter((e) => e.type === 'hierarchy')
      expect(hierarchyEdges).toHaveLength(0)
    })
  })

  describe('connection metrics', () => {
    it('should compute connection counts correctly', () => {
      const node1 = createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        content: 'Hub Node',
        properties: {
          [SYSTEM_FIELDS.DEPENDENCIES]: createProperty(
            [
              '22222222-2222-2222-2222-222222222222',
              '33333333-3333-3333-3333-333333333333',
            ],
            'dependencies',
          ),
        },
      })
      const node2 = createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
        content: 'Target 1',
      })
      const node3 = createMockNode({
        id: '33333333-3333-3333-3333-333333333333',
        content: 'Target 2',
      })

      const result = transformToGraphData([node1, node2, node3])

      const hubNode = result.nodes.find(
        (n) => n.id === '11111111-1111-1111-1111-111111111111',
      )
      expect(hubNode?.outgoingCount).toBe(2)
      expect(hubNode?.incomingCount).toBe(0)
      expect(hubNode?.totalConnections).toBe(2)
      expect(hubNode?.isOrphan).toBe(false)

      const target1 = result.nodes.find(
        (n) => n.id === '22222222-2222-2222-2222-222222222222',
      )
      expect(target1?.incomingCount).toBe(1)
      expect(target1?.isOrphan).toBe(false)
    })

    it('should mark orphan nodes correctly', () => {
      const connected1 = createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        properties: {
          [SYSTEM_FIELDS.DEPENDENCIES]: createProperty(
            '22222222-2222-2222-2222-222222222222',
            'dependencies',
          ),
        },
      })
      const connected2 = createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
      })
      const orphan = createMockNode({
        id: 'orphan-node',
        content: 'Orphan',
      })

      const result = transformToGraphData([connected1, connected2, orphan])

      const orphanNode = result.nodes.find((n) => n.id === 'orphan-node')
      expect(orphanNode?.isOrphan).toBe(true)
      expect(orphanNode?.totalConnections).toBe(0)
    })
  })

  describe('filtering', () => {
    it('should filter by supertag when supertagFilter is provided', () => {
      const item = createMockNode({
        id: 'item-node',
        content: 'Item',
        supertags: [
          { id: 'supertag-item', content: 'Item', systemId: 'supertag:item' },
        ],
      })
      const tool = createMockNode({
        id: 'tool-node',
        content: 'Tool',
        supertags: [
          { id: 'supertag-tool', content: 'Tool', systemId: 'supertag:tool' },
        ],
      })

      const result = transformToGraphData([item, tool], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        supertagFilter: ['supertag-item'],
      })

      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].id).toBe('item-node')
    })

    it('should filter out orphans when showOrphans is false', () => {
      const connected1 = createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        properties: {
          [SYSTEM_FIELDS.DEPENDENCIES]: createProperty(
            '22222222-2222-2222-2222-222222222222',
            'dependencies',
          ),
        },
      })
      const connected2 = createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
      })
      const orphan = createMockNode({
        id: 'orphan-node',
      })

      const result = transformToGraphData([connected1, connected2, orphan], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        showOrphans: false,
      })

      expect(result.nodes).toHaveLength(2)
      expect(result.nodes.find((n) => n.id === 'orphan-node')).toBeUndefined()
    })

    it('should include orphans when showOrphans is true', () => {
      const orphan = createMockNode({
        id: 'orphan-node',
      })

      const result = transformToGraphData([orphan], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        showOrphans: true,
      })

      expect(result.nodes).toHaveLength(1)
    })
  })

  describe('search highlighting', () => {
    it('should mark nodes matching search query', () => {
      const node1 = createMockNode({
        id: 'node-1',
        content: 'VSCode Editor',
      })
      const node2 = createMockNode({
        id: 'node-2',
        content: 'Terminal App',
      })

      const result = transformToGraphData([node1, node2], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        searchQuery: 'vscode',
      })

      const matchedNode = result.nodes.find((n) => n.id === 'node-1')
      const unmatchedNode = result.nodes.find((n) => n.id === 'node-2')

      expect(matchedNode?.isMatched).toBe(true)
      expect(unmatchedNode?.isMatched).toBe(false)
    })

    it('should be case-insensitive', () => {
      const node = createMockNode({
        id: 'node-1',
        content: 'VSCode',
      })

      const result = transformToGraphData([node], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        searchQuery: 'VSCODE',
      })

      expect(result.nodes[0].isMatched).toBe(true)
    })

    it('should match against supertag names', () => {
      const node = createMockNode({
        id: 'node-1',
        content: 'Some Node',
        supertags: [
          { id: 'st-1', content: 'Development Tool', systemId: null },
        ],
      })

      const result = transformToGraphData([node], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        searchQuery: 'development',
      })

      expect(result.nodes[0].isMatched).toBe(true)
    })
  })

  describe('statistics', () => {
    it('should compute correct statistics', () => {
      const node1 = createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        properties: {
          [SYSTEM_FIELDS.DEPENDENCIES]: createProperty(
            '22222222-2222-2222-2222-222222222222',
            'dependencies',
          ),
        },
      })
      const node2 = createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
      })
      const orphan = createMockNode({
        id: 'orphan-node',
      })

      const result = transformToGraphData([node1, node2, orphan])

      expect(result.stats.totalNodes).toBe(3)
      expect(result.stats.totalEdges).toBe(1)
      expect(result.stats.orphanCount).toBe(1)
      // 2 connected components: (node1 + node2) and (orphan)
      expect(result.stats.connectedComponents).toBe(2)
    })
  })

  describe('tag synthesis', () => {
    it('should synthesize virtual tag nodes when includeTags is true', () => {
      const node = createMockNode({
        id: 'node-1',
        properties: {
          [SYSTEM_FIELDS.TAGS]: createProperty(
            '11111111-1111-1111-1111-111111111111',
            'tags',
          ),
        },
      })

      const result = transformToGraphData([node], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        includeTags: true,
      })

      // Should have the original node + the virtual tag node
      expect(result.nodes.length).toBe(2)

      const tagNode = result.nodes.find(
        (n) => n.id === '11111111-1111-1111-1111-111111111111',
      )
      expect(tagNode).toBeDefined()
      expect(tagNode?.type).toBe('tag')
      expect(tagNode?.isVirtual).toBe(true)
    })

    it('should create tag edges when includeTags is true', () => {
      const node = createMockNode({
        id: 'node-1',
        properties: {
          [SYSTEM_FIELDS.TAGS]: createProperty(
            '11111111-1111-1111-1111-111111111111',
            'tags',
          ),
        },
      })

      const result = transformToGraphData([node], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        includeTags: true,
      })

      const tagEdges = result.edges.filter((e) => e.type === 'tag')
      expect(tagEdges).toHaveLength(1)
      expect(tagEdges[0]).toMatchObject({
        source: 'node-1',
        target: '11111111-1111-1111-1111-111111111111',
      })
    })

    it('should not synthesize tags when includeTags is false', () => {
      const node = createMockNode({
        id: 'node-1',
        properties: {
          [SYSTEM_FIELDS.TAGS]: createProperty(
            '11111111-1111-1111-1111-111111111111',
            'tags',
          ),
        },
      })

      const result = transformToGraphData([node], {
        ...DEFAULT_GRAPH_DATA_OPTIONS,
        includeTags: false,
      })

      expect(result.nodes).toHaveLength(1)
      expect(result.edges.filter((e) => e.type === 'tag')).toHaveLength(0)
    })
  })
})

// ============================================================================
// isLargeGraph Tests
// ============================================================================

describe('isLargeGraph', () => {
  it('should return false for small graphs', () => {
    expect(isLargeGraph(100)).toBe(false)
    expect(isLargeGraph(LARGE_GRAPH_THRESHOLD)).toBe(false)
  })

  it('should return true for large graphs', () => {
    expect(isLargeGraph(LARGE_GRAPH_THRESHOLD + 1)).toBe(true)
    expect(isLargeGraph(1000)).toBe(true)
  })
})
