import { create } from 'zustand'
import type { LogEntry } from '@/services/shell/command.schema'

export interface TerminalTab {
  id: string
  label: string
  logs: LogEntry[]
  status: 'running' | 'success' | 'error' | 'idle'
  createdAt: number
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  isOpen: boolean
  isMinimized: boolean
}

interface TerminalActions {
  // Tab management
  createTab: (label: string) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void

  // Log management
  addLog: (tabId: string, log: LogEntry) => void
  clearLogs: (tabId: string) => void
  setStatus: (tabId: string, status: TerminalTab['status']) => void

  // Panel visibility
  open: () => void
  close: () => void
  toggle: () => void
  minimize: () => void
  maximize: () => void
}

export const useTerminalStore = create<TerminalState & TerminalActions>(
  (set) => ({
    tabs: [],
    activeTabId: null,
    isOpen: false,
    isMinimized: false,

    createTab: (label) => {
      const id = `terminal-${Date.now()}`
      const tab: TerminalTab = {
        id,
        label,
        logs: [],
        status: 'idle',
        createdAt: Date.now(),
      }

      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: id,
        isOpen: true,
        isMinimized: false,
      }))

      return id
    },

    closeTab: (id) => {
      set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        const newActiveId =
          state.activeTabId === id
            ? (newTabs[newTabs.length - 1]?.id ?? null)
            : state.activeTabId

        return {
          tabs: newTabs,
          activeTabId: newActiveId,
          isOpen: newTabs.length > 0,
        }
      })
    },

    setActiveTab: (id) => {
      set({ activeTabId: id, isMinimized: false })
    },

    addLog: (tabId, log) => {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, logs: [...t.logs, log] } : t,
        ),
      }))
    },

    clearLogs: (tabId) => {
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, logs: [] } : t)),
      }))
    },

    setStatus: (tabId, status) => {
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, status } : t)),
      }))
    },

    open: () => set({ isOpen: true, isMinimized: false }),
    close: () => set({ isOpen: false }),
    toggle: () =>
      set((state) => ({
        isOpen: !state.isOpen,
        isMinimized: false,
      })),
    minimize: () => set({ isMinimized: true }),
    maximize: () => set({ isMinimized: false }),
  }),
)

/**
 * Hook to run a command in the terminal panel
 * Returns a function that creates a tab and executes the command
 */
export function useTerminalCommand() {
  const { createTab, addLog, setStatus } = useTerminalStore()

  const runCommand = async (
    label: string,
    executeCommand: () => Promise<{ success: boolean; error?: string }>,
  ) => {
    const tabId = createTab(label)
    setStatus(tabId, 'running')

    addLog(tabId, {
      timestamp: Date.now(),
      type: 'info',
      message: `Starting: ${label}\n`,
    })

    try {
      const result = await executeCommand()

      if (result.success) {
        setStatus(tabId, 'success')
        addLog(tabId, {
          timestamp: Date.now(),
          type: 'success',
          message: '\n✓ Completed successfully\n',
        })
      } else {
        setStatus(tabId, 'error')
        addLog(tabId, {
          timestamp: Date.now(),
          type: 'error',
          message: `\n✗ ${result.error ?? 'Failed'}\n`,
        })
      }
    } catch (error) {
      setStatus(tabId, 'error')
      addLog(tabId, {
        timestamp: Date.now(),
        type: 'error',
        message: `\n✗ ${error instanceof Error ? error.message : 'Unknown error'}\n`,
      })
    }

    return tabId
  }

  return { runCommand }
}
