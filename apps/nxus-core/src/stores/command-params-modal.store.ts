import { create } from 'zustand'
import type { CommandRequirement, CommandParam } from '@nxus/db'

interface RequirementResult {
  appId: string
  value: Record<string, unknown>
}

interface CommandParamsModalState {
  isOpen: boolean
  title: string
  description?: string
  requirements: CommandRequirement[]
  params: CommandParam[]
  onComplete:
    | ((result: {
        requirements: Record<string, RequirementResult>
        params: Record<string, string | number | boolean>
      }) => void)
    | null
}

interface CommandParamsModalActions {
  open: (config: {
    title: string
    description?: string
    requirements?: CommandRequirement[]
    params?: CommandParam[]
    onComplete: (result: {
      requirements: Record<string, RequirementResult>
      params: Record<string, string | number | boolean>
    }) => void
  }) => void
  close: () => void
}

export const useCommandParamsModalStore = create<
  CommandParamsModalState & CommandParamsModalActions
>((set) => ({
  isOpen: false,
  title: '',
  description: undefined,
  requirements: [],
  params: [],
  onComplete: null,

  open: ({ title, description, requirements = [], params = [], onComplete }) =>
    set({
      isOpen: true,
      title,
      description,
      requirements,
      params,
      onComplete,
    }),

  close: () =>
    set({
      isOpen: false,
      title: '',
      description: undefined,
      requirements: [],
      params: [],
      onComplete: null,
    }),
}))

/**
 * Service for opening the command params modal imperatively
 */
export const commandParamsModalService = {
  open: (config: Parameters<CommandParamsModalActions['open']>[0]) => {
    useCommandParamsModalStore.getState().open(config)
  },
  close: () => {
    useCommandParamsModalStore.getState().close()
  },
}
