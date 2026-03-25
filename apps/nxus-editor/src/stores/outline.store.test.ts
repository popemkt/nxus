import { describe, it, expect, beforeEach } from 'vitest'
import { useOutlineStore } from './outline.store'
import type { OutlineField, OutlineNode } from '@/types/outline'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

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

function seedStore() {
  const nodes = new Map<string, OutlineNode>()
  nodes.set(WORKSPACE_ROOT_ID, makeNode(WORKSPACE_ROOT_ID, 'Workspace', null, '00000000', ['a', 'b', 'c']))
  nodes.set('a', makeNode('a', 'Alpha', WORKSPACE_ROOT_ID, '00001000', ['a1', 'a2']))
  nodes.set('b', makeNode('b', 'Beta', WORKSPACE_ROOT_ID, '00002000'))
  nodes.set('c', makeNode('c', 'Charlie', WORKSPACE_ROOT_ID, '00003000'))
  nodes.set('a1', makeNode('a1', 'Alpha child 1', 'a', '00001000'))
  nodes.set('a2', makeNode('a2', 'Alpha child 2', 'a', '00002000'))
  useOutlineStore.setState({ nodes, rootNodeId: WORKSPACE_ROOT_ID })
}

describe('outline store', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: new Map(),
      rootNodeId: WORKSPACE_ROOT_ID,
      activeNodeId: null,
      selectedNodeId: null,
      selectedNodeIds: new Set(),
      cursorPosition: 0,
    })
  })

  describe('setNodes', () => {
    it('replaces the node map', () => {
      const nodes = new Map<string, OutlineNode>()
      nodes.set('x', makeNode('x', 'test', null, '00000000'))
      useOutlineStore.getState().setNodes(nodes)
      expect(useOutlineStore.getState().nodes.size).toBe(1)
      expect(useOutlineStore.getState().nodes.get('x')?.content).toBe('test')
    })
  })

  describe('activateNode / deactivateNode', () => {
    it('sets activeNodeId and cursorPosition', () => {
      useOutlineStore.getState().activateNode('node1', 5)
      const state = useOutlineStore.getState()
      expect(state.activeNodeId).toBe('node1')
      expect(state.selectedNodeId).toBe('node1')
      expect(state.cursorPosition).toBe(5)
    })

    it('defaults cursor to 0', () => {
      useOutlineStore.getState().activateNode('node1')
      expect(useOutlineStore.getState().cursorPosition).toBe(0)
    })

    it('deactivates', () => {
      useOutlineStore.getState().activateNode('node1', 3)
      useOutlineStore.getState().deactivateNode()
      expect(useOutlineStore.getState().activeNodeId).toBeNull()
    })
  })

  describe('selectNode', () => {
    it('sets selectedNodeId and clears activeNodeId', () => {
      useOutlineStore.getState().activateNode('node1', 0)
      useOutlineStore.getState().selectNode('node2')
      const state = useOutlineStore.getState()
      expect(state.selectedNodeId).toBe('node2')
      expect(state.activeNodeId).toBeNull()
    })
  })

  describe('toggleCollapse', () => {
    it('toggles collapsed state on nodes with children', () => {
      seedStore()
      const store = useOutlineStore.getState()
      expect(store.nodes.get('a')?.collapsed).toBe(false)

      store.toggleCollapse('a')
      expect(useOutlineStore.getState().nodes.get('a')?.collapsed).toBe(true)

      useOutlineStore.getState().toggleCollapse('a')
      expect(useOutlineStore.getState().nodes.get('a')?.collapsed).toBe(false)
    })

    it('does nothing on leaf nodes', () => {
      seedStore()
      useOutlineStore.getState().toggleCollapse('b')
      expect(useOutlineStore.getState().nodes.get('b')?.collapsed).toBe(false)
    })
  })

  describe('updateNodeContent', () => {
    it('updates the content of a node', () => {
      seedStore()
      useOutlineStore.getState().updateNodeContent('a', 'Updated Alpha')
      expect(useOutlineStore.getState().nodes.get('a')?.content).toBe('Updated Alpha')
    })

    it('does nothing for nonexistent node', () => {
      seedStore()
      const before = useOutlineStore.getState().nodes
      useOutlineStore.getState().updateNodeContent('nonexistent', 'x')
      // Map reference should not change
      expect(useOutlineStore.getState().nodes).toBe(before)
    })
  })

  describe('updateFieldValue', () => {
    it('updates a field by field id', () => {
      const customField: OutlineField = {
        fieldId: 'field-node-1',
        fieldName: 'Priority',
        fieldNodeId: 'field-node-1',
        fieldSystemId: null,
        fieldType: 'text',
        values: [{ value: 'Low', order: 0 }],
      }

      const nodes = new Map<string, OutlineNode>()
      nodes.set(
        'a',
        makeNode('a', 'Alpha', WORKSPACE_ROOT_ID, '00001000', [], [customField]),
      )
      useOutlineStore.setState({ nodes, rootNodeId: WORKSPACE_ROOT_ID })

      useOutlineStore.getState().updateFieldValue('a', 'field-node-1', 'High')

      expect(useOutlineStore.getState().nodes.get('a')?.fields[0]?.values[0]?.value).toBe('High')
    })
  })

  describe('createNodeAfter', () => {
    it('creates a new sibling after the given node', () => {
      seedStore()
      const newId = useOutlineStore.getState().createNodeAfter('a')
      const state = useOutlineStore.getState()

      expect(newId).not.toBe('a')
      expect(state.nodes.has(newId)).toBe(true)

      const newNode = state.nodes.get(newId)!
      expect(newNode.content).toBe('')
      expect(newNode.parentId).toBe(WORKSPACE_ROOT_ID)
      expect(newNode.children).toEqual([])

      // Should be in parent's children
      const root = state.nodes.get(WORKSPACE_ROOT_ID)!
      expect(root.children).toContain(newId)

      // New node should be active
      expect(state.activeNodeId).toBe(newId)
    })

    it('orders between afterNode and next sibling', () => {
      seedStore()
      const newId = useOutlineStore.getState().createNodeAfter('a')
      const state = useOutlineStore.getState()
      const newNode = state.nodes.get(newId)!
      const nodeA = state.nodes.get('a')!
      const nodeB = state.nodes.get('b')!

      // New node order should be between a and b
      expect(newNode.order > nodeA.order).toBe(true)
      expect(newNode.order < nodeB.order).toBe(true)
    })

    it('returns afterId when parent is missing', () => {
      seedStore()
      const result = useOutlineStore.getState().createNodeAfter(WORKSPACE_ROOT_ID)
      expect(result).toBe(WORKSPACE_ROOT_ID) // root has no parent
    })

    it('rebalances sibling orders when there is no numeric gap', () => {
      const nodes = new Map<string, OutlineNode>()
      nodes.set(
        WORKSPACE_ROOT_ID,
        makeNode(WORKSPACE_ROOT_ID, 'Workspace', null, '00000000', ['a', 'b']),
      )
      nodes.set('a', makeNode('a', 'Alpha', WORKSPACE_ROOT_ID, '00001000'))
      nodes.set('b', makeNode('b', 'Beta', WORKSPACE_ROOT_ID, '00001001'))
      useOutlineStore.setState({ nodes, rootNodeId: WORKSPACE_ROOT_ID })

      const newId = useOutlineStore.getState().createNodeAfter('a')
      const state = useOutlineStore.getState()

      expect(state.nodes.get(newId)?.order).toBe('00001500')
      expect(state.nodes.get('b')?.order).toBe('00002000')
    })
  })

  describe('deleteNode', () => {
    it('removes the node and updates parent children', () => {
      seedStore()
      useOutlineStore.getState().deleteNode('b')
      const state = useOutlineStore.getState()

      expect(state.nodes.has('b')).toBe(false)
      expect(state.nodes.get(WORKSPACE_ROOT_ID)?.children).not.toContain('b')
    })

    it('recursively deletes children', () => {
      seedStore()
      useOutlineStore.getState().deleteNode('a')
      const state = useOutlineStore.getState()

      expect(state.nodes.has('a')).toBe(false)
      expect(state.nodes.has('a1')).toBe(false)
      expect(state.nodes.has('a2')).toBe(false)
    })

    it('does nothing for root node (no parent)', () => {
      seedStore()
      const before = useOutlineStore.getState().nodes.size
      useOutlineStore.getState().deleteNode(WORKSPACE_ROOT_ID)
      expect(useOutlineStore.getState().nodes.size).toBe(before)
    })
  })

  describe('indentNode', () => {
    it('makes node a child of previous sibling', () => {
      seedStore()
      useOutlineStore.getState().indentNode('b')
      const state = useOutlineStore.getState()

      expect(state.nodes.get('b')?.parentId).toBe('a')
      expect(state.nodes.get('a')?.children).toContain('b')
      expect(state.nodes.get(WORKSPACE_ROOT_ID)?.children).not.toContain('b')
    })

    it('does nothing for first sibling', () => {
      seedStore()
      useOutlineStore.getState().indentNode('a')
      expect(useOutlineStore.getState().nodes.get('a')?.parentId).toBe(WORKSPACE_ROOT_ID)
    })

    it('uncolllapses the new parent', () => {
      seedStore()
      useOutlineStore.getState().toggleCollapse('a') // collapse a
      expect(useOutlineStore.getState().nodes.get('a')?.collapsed).toBe(true)

      useOutlineStore.getState().indentNode('b')
      expect(useOutlineStore.getState().nodes.get('a')?.collapsed).toBe(false)
    })
  })

  describe('outdentNode', () => {
    it('makes node a sibling of its parent', () => {
      seedStore()
      useOutlineStore.getState().outdentNode('a1')
      const state = useOutlineStore.getState()

      expect(state.nodes.get('a1')?.parentId).toBe(WORKSPACE_ROOT_ID)
      expect(state.nodes.get(WORKSPACE_ROOT_ID)?.children).toContain('a1')
      expect(state.nodes.get('a')?.children).not.toContain('a1')
    })

    it('does nothing for top-level nodes (parent has no parent)', () => {
      seedStore()
      useOutlineStore.getState().outdentNode('a')
      expect(useOutlineStore.getState().nodes.get('a')?.parentId).toBe(WORKSPACE_ROOT_ID)
    })
  })

  describe('moveNodeUp / moveNodeDown', () => {
    it('swaps order with previous sibling', () => {
      seedStore()
      const orderB = useOutlineStore.getState().nodes.get('b')!.order
      const orderA = useOutlineStore.getState().nodes.get('a')!.order

      useOutlineStore.getState().moveNodeUp('b')
      const state = useOutlineStore.getState()

      expect(state.nodes.get('b')!.order).toBe(orderA)
      expect(state.nodes.get('a')!.order).toBe(orderB)
    })

    it('swaps order with next sibling', () => {
      seedStore()
      const orderA = useOutlineStore.getState().nodes.get('a')!.order
      const orderB = useOutlineStore.getState().nodes.get('b')!.order

      useOutlineStore.getState().moveNodeDown('a')
      const state = useOutlineStore.getState()

      expect(state.nodes.get('a')!.order).toBe(orderB)
      expect(state.nodes.get('b')!.order).toBe(orderA)
    })

    it('moveNodeUp does nothing for first sibling', () => {
      seedStore()
      const orderA = useOutlineStore.getState().nodes.get('a')!.order
      useOutlineStore.getState().moveNodeUp('a')
      expect(useOutlineStore.getState().nodes.get('a')!.order).toBe(orderA)
    })

    it('moveNodeDown does nothing for last sibling', () => {
      seedStore()
      const orderC = useOutlineStore.getState().nodes.get('c')!.order
      useOutlineStore.getState().moveNodeDown('c')
      expect(useOutlineStore.getState().nodes.get('c')!.order).toBe(orderC)
    })
  })

  describe('moveNodeTo', () => {
    it('moves a node under a new parent as the last child', () => {
      seedStore()
      useOutlineStore.getState().moveNodeTo('b', 'a')
      const state = useOutlineStore.getState()

      expect(state.nodes.get('b')?.parentId).toBe('a')
      expect(state.nodes.get(WORKSPACE_ROOT_ID)?.children).not.toContain('b')
      expect(state.nodes.get('a')?.children).toContain('b')
      expect(state.nodes.get('a')?.collapsed).toBe(false)
    })

    it('does not allow moving a node under its descendant', () => {
      seedStore()
      useOutlineStore.getState().moveNodeTo('a', 'a1')
      const state = useOutlineStore.getState()

      expect(state.nodes.get('a')?.parentId).toBe(WORKSPACE_ROOT_ID)
      expect(state.nodes.get('a1')?.parentId).toBe('a')
    })
  })

  describe('getVisibleNodes', () => {
    it('returns all nodes in tree order (excluding root)', () => {
      seedStore()
      const visible = useOutlineStore.getState().getVisibleNodes()
      expect(visible).toEqual(['a', 'a1', 'a2', 'b', 'c'])
    })

    it('hides children of collapsed nodes', () => {
      seedStore()
      useOutlineStore.getState().toggleCollapse('a')
      const visible = useOutlineStore.getState().getVisibleNodes()
      expect(visible).toEqual(['a', 'b', 'c'])
    })
  })

  describe('getPreviousVisibleNode / getNextVisibleNode', () => {
    it('returns adjacent visible nodes', () => {
      seedStore()
      expect(useOutlineStore.getState().getPreviousVisibleNode('b')).toBe('a2')
      expect(useOutlineStore.getState().getNextVisibleNode('a')).toBe('a1')
    })

    it('returns null at boundaries', () => {
      seedStore()
      expect(useOutlineStore.getState().getPreviousVisibleNode('a')).toBeNull()
      expect(useOutlineStore.getState().getNextVisibleNode('c')).toBeNull()
    })

    it('skips collapsed children', () => {
      seedStore()
      useOutlineStore.getState().toggleCollapse('a')
      expect(useOutlineStore.getState().getNextVisibleNode('a')).toBe('b')
      expect(useOutlineStore.getState().getPreviousVisibleNode('b')).toBe('a')
    })
  })

  describe('createNodeAfter with initialContent (node splitting)', () => {
    it('creates a new sibling with the given content', () => {
      seedStore()
      const newId = useOutlineStore.getState().createNodeAfter('a', 'after text')
      const state = useOutlineStore.getState()

      expect(state.nodes.get(newId)?.content).toBe('after text')
      expect(state.nodes.get(newId)?.parentId).toBe(WORKSPACE_ROOT_ID)
      expect(state.activeNodeId).toBe(newId)
    })

    it('defaults to empty content when no initialContent', () => {
      seedStore()
      const newId = useOutlineStore.getState().createNodeAfter('a')
      expect(useOutlineStore.getState().nodes.get(newId)?.content).toBe('')
    })
  })

  describe('createFirstChild', () => {
    it('creates a child of the given parent', () => {
      seedStore()
      // 'b' has no children
      const newId = useOutlineStore.getState().createFirstChild('b')
      const state = useOutlineStore.getState()

      expect(state.nodes.has(newId)).toBe(true)
      expect(state.nodes.get(newId)?.parentId).toBe('b')
      expect(state.nodes.get(newId)?.content).toBe('')
      expect(state.nodes.get('b')?.children).toContain(newId)
      expect(state.activeNodeId).toBe(newId)
    })

    it('returns parentId if parent does not exist', () => {
      seedStore()
      const result = useOutlineStore.getState().createFirstChild('nonexistent')
      expect(result).toBe('nonexistent')
    })
  })

  describe('multi-select: selectedNodeIds, extendSelection, clearSelection', () => {
    it('selectNode sets single selection and clears multi-set', () => {
      seedStore()
      useOutlineStore.getState().selectNode('a')
      const state = useOutlineStore.getState()
      expect(state.selectedNodeId).toBe('a')
      expect(state.selectedNodeIds.size).toBe(1)
      expect(state.selectedNodeIds.has('a')).toBe(true)
      expect(state.activeNodeId).toBeNull()
    })

    it('selectNode(null) clears everything', () => {
      seedStore()
      useOutlineStore.getState().selectNode('a')
      useOutlineStore.getState().selectNode(null)
      const state = useOutlineStore.getState()
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedNodeIds.size).toBe(0)
    })

    it('extendSelection adds nodes to the set', () => {
      seedStore()
      useOutlineStore.getState().selectNode('a')
      useOutlineStore.getState().extendSelection('b')
      const state = useOutlineStore.getState()
      expect(state.selectedNodeIds.size).toBe(2)
      expect(state.selectedNodeIds.has('a')).toBe(true)
      expect(state.selectedNodeIds.has('b')).toBe(true)
      expect(state.selectedNodeId).toBe('b') // anchor moves
    })

    it('extendSelection shrinks when going back over selected node', () => {
      seedStore()
      useOutlineStore.getState().selectNode('a')
      useOutlineStore.getState().extendSelection('b')
      useOutlineStore.getState().extendSelection('a')
      const state = useOutlineStore.getState()
      // 'b' should be removed (shrink), 'a' stays
      expect(state.selectedNodeIds.has('a')).toBe(true)
      expect(state.selectedNodeIds.has('b')).toBe(false)
      expect(state.selectedNodeId).toBe('a')
    })

    it('clearSelection empties all selection state', () => {
      seedStore()
      useOutlineStore.getState().selectNode('a')
      useOutlineStore.getState().extendSelection('b')
      useOutlineStore.getState().clearSelection()
      const state = useOutlineStore.getState()
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedNodeIds.size).toBe(0)
      expect(state.activeNodeId).toBeNull()
    })

    it('activateNode sets single selection in set', () => {
      seedStore()
      useOutlineStore.getState().selectNode('a')
      useOutlineStore.getState().extendSelection('b')
      useOutlineStore.getState().activateNode('c', 5)
      const state = useOutlineStore.getState()
      expect(state.selectedNodeIds.size).toBe(1)
      expect(state.selectedNodeIds.has('c')).toBe(true)
      expect(state.activeNodeId).toBe('c')
    })
  })

  describe('updateFieldBySystemId', () => {
    it('updates a field matched by fieldSystemId', () => {
      const field: OutlineField = {
        fieldId: 'field-node-1',
        fieldName: 'Query Definition',
        fieldNodeId: 'field-node-1',
        fieldSystemId: 'field:query_definition',
        fieldType: 'json',
        values: [{ value: { filters: [] }, order: 0 }],
      }

      const nodes = new Map<string, OutlineNode>()
      nodes.set('a', makeNode('a', 'Alpha', WORKSPACE_ROOT_ID, '00001000', [], [field]))
      useOutlineStore.setState({ nodes, rootNodeId: WORKSPACE_ROOT_ID })

      const newDef = { filters: [{ type: 'supertag', supertag: 'tool' }] }
      useOutlineStore.getState().updateFieldBySystemId('a', 'field:query_definition', newDef)

      const updated = useOutlineStore.getState().nodes.get('a')!.fields[0]!
      expect(updated.values[0]!.value).toEqual(newDef)
      expect(updated.values[0]!.order).toBe(0)
    })

    it('preserves other fields on the same node', () => {
      const qField: OutlineField = {
        fieldId: 'f1',
        fieldName: 'Query Definition',
        fieldNodeId: 'f1',
        fieldSystemId: 'field:query_definition',
        fieldType: 'json',
        values: [{ value: 'old', order: 0 }],
      }
      const otherField: OutlineField = {
        fieldId: 'f2',
        fieldName: 'Notes',
        fieldNodeId: 'f2',
        fieldSystemId: 'field:notes',
        fieldType: 'text',
        values: [{ value: 'keep me', order: 0 }],
      }

      const nodes = new Map<string, OutlineNode>()
      nodes.set('a', makeNode('a', 'Alpha', WORKSPACE_ROOT_ID, '00001000', [], [qField, otherField]))
      useOutlineStore.setState({ nodes, rootNodeId: WORKSPACE_ROOT_ID })

      useOutlineStore.getState().updateFieldBySystemId('a', 'field:query_definition', 'new')

      const node = useOutlineStore.getState().nodes.get('a')!
      expect(node.fields[0]!.values[0]!.value).toBe('new')
      expect(node.fields[1]!.values[0]!.value).toBe('keep me')
    })

    it('does nothing for nonexistent node', () => {
      seedStore()
      const before = useOutlineStore.getState().nodes
      useOutlineStore.getState().updateFieldBySystemId('nonexistent', 'field:x', 'val')
      expect(useOutlineStore.getState().nodes).toBe(before)
    })

    it('creates a values entry when field has no existing values', () => {
      const field: OutlineField = {
        fieldId: 'f1',
        fieldName: 'Query Definition',
        fieldNodeId: 'f1',
        fieldSystemId: 'field:query_definition',
        fieldType: 'json',
        values: [],
      }

      const nodes = new Map<string, OutlineNode>()
      nodes.set('a', makeNode('a', 'Alpha', WORKSPACE_ROOT_ID, '00001000', [], [field]))
      useOutlineStore.setState({ nodes, rootNodeId: WORKSPACE_ROOT_ID })

      useOutlineStore.getState().updateFieldBySystemId('a', 'field:query_definition', 'new-val')

      const updated = useOutlineStore.getState().nodes.get('a')!.fields[0]!
      expect(updated.values).toHaveLength(1)
      expect(updated.values[0]!.value).toBe('new-val')
      expect(updated.values[0]!.order).toBe(0)
    })
  })

  // ─── Supertag operations ─────────────────────────────────────────

  describe('addSupertag', () => {
    it('adds a supertag badge to a node', () => {
      seedStore()
      const tag = { id: 'tag1', name: 'Project', color: '#3b82f6', systemId: 'supertag:project' }
      useOutlineStore.getState().addSupertag('a', tag, [])
      const node = useOutlineStore.getState().nodes.get('a')!
      expect(node.supertags).toHaveLength(1)
      expect(node.supertags[0]!.name).toBe('Project')
    })

    it('also merges new fields from the supertag definition', () => {
      seedStore()
      const tag = { id: 'tag1', name: 'Bug', color: null, systemId: 'supertag:bug' }
      const fields: OutlineField[] = [
        {
          fieldId: 'field:severity',
          fieldName: 'Severity',
          fieldNodeId: 'fn-sev',
          fieldSystemId: 'field:severity',
          fieldType: 'select',
          values: [],
        },
        {
          fieldId: 'field:status',
          fieldName: 'Status',
          fieldNodeId: 'fn-status',
          fieldSystemId: 'field:status',
          fieldType: 'select',
          values: [],
        },
      ]
      useOutlineStore.getState().addSupertag('b', tag, fields)
      const node = useOutlineStore.getState().nodes.get('b')!
      expect(node.supertags).toHaveLength(1)
      expect(node.fields).toHaveLength(2)
      expect(node.fields[0]!.fieldName).toBe('Severity')
    })

    it('skips duplicate supertag if already present', () => {
      seedStore()
      const tag = { id: 'tag1', name: 'Project', color: null, systemId: 'supertag:project' }
      useOutlineStore.getState().addSupertag('a', tag, [])
      useOutlineStore.getState().addSupertag('a', tag, [])
      expect(useOutlineStore.getState().nodes.get('a')!.supertags).toHaveLength(1)
    })

    it('skips duplicate fields if already present', () => {
      seedStore()
      const existingField: OutlineField = {
        fieldId: 'field:priority',
        fieldName: 'Priority',
        fieldNodeId: 'fn-pri',
        fieldSystemId: 'field:priority',
        fieldType: 'select',
        values: [{ value: 'High', order: 0 }],
      }
      // First set node with existing field
      const nodes = useOutlineStore.getState().nodes
      const newNodes = new Map(nodes)
      const nodeA = newNodes.get('a')!
      newNodes.set('a', { ...nodeA, fields: [existingField] })
      useOutlineStore.setState({ nodes: newNodes })

      // Now add supertag with same field
      const tag = { id: 'tag1', name: 'Bug', color: null, systemId: 'supertag:bug' }
      useOutlineStore.getState().addSupertag('a', tag, [existingField])
      expect(useOutlineStore.getState().nodes.get('a')!.fields).toHaveLength(1) // not duplicated
    })

    it('does nothing for nonexistent node', () => {
      seedStore()
      const before = useOutlineStore.getState().nodes.size
      const tag = { id: 'tag1', name: 'Test', color: null, systemId: 'supertag:test' }
      useOutlineStore.getState().addSupertag('nonexistent', tag, [])
      expect(useOutlineStore.getState().nodes.size).toBe(before)
    })
  })

  describe('removeSupertag', () => {
    it('removes a supertag but keeps fields', () => {
      seedStore()
      const tag = { id: 'tag1', name: 'Project', color: null, systemId: 'supertag:project' }
      const field: OutlineField = {
        fieldId: 'field:status',
        fieldName: 'Status',
        fieldNodeId: 'fn-status',
        fieldSystemId: 'field:status',
        fieldType: 'select',
        values: [],
      }
      useOutlineStore.getState().addSupertag('a', tag, [field])
      expect(useOutlineStore.getState().nodes.get('a')!.supertags).toHaveLength(1)
      expect(useOutlineStore.getState().nodes.get('a')!.fields).toHaveLength(1)

      useOutlineStore.getState().removeSupertag('a', 'tag1')
      const node = useOutlineStore.getState().nodes.get('a')!
      expect(node.supertags).toHaveLength(0)
      expect(node.fields).toHaveLength(1) // fields preserved (Tana behavior)
    })
  })

  // ─── Field operations ────────────────────────────────────────────

  describe('addField', () => {
    it('adds a field to a node', () => {
      seedStore()
      const field: OutlineField = {
        fieldId: 'field:notes',
        fieldName: 'Notes',
        fieldNodeId: 'fn-notes',
        fieldSystemId: 'field:notes',
        fieldType: 'text',
        values: [],
      }
      useOutlineStore.getState().addField('b', field)
      const node = useOutlineStore.getState().nodes.get('b')!
      expect(node.fields).toHaveLength(1)
      expect(node.fields[0]!.fieldName).toBe('Notes')
    })

    it('skips duplicate field by fieldId', () => {
      seedStore()
      const field: OutlineField = {
        fieldId: 'field:notes',
        fieldName: 'Notes',
        fieldNodeId: 'fn-notes',
        fieldSystemId: 'field:notes',
        fieldType: 'text',
        values: [],
      }
      useOutlineStore.getState().addField('b', field)
      useOutlineStore.getState().addField('b', field)
      expect(useOutlineStore.getState().nodes.get('b')!.fields).toHaveLength(1)
    })
  })

  describe('removeField', () => {
    it('removes a field by fieldId', () => {
      seedStore()
      const field: OutlineField = {
        fieldId: 'field:notes',
        fieldName: 'Notes',
        fieldNodeId: 'fn-notes',
        fieldSystemId: 'field:notes',
        fieldType: 'text',
        values: [],
      }
      useOutlineStore.getState().addField('b', field)
      expect(useOutlineStore.getState().nodes.get('b')!.fields).toHaveLength(1)

      useOutlineStore.getState().removeField('b', 'field:notes')
      expect(useOutlineStore.getState().nodes.get('b')!.fields).toHaveLength(0)
    })
  })

  // ─── Field with constraint metadata ──────────────────────────────

  describe('fields with constraint metadata', () => {
    it('preserves required/hideWhen/pinned in field data', () => {
      seedStore()
      const field: OutlineField = {
        fieldId: 'field:priority',
        fieldName: 'Priority',
        fieldNodeId: 'fn-pri',
        fieldSystemId: 'field:priority',
        fieldType: 'select',
        values: [],
        required: true,
        hideWhen: 'never',
        pinned: true,
      }
      useOutlineStore.getState().addField('a', field)

      const node = useOutlineStore.getState().nodes.get('a')!
      expect(node.fields[0]!.required).toBe(true)
      expect(node.fields[0]!.hideWhen).toBe('never')
      expect(node.fields[0]!.pinned).toBe(true)
    })

    it('updateFieldValue on a required field changes value but preserves constraints', () => {
      seedStore()
      const field: OutlineField = {
        fieldId: 'field:priority',
        fieldName: 'Priority',
        fieldNodeId: 'fn-pri',
        fieldSystemId: 'field:priority',
        fieldType: 'select',
        values: [{ value: 'Low', order: 0 }],
        required: true,
        pinned: true,
      }
      const nodes = useOutlineStore.getState().nodes
      const newNodes = new Map(nodes)
      newNodes.set('a', { ...newNodes.get('a')!, fields: [field] })
      useOutlineStore.setState({ nodes: newNodes })

      useOutlineStore.getState().updateFieldValue('a', 'field:priority', 'High')

      const updated = useOutlineStore.getState().nodes.get('a')!.fields[0]!
      expect(updated.values[0]!.value).toBe('High')
      expect(updated.required).toBe(true)
      expect(updated.pinned).toBe(true)
    })
  })
})
