import { create } from 'zustand'

interface CommandPaletteState {
  isOpen: boolean
  step: 'command' | 'target'
  query: string
  selectedGenericCommand: {
    id: string
    name: string
    needsTarget?: 'app' | 'instance' | false
  } | null
}

interface CommandPaletteActions {
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
  selectGenericCommand: (
    cmd: CommandPaletteState['selectedGenericCommand'],
  ) => void
  reset: () => void
}

export const useCommandPaletteStore = create<
  CommandPaletteState & CommandPaletteActions
>((set) => ({
  isOpen: false,
  step: 'command',
  query: '',
  selectedGenericCommand: null,

  open: () =>
    set({
      isOpen: true,
      step: 'command',
      query: '',
      selectedGenericCommand: null,
    }),
  close: () => set({ isOpen: false }),
  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      step: 'command',
      query: '',
      selectedGenericCommand: null,
    })),
  setQuery: (query) => set({ query }),
  selectGenericCommand: (cmd) =>
    set({ selectedGenericCommand: cmd, step: 'target', query: '' }),
  reset: () =>
    set({ step: 'command', query: '', selectedGenericCommand: null }),
}))
