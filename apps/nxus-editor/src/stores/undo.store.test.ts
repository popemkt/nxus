import { describe, it, expect, beforeEach } from 'vitest'
import { useUndoStore } from './undo.store'
import type { OutlineNode } from '@/types/outline'

function makeNodeMap(entries: [string, string][]): Map<string, OutlineNode> {
  const map = new Map<string, OutlineNode>()
  for (const [id, content] of entries) {
    map.set(id, {
      id,
      content,
      parentId: null,
      order: '00001000',
      children: [],
      collapsed: false,
      supertags: [],
      fields: [],
    })
  }
  return map
}

describe('undo store', () => {
  beforeEach(() => {
    useUndoStore.setState({ undoStack: [], redoStack: [] })
  })

  it('starts with empty stacks', () => {
    const state = useUndoStore.getState()
    expect(state.canUndo()).toBe(false)
    expect(state.canRedo()).toBe(false)
  })

  it('pushSnapshot adds to undo stack and clears redo stack', () => {
    const snapshot = makeNodeMap([['a', 'Alpha']])
    useUndoStore.getState().pushSnapshot(snapshot)
    expect(useUndoStore.getState().canUndo()).toBe(true)
    expect(useUndoStore.getState().undoStack.length).toBe(1)
  })

  it('undo pops from undo stack and pushes to redo stack', () => {
    const snapshot1 = makeNodeMap([['a', 'Alpha']])
    const snapshot2 = makeNodeMap([['a', 'Beta']])
    useUndoStore.getState().pushSnapshot(snapshot1)
    useUndoStore.getState().pushSnapshot(snapshot2)

    expect(useUndoStore.getState().undoStack.length).toBe(2)

    const result = useUndoStore.getState().undo()
    expect(result).toBeTruthy()
    expect(result!.get('a')?.content).toBe('Beta')
    expect(useUndoStore.getState().undoStack.length).toBe(1)
    expect(useUndoStore.getState().redoStack.length).toBe(1)
    expect(useUndoStore.getState().canRedo()).toBe(true)
  })

  it('redo pops from redo stack and pushes to undo stack', () => {
    const snapshot = makeNodeMap([['a', 'Alpha']])
    useUndoStore.getState().pushSnapshot(snapshot)
    useUndoStore.getState().undo()

    expect(useUndoStore.getState().canRedo()).toBe(true)

    const result = useUndoStore.getState().redo()
    expect(result).toBeTruthy()
    expect(useUndoStore.getState().undoStack.length).toBe(1)
    expect(useUndoStore.getState().redoStack.length).toBe(0)
  })

  it('undo returns null when stack is empty', () => {
    const result = useUndoStore.getState().undo()
    expect(result).toBeNull()
  })

  it('redo returns null when stack is empty', () => {
    const result = useUndoStore.getState().redo()
    expect(result).toBeNull()
  })

  it('pushSnapshot clears redo stack (new action after undo discards redo)', () => {
    const snapshot1 = makeNodeMap([['a', 'V1']])
    const snapshot2 = makeNodeMap([['a', 'V2']])
    const snapshot3 = makeNodeMap([['a', 'V3']])

    useUndoStore.getState().pushSnapshot(snapshot1)
    useUndoStore.getState().pushSnapshot(snapshot2)
    useUndoStore.getState().undo() // redo stack now has 1 entry

    expect(useUndoStore.getState().canRedo()).toBe(true)

    useUndoStore.getState().pushSnapshot(snapshot3) // new action clears redo
    expect(useUndoStore.getState().canRedo()).toBe(false)
    expect(useUndoStore.getState().undoStack.length).toBe(2)
  })

  it('respects MAX_HISTORY limit (50)', () => {
    for (let i = 0; i < 60; i++) {
      useUndoStore.getState().pushSnapshot(makeNodeMap([['a', `V${i}`]]))
    }
    expect(useUndoStore.getState().undoStack.length).toBe(50)
  })

  it('clear resets both stacks', () => {
    useUndoStore.getState().pushSnapshot(makeNodeMap([['a', 'Alpha']]))
    useUndoStore.getState().pushSnapshot(makeNodeMap([['a', 'Beta']]))
    useUndoStore.getState().undo()

    useUndoStore.getState().clear()
    expect(useUndoStore.getState().canUndo()).toBe(false)
    expect(useUndoStore.getState().canRedo()).toBe(false)
  })

  it('snapshots are independent copies', () => {
    const original = makeNodeMap([['a', 'Alpha']])
    useUndoStore.getState().pushSnapshot(original)

    // Mutate the original
    original.set('a', { ...original.get('a')!, content: 'Mutated' })

    // The snapshot should still have the original value
    const snapshot = useUndoStore.getState().undoStack[0]!
    expect(snapshot.get('a')?.content).toBe('Alpha')
  })
})
