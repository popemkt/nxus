import { create } from 'zustand'
import type { App } from '@/types/app'

interface InstallModalState {
  isOpen: boolean
  app: App | null
  defaultPath: string
}

interface InstallModalActions {
  open: (app: App, defaultPath?: string) => void
  close: () => void
}

export const useInstallModalStore = create<
  InstallModalState & InstallModalActions
>((set) => ({
  isOpen: false,
  app: null,
  defaultPath: '',

  open: (app, defaultPath = '') =>
    set({
      isOpen: true,
      app,
      defaultPath,
    }),

  close: () =>
    set({
      isOpen: false,
      app: null,
      defaultPath: '',
    }),
}))

/**
 * Service for imperative access
 */
export const installModalService = {
  open: (app: App, defaultPath?: string) =>
    useInstallModalStore.getState().open(app, defaultPath),
  close: () => useInstallModalStore.getState().close(),
}
