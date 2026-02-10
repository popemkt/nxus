/**
 * Edge Extractors - Unit Tests
 */

import type { AssembledNode } from '@nxus/db'
import { FIELD_NAMES } from '@nxus/db'
import { describe, expect, it } from 'vitest'
import type { EdgeExtractionContext, GraphNode } from '../types.js'
import { extractDependencyEdges } from './dependency-extractor.js'
import { extractBacklinkEdges, buildBacklinkMap } from './backlink-extractor.js'
import { extractReferenceEdges } from './reference-extractor.js'
import { extractHierarchyEdges, buildChildrenMap } from './hierarchy-extractor.js'
import { extractAllEdges, createExtractionContext } from './index.js'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockNode(overrides: Partial<AssembledNode> = {}): AssembledNode {
  return {
    id: 'test-node-id',
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

function createMockGraphNode(id: string): GraphNode {
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
  }
}

function createContext(nodeIds: string[]): EdgeExtractionContext {
  const nodeMap = new Map<string, GraphNode>()
  const sourceNodeMap = new Map<string, AssembledNode>()

  for (const id of nodeIds) {
    nodeMap.set(id, createMockGraphNode(id))
    sourceNodeMap.set(id, createMockNode({ id }))
  }

  return { nodeMap, sourceNodeMap }
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
// Dependency Extractor Tests
// ============================================================================

describe('extractDependencyEdges', () => {
  it('should extract edges from dependencies property with single ID', () => {
    const context = createContext(['node-a', 'node-b'])
    const node = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.DEPENDENCIES]: createProperty('node-b', 'dependencies'),
      },
    })

    const edges = extractDependencyEdges(node, context)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: 'node-a',
      target: 'node-b',
      type: 'dependency',
      direction: 'outgoing',
    })
  })

  it('should extract edges from dependencies property with array of IDs', () => {
    const context = createContext(['node-a', 'node-b', 'node-c'])
    const node = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.DEPENDENCIES]: createProperty(['node-b', 'node-c'], 'dependencies'),
      },
    })

    const edges = extractDependencyEdges(node, context)

    expect(edges).toHaveLength(2)
    expect(edges.map((e) => e.target)).toContain('node-b')
    expect(edges.map((e) => e.target)).toContain('node-c')
  })

  it('should extract edges from JSON-encoded array', () => {
    const context = createContext(['node-a', 'node-b', 'node-c'])
    const node = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.DEPENDENCIES]: createProperty('["node-b", "node-c"]', 'dependencies'),
      },
    })

    const edges = extractDependencyEdges(node, context)

    expect(edges).toHaveLength(2)
  })

  it('should skip targets not in the graph', () => {
    const context = createContext(['node-a']) // node-b not in graph
    const node = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.DEPENDENCIES]: createProperty('node-b', 'dependencies'),
      },
    })

    const edges = extractDependencyEdges(node, context)

    expect(edges).toHaveLength(0)
  })

  it('should return empty array when no dependencies', () => {
    const context = createContext(['node-a'])
    const node = createMockNode({ id: 'node-a' })

    const edges = extractDependencyEdges(node, context)

    expect(edges).toHaveLength(0)
  })
})

// ============================================================================
// Backlink Extractor Tests
// ============================================================================

