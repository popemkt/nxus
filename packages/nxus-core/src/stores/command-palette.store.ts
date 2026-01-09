import { create } from 'zustand'

/**
 * Represents a command in the action panel context
 */
export interface ActionPanelCommand {
  id: string
  name: string
  appId: string
  appName: string
  mode: string
  command: string
}

interface CommandPaletteState {
  isOpen: boolean
  /** Whether the palette was opened from gallery view (for morph animation) */
  isFromGallery: boolean
  step: 'command' | 'target' | 'actions'
  query: string
  selectedGenericCommand: {
    id: string
    name: string
    needsTarget?: 'app' | 'instance' | false
  } | null
  /** Command currently showing in action panel */
  actionPanelCommand: ActionPanelCommand | null
}

interface CommandPaletteActions {
  open: (fromGallery?: boolean) => void
  close: () => void
  toggle: (fromGallery?: boolean) => void
  setQuery: (query: string) => void
  selectGenericCommand: (
    cmd: CommandPaletteState['selectedGenericCommand'],
  ) => void
  /** Open action panel for a command */
  openActions: (cmd: ActionPanelCommand) => void
  /** Close action panel and return to command list */
  closeActions: () => void
  reset: () => void
}

export const useCommandPaletteStore = create<
  CommandPaletteState & CommandPaletteActions
>((set) => ({
  isOpen: false,
  isFromGallery: false,
  step: 'command',
  query: '',
  selectedGenericCommand: null,
  actionPanelCommand: null,

  open: (fromGallery = false) =>
    set({
      isOpen: true,
      isFromGallery: fromGallery,
      step: 'command',
      query: '',
      selectedGenericCommand: null,
      actionPanelCommand: null,
    }),
  close: () => set({ isOpen: false }),
  toggle: (fromGallery = false) =>
    set((state) => ({
      isOpen: !state.isOpen,
      isFromGallery: !state.isOpen ? fromGallery : state.isFromGallery,
      step: 'command',
      query: '',
      selectedGenericCommand: null,
      actionPanelCommand: null,
    })),
  setQuery: (query) => set({ query }),
  selectGenericCommand: (cmd) =>
    set({ selectedGenericCommand: cmd, step: 'target', query: '' }),
  openActions: (cmd) => set({ actionPanelCommand: cmd, step: 'actions' }),
  closeActions: () => set({ actionPanelCommand: null, step: 'command' }),
  reset: () =>
    set({
      step: 'command',
      query: '',
      selectedGenericCommand: null,
      actionPanelCommand: null,
    }),
}))
