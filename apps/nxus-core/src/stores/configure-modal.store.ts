import { create } from 'zustand'

interface ConfigureModalState {
  isOpen: boolean
  appId: string | null
  commandId: string | null
}

interface ConfigureModalActions {
  open: (appId: string, commandId?: string) => void
  close: () => void
}

export const useConfigureModalStore = create<
  ConfigureModalState & ConfigureModalActions
>((set) => ({
  isOpen: false,
  appId: null,
  commandId: null,

  open: (appId, commandId) =>
    set({
      isOpen: true,
      appId,
      commandId: commandId ?? null,
    }),

  close: () =>
    set({
      isOpen: false,
      appId: null,
      commandId: null,
    }),
}))

/**
 * Service for imperative access
 */
export const configureModalService = {
  open: (appId: string, commandId?: string) =>
    useConfigureModalStore.getState().open(appId, commandId),
  close: () => useConfigureModalStore.getState().close(),
}