describe('buildBacklinkMap', () => {
  it('should build map of nodes that reference each other', () => {
    const nodeA = createMockNode({
      id: 'node-a',
      properties: {
        'field:custom': createProperty('11111111-1111-1111-1111-111111111111', 'custom'),
      },
    })
    const nodeB = createMockNode({
      id: '11111111-1111-1111-1111-111111111111',
    })

    const backlinkMap = buildBacklinkMap([nodeA, nodeB])

    expect(backlinkMap.get('11111111-1111-1111-1111-111111111111')).toEqual([
      { sourceId: 'node-a', fieldName: 'custom' },
    ])
  })

  it('should exclude explicit relationship fields', () => {
    const nodeA = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.DEPENDENCIES]: createProperty('11111111-1111-1111-1111-111111111111', 'dependencies'),
        [FIELD_NAMES.PARENT]: createProperty('22222222-2222-2222-2222-222222222222', 'parent'),
      },
    })

    const backlinkMap = buildBacklinkMap([nodeA])

    expect(backlinkMap.get('11111111-1111-1111-1111-111111111111')).toBeUndefined()
    expect(backlinkMap.get('22222222-2222-2222-2222-222222222222')).toBeUndefined()
  })

  it('should not create self-references', () => {
    const nodeA = createMockNode({
      id: '11111111-1111-1111-1111-111111111111',
      properties: {
        'field:custom': createProperty('11111111-1111-1111-1111-111111111111', 'custom'),
      },
    })

    const backlinkMap = buildBacklinkMap([nodeA])

    expect(backlinkMap.get('11111111-1111-1111-1111-111111111111')).toBeUndefined()
  })
})

describe('extractBacklinkEdges', () => {
  it('should extract incoming edges from backlink map', () => {
    const context = createContext(['node-a', '11111111-1111-1111-1111-111111111111'])
    const backlinkMap = new Map([
      ['11111111-1111-1111-1111-111111111111', [{ sourceId: 'node-a', fieldName: 'custom' }]],
    ])
    const node = createMockNode({ id: '11111111-1111-1111-1111-111111111111' })

    const edges = extractBacklinkEdges(node, context, backlinkMap)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: 'node-a',
      target: '11111111-1111-1111-1111-111111111111',
      type: 'backlink',
      direction: 'incoming',
    })
  })

  it('should skip sources not in the graph', () => {
    const context = createContext(['11111111-1111-1111-1111-111111111111']) // node-a not in graph
    const backlinkMap = new Map([
      ['11111111-1111-1111-1111-111111111111', [{ sourceId: 'node-a', fieldName: 'custom' }]],
    ])
    const node = createMockNode({ id: '11111111-1111-1111-1111-111111111111' })

    const edges = extractBacklinkEdges(node, context, backlinkMap)

    expect(edges).toHaveLength(0)
  })
})

// ============================================================================
// Reference Extractor Tests
// ============================================================================

describe('extractReferenceEdges', () => {
  it('should extract edges from UUID-like property values', () => {
    const context = createContext(['node-a', '11111111-1111-1111-1111-111111111111'])
    const node = createMockNode({
      id: 'node-a',
      properties: {
        'field:custom': createProperty('11111111-1111-1111-1111-111111111111', 'custom'),
      },
    })

    const edges = extractReferenceEdges(node, context)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: 'node-a',
      target: '11111111-1111-1111-1111-111111111111',
      type: 'reference',
      direction: 'outgoing',
    })
  })

  it('should skip fields handled by dedicated extractors', () => {
    const context = createContext(['node-a', '11111111-1111-1111-1111-111111111111'])
    const node = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.DEPENDENCIES]: createProperty('11111111-1111-1111-1111-111111111111', 'dependencies'),
        [FIELD_NAMES.PARENT]: createProperty('11111111-1111-1111-1111-111111111111', 'parent'),
      },
    })

    const edges = extractReferenceEdges(node, context)

    expect(edges).toHaveLength(0)
  })

  it('should not create self-references', () => {
    const context = createContext(['11111111-1111-1111-1111-111111111111'])
    const node = createMockNode({
      id: '11111111-1111-1111-1111-111111111111',
      properties: {
        'field:custom': createProperty('11111111-1111-1111-1111-111111111111', 'custom'),
      },
    })

    const edges = extractReferenceEdges(node, context)

    expect(edges).toHaveLength(0)
  })

  it('should extract edges from known reference fields', () => {
    const context = createContext(['node-a', '11111111-1111-1111-1111-111111111111'])
    const node = createMockNode({
      id: 'node-a',
      properties: {
        [FIELD_NAMES.COMMANDS]: createProperty('11111111-1111-1111-1111-111111111111', 'commands'),
      },
    })

    const edges = extractReferenceEdges(node, context)

    expect(edges).toHaveLength(1)
  })
})

// ============================================================================
// Hierarchy Extractor Tests
// ============================================================================

