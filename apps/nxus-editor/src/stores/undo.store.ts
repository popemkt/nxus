import { create } from 'zustand'
import type { NodeMap } from '@/types/outline'

const MAX_HISTORY = 50

interface UndoState {
  undoStack: NodeMap[]
  redoStack: NodeMap[]
  pushSnapshot: (nodes: NodeMap) => void
  undo: () => NodeMap | null
  redo: () => NodeMap | null
  canUndo: () => boolean
  canRedo: () => boolean
  clear: () => void
}

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

  undo: () => {
    const { undoStack, redoStack } = get()
    if (undoStack.length === 0) return null
    const snapshot = undoStack[undoStack.length - 1]!
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, snapshot],
    })
    return snapshot
  },

  redo: () => {
    const { undoStack, redoStack } = get()
    if (redoStack.length === 0) return null
    const snapshot = redoStack[redoStack.length - 1]!
    set({
      undoStack: [...undoStack, snapshot],
      redoStack: redoStack.slice(0, -1),
    })
    return snapshot
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  clear: () => set({ undoStack: [], redoStack: [] }),
}))
