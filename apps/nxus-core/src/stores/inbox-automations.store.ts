import { create } from 'zustand'
import type { AutomationTemplate } from '@/services/inbox/inbox-reactive.server'

interface InboxAutomationsState {
  isModalOpen: boolean
  selectedTemplate: AutomationTemplate | null
}

interface InboxAutomationsActions {
  openModal: () => void
  closeModal: () => void
  setTemplate: (template: AutomationTemplate | null) => void
}

export const useInboxAutomationsStore = create<
  InboxAutomationsState & InboxAutomationsActions
>((set) => ({
  isModalOpen: false,
  selectedTemplate: null,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false, selectedTemplate: null }),
  setTemplate: (template) => set({ selectedTemplate: template }),
}))

/**
 * Service for imperative access
 */
export const inboxAutomationsService = {
  openModal: () => useInboxAutomationsStore.getState().openModal(),
  closeModal: () => useInboxAutomationsStore.getState().closeModal(),
  setTemplate: (template: AutomationTemplate | null) =>
    useInboxAutomationsStore.getState().setTemplate(template),
}