describe('extractHierarchyEdges', () => {
  it('should extract edge from field:parent property', () => {
    const context = createContext(['child-node', '11111111-1111-1111-1111-111111111111'])
    const node = createMockNode({
      id: 'child-node',
      properties: {
        [FIELD_NAMES.PARENT]: createProperty('11111111-1111-1111-1111-111111111111', 'parent'),
      },
    })

    const edges = extractHierarchyEdges(node, context)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: 'child-node',
      target: '11111111-1111-1111-1111-111111111111',
      type: 'hierarchy',
      direction: 'outgoing',
    })
  })

  it('should extract edge from ownerId field', () => {
    const context = createContext(['child-node', 'parent-node'])
    const node = createMockNode({
      id: 'child-node',
      ownerId: 'parent-node',
    })

    const edges = extractHierarchyEdges(node, context)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: 'child-node',
      target: 'parent-node',
      type: 'hierarchy',
    })
  })

  it('should not duplicate edges when both parent and ownerId point to same node', () => {
    const context = createContext(['child-node', '11111111-1111-1111-1111-111111111111'])
    const node = createMockNode({
      id: 'child-node',
      ownerId: '11111111-1111-1111-1111-111111111111',
      properties: {
        [FIELD_NAMES.PARENT]: createProperty('11111111-1111-1111-1111-111111111111', 'parent'),
      },
    })

    const edges = extractHierarchyEdges(node, context)

    expect(edges).toHaveLength(1)
  })

  it('should skip parents not in the graph', () => {
    const context = createContext(['child-node']) // parent not in graph
    const node = createMockNode({
      id: 'child-node',
      properties: {
        [FIELD_NAMES.PARENT]: createProperty('11111111-1111-1111-1111-111111111111', 'parent'),
      },
    })

    const edges = extractHierarchyEdges(node, context)

    expect(edges).toHaveLength(0)
  })
})

describe('buildChildrenMap', () => {
  it('should build map of parent to children', () => {
    const parentId = '11111111-1111-1111-1111-111111111111'
    const child1 = createMockNode({
      id: 'child-1',
      ownerId: parentId,
    })
    const child2 = createMockNode({
      id: 'child-2',
      properties: {
        [FIELD_NAMES.PARENT]: createProperty(parentId, 'parent'),
      },
    })

    const childrenMap = buildChildrenMap([child1, child2])

    expect(childrenMap.get(parentId)).toEqual(['child-1', 'child-2'])
  })
})

// ============================================================================
// Integration: extractAllEdges
// ============================================================================

