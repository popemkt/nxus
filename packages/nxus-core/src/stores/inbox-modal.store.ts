import { create } from 'zustand'

interface InboxModalState {
  isOpen: boolean
}

interface InboxModalActions {
  open: () => void
  close: () => void
}

export const useInboxModalStore = create<InboxModalState & InboxModalActions>(
  (set) => ({
    isOpen: false,

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
  }),
)

/**
 * Service for imperative access
 */
export const inboxModalService = {
  open: () => useInboxModalStore.getState().open(),
  close: () => useInboxModalStore.getState().close(),
}
