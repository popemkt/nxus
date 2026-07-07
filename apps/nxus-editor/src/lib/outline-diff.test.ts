import { describe, it, expect } from 'vitest'
import { diffOutlineSnapshots } from './outline-diff'
import type { NodeMap, OutlineField, OutlineNode } from '@/types/outline'

function makeNode(
  id: string,
  content: string,
  parentId: string | null,
  order: string,
  children: string[] = [],
  fields: OutlineField[] = [],
): OutlineNode {
  return { id, content, parentId, order, children, collapsed: false, supertags: [], fields }
}

function toMap(nodes: OutlineNode[]): NodeMap {
  return new Map(nodes.map((n) => [n.id, n]))
}

describe('diffOutlineSnapshots', () => {
  it('undoing a delete resurrects the node on the server, not just in the store', () => {
    // before: current store state right after a delete (node gone)
    const before = toMap([makeNode('root', 'Root', null, '00000000', ['a'])])
    // after: the pre-delete snapshot being restored by undo
    const after = toMap([
      makeNode('root', 'Root', null, '00000000', ['a', 'b']),
      makeNode('b', 'Beta', 'root', '00001000'),
    ])

    const ops = diffOutlineSnapshots(before, after)

    expect(ops).toContainEqual({ type: 'restore', nodeId: 'b' })
    expect(ops.find((op) => op.type === 'delete')).toBeUndefined()
  })

  it('redoing a create removes the node from the server, not just the store', () => {
    // before: store state with the created node still present
    const before = toMap([
      makeNode('root', 'Root', null, '00000000', ['a']),
      makeNode('a', 'Alpha', 'root', '00001000'),
    ])
    // after: undo snapshot from before the create — node gone
    const after = toMap([makeNode('root', 'Root', null, '00000000', [])])

    const ops = diffOutlineSnapshots(before, after)

    expect(ops).toContainEqual({ type: 'delete', nodeId: 'a' })
    expect(ops.find((op) => op.type === 'restore')).toBeUndefined()
  })

  it('undoing a content edit persists the reverted content, not just the store text', () => {
    const before = toMap([makeNode('a', 'Edited text', null, '00001000')])
    const after = toMap([makeNode('a', 'Original text', null, '00001000')])

    const ops = diffOutlineSnapshots(before, after)

    expect(ops).toContainEqual({ type: 'content', nodeId: 'a', content: 'Original text' })
  })

  it('undoing a move-up swap persists both siblings\' reverted order keys', () => {
    const before = toMap([
      makeNode('a', 'Alpha', 'root', '00002000'),
      makeNode('b', 'Beta', 'root', '00001000'),
    ])
    const after = toMap([
      makeNode('a', 'Alpha', 'root', '00001000'),
      makeNode('b', 'Beta', 'root', '00002000'),
    ])

    const ops = diffOutlineSnapshots(before, after)

    expect(ops).toContainEqual({ type: 'reorder', nodeId: 'a', order: '00001000' })
    expect(ops).toContainEqual({ type: 'reorder', nodeId: 'b', order: '00002000' })
  })

  it('undoing an indent persists the reverted parent, carrying the restored order', () => {
    const before = toMap([
      makeNode('root', 'Root', null, '00000000', ['a']),
      makeNode('a', 'Alpha', 'root', '00001000', ['b']),
      makeNode('b', 'Beta', 'a', '00001000'),
    ])
    const after = toMap([
      makeNode('root', 'Root', null, '00000000', ['a', 'b']),
      makeNode('a', 'Alpha', 'root', '00001000', []),
      makeNode('b', 'Beta', 'root', '00002000'),
    ])

    const ops = diffOutlineSnapshots(before, after)

    expect(ops).toContainEqual({ type: 'reparent', nodeId: 'b', parentId: 'root', order: '00002000' })
    // A parent change carries its own order — no separate reorder op for the same node.
    expect(ops.filter((op) => op.nodeId === 'b')).toHaveLength(1)
  })

  it('field and supertag changes are flagged, not silently persisted or dropped', () => {
    const field: OutlineField = {
      fieldId: 'field:status',
      fieldName: 'Status',
      fieldNodeId: 'node-1',
      fieldSystemId: 'field:status',
      fieldType: 'text',
      values: [{ value: 'Done', order: 0 }],
    }
    const before = toMap([makeNode('a', 'Alpha', null, '00001000', [], [])])
    const after = toMap([makeNode('a', 'Alpha', null, '00001000', [], [field])])

    const ops = diffOutlineSnapshots(before, after)

    expect(ops).toContainEqual({ type: 'fieldsOrSupertagsChanged', nodeId: 'a' })
  })

  it('produces no ops for two structurally identical snapshots', () => {
    const before = toMap([
      makeNode('root', 'Root', null, '00000000', ['a']),
      makeNode('a', 'Alpha', 'root', '00001000'),
    ])
    const after = toMap([
      makeNode('root', 'Root', null, '00000000', ['a']),
      makeNode('a', 'Alpha', 'root', '00001000'),
    ])

    expect(diffOutlineSnapshots(before, after)).toEqual([])
  })
})
