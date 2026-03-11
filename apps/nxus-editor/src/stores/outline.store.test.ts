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
})