describe('extractAllEdges', () => {
  it('should combine edges from all extractors', () => {
    const nodes: AssembledNode[] = [
      createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        properties: {
          [FIELD_NAMES.DEPENDENCIES]: createProperty('22222222-2222-2222-2222-222222222222', 'dependencies'),
        },
      }),
      createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
        ownerId: '11111111-1111-1111-1111-111111111111',
        properties: {
          'field:custom': createProperty('33333333-3333-3333-3333-333333333333', 'custom'),
        },
      }),
      createMockNode({
        id: '33333333-3333-3333-3333-333333333333',
      }),
    ]

    const graphNodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      graphNodeMap.set(n.id, createMockGraphNode(n.id))
    }

    const context = createExtractionContext(nodes, graphNodeMap)

    const edges = extractAllEdges(nodes, context, {
      includeRefs: true,
      includeHierarchy: true,
    })

    // Should have:
    // 1. Dependency edge: node-1 -> node-2
    // 2. Hierarchy edge: node-2 -> node-1 (ownerId)
    // 3. Reference edge: node-2 -> node-3 (custom field)
    // 4. Backlink edge: node-1 -> node-2 (from node-2's custom field pointing back... wait no, it points to node-3)
    // Actually backlink: node-2 references node-3, so node-3 has backlink from node-2 (but that's same as reference)

    expect(edges.length).toBeGreaterThanOrEqual(3)

    const dependencyEdges = edges.filter((e) => e.type === 'dependency')
    const hierarchyEdges = edges.filter((e) => e.type === 'hierarchy')
    const referenceEdges = edges.filter((e) => e.type === 'reference')

    expect(dependencyEdges).toHaveLength(1)
    expect(hierarchyEdges).toHaveLength(1)
    expect(referenceEdges).toHaveLength(1)
  })

  it('should deduplicate edges with same ID', () => {
    const nodes: AssembledNode[] = [
      createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        properties: {
          [FIELD_NAMES.DEPENDENCIES]: [
            ...createProperty('22222222-2222-2222-2222-222222222222', 'dependencies'),
            ...createProperty('22222222-2222-2222-2222-222222222222', 'dependencies'), // duplicate
          ],
        },
      }),
      createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
      }),
    ]

    const graphNodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      graphNodeMap.set(n.id, createMockGraphNode(n.id))
    }

    const context = createExtractionContext(nodes, graphNodeMap)

    const edges = extractAllEdges(nodes, context, {
      includeRefs: false,
      includeHierarchy: false,
    })

    const dependencyEdges = edges.filter((e) => e.type === 'dependency')
    expect(dependencyEdges).toHaveLength(1)
  })

  it('should respect includeRefs option', () => {
    const nodes: AssembledNode[] = [
      createMockNode({
        id: '11111111-1111-1111-1111-111111111111',
        properties: {
          'field:custom': createProperty('22222222-2222-2222-2222-222222222222', 'custom'),
        },
      }),
      createMockNode({
        id: '22222222-2222-2222-2222-222222222222',
      }),
    ]

    const graphNodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      graphNodeMap.set(n.id, createMockGraphNode(n.id))
    }

    const context = createExtractionContext(nodes, graphNodeMap)

    const edgesWithRefs = extractAllEdges(nodes, context, {
      includeRefs: true,
      includeHierarchy: false,
    })

    const edgesWithoutRefs = extractAllEdges(nodes, context, {
      includeRefs: false,
      includeHierarchy: false,
    })

    const refEdgesWithRefs = edgesWithRefs.filter((e) => e.type === 'reference')
    const refEdgesWithoutRefs = edgesWithoutRefs.filter((e) => e.type === 'reference')

    expect(refEdgesWithRefs.length).toBeGreaterThan(0)
    expect(refEdgesWithoutRefs).toHaveLength(0)
  })

  it('should respect includeHierarchy option', () => {
    const nodes: AssembledNode[] = [
      createMockNode({
        id: 'child-node',
        ownerId: 'parent-node',
      }),
      createMockNode({
        id: 'parent-node',
      }),
    ]

    const graphNodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      graphNodeMap.set(n.id, createMockGraphNode(n.id))
    }

    const context = createExtractionContext(nodes, graphNodeMap)

    const edgesWithHierarchy = extractAllEdges(nodes, context, {
      includeRefs: false,
      includeHierarchy: true,
    })

    const edgesWithoutHierarchy = extractAllEdges(nodes, context, {
      includeRefs: false,
      includeHierarchy: false,
    })

    const hierarchyWithHierarchy = edgesWithHierarchy.filter((e) => e.type === 'hierarchy')
    const hierarchyWithoutHierarchy = edgesWithoutHierarchy.filter((e) => e.type === 'hierarchy')

    expect(hierarchyWithHierarchy.length).toBeGreaterThan(0)
    expect(hierarchyWithoutHierarchy).toHaveLength(0)
  })
})

describe('createExtractionContext', () => {
  it('should create context with both maps populated', () => {
    const nodes: AssembledNode[] = [
      createMockNode({ id: 'node-1' }),
      createMockNode({ id: 'node-2' }),
    ]

    const graphNodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      graphNodeMap.set(n.id, createMockGraphNode(n.id))
    }

    const context = createExtractionContext(nodes, graphNodeMap)

    expect(context.nodeMap.size).toBe(2)
    expect(context.sourceNodeMap.size).toBe(2)
    expect(context.sourceNodeMap.get('node-1')).toBe(nodes[0])
    expect(context.sourceNodeMap.get('node-2')).toBe(nodes[1])
  })
})
