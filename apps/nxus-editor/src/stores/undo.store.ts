import { create } from 'zustand'
import type { NodeMap } from '@/types/outline'

const MAX_HISTORY = 50

interface UndoState {
  undoStack: NodeMap[]
  redoStack: NodeMap[]
  pushSnapshot: (nodes: NodeMap) => void
  /** Pop the last undo snapshot and atomically push currentNodes onto the redo stack. */
  undo: (currentNodes: NodeMap) => NodeMap | null
  /** Pop the last redo snapshot and atomically push currentNodes onto the undo stack. */
  redo: (currentNodes: NodeMap) => NodeMap | null
  canUndo: () => boolean
  canRedo: () => boolean
  clear: () => void
}

// Outline store creates new Map + spread operator for mutations, so shallow
// copies in undo snapshots are safe — nodes are never mutated in place.
export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: (nodes) => {
    set((state) => {
      const stack = [...state.undoStack, new Map(nodes)]
      if (stack.length > MAX_HISTORY) stack.shift()
      return { undoStack: stack, redoStack: [] }
    })
  },

  undo: (currentNodes) => {
    const { undoStack } = get()
    if (undoStack.length === 0) return null
    const snapshot = undoStack[undoStack.length - 1]!
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, new Map(currentNodes)],
    }))
    return snapshot
  },

  redo: (currentNodes) => {
    const { redoStack } = get()
    if (redoStack.length === 0) return null
    const snapshot = redoStack[redoStack.length - 1]!
    set((state) => ({
      undoStack: [...state.undoStack, new Map(currentNodes)],
      redoStack: state.redoStack.slice(0, -1),
    }))
    return snapshot
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  clear: () => set({ undoStack: [], redoStack: [] }),
}))
