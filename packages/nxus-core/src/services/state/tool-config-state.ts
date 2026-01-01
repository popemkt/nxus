import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Configuration value for a tool
 */
export interface ToolConfigValue {
  [key: string]: string
}

/**
 * State for tool configuration values
 * NEVER cleared on refresh - only updated by user
 */
interface ToolConfigState {
  configs: Record<string, ToolConfigValue>
  lastModified: Record<string, number>
  actions: {
    setConfig: (toolId: string, key: string, value: string) => void
    setConfigs: (toolId: string, values: ToolConfigValue) => void
    getConfig: (toolId: string, key: string) => string | undefined
    clearConfig: (toolId: string, key: string) => void
    clearAllToolConfigs: (toolId: string) => void
  }
}

/**
 * Store for tool configuration values
 * Persisted to localStorage - NEVER cleared by refresh
 */
export const useToolConfigStore = create<ToolConfigState>()(
  persist(
    (set, get) => ({
      configs: {},
      lastModified: {},
      actions: {
        setConfig: (toolId, key, value) =>
          set((state) => ({
            configs: {
              ...state.configs,
              [toolId]: {
                ...(state.configs[toolId] || {}),
                [key]: value,
              },
            },
            lastModified: {
              ...state.lastModified,
              [toolId]: Date.now(),
            },
          })),
        setConfigs: (toolId, values) =>
          set((state) => ({
            configs: {
              ...state.configs,
              [toolId]: {
                ...(state.configs[toolId] || {}),
                ...values,
              },
            },
            lastModified: {
              ...state.lastModified,
              [toolId]: Date.now(),
            },
          })),
        getConfig: (toolId, key) => {
          return get().configs[toolId]?.[key]
        },
        clearConfig: (toolId, key) =>
          set((state) => {
            const toolConfig = { ...(state.configs[toolId] || {}) }
            delete toolConfig[key]
            return {
              configs: {
                ...state.configs,
                [toolId]: toolConfig,
              },
              lastModified: {
                ...state.lastModified,
                [toolId]: Date.now(),
              },
            }
          }),
        clearAllToolConfigs: (toolId) =>
          set((state) => {
            const { [toolId]: _, ...configs } = state.configs
            const { [toolId]: __, ...lastModified } = state.lastModified
            return { configs, lastModified }
          }),
      },
    }),
    {
      name: 'tool-config-storage',
      partialize: (state) => ({
        configs: state.configs,
        lastModified: state.lastModified,
      }),
    },
  ),
)

/**
 * Hook to get config for a tool
 */
export const useToolConfig = (toolId: string) => {
  const config = useToolConfigStore((state) => state.configs[toolId])
  const lastModified = useToolConfigStore((state) => state.lastModified[toolId])

  return {
    config: config || {},
    lastModified,
  }
}

/**
 * Check if a tool is configured (has required fields set)
 */
export const useToolConfigured = (
  toolId: string,
  requiredFields: string[],
): boolean => {
  const { config } = useToolConfig(toolId)

  if (requiredFields.length === 0) return true

  return requiredFields.every((field) => {
    const value = config[field]
    return value !== undefined && value !== ''
  })
}

/**
 * Service object for imperative actions
 */
export const toolConfigService = {
  setConfig: (toolId: string, key: string, value: string) => {
    useToolConfigStore.getState().actions.setConfig(toolId, key, value)
  },
  setConfigs: (toolId: string, values: ToolConfigValue) => {
    useToolConfigStore.getState().actions.setConfigs(toolId, values)
  },
  getConfig: (toolId: string, key: string): string | undefined => {
    return useToolConfigStore.getState().configs[toolId]?.[key]
  },
  getConfigs: (toolId: string): ToolConfigValue => {
    return useToolConfigStore.getState().configs[toolId] || {}
  },
  isConfigured: (toolId: string, requiredFields: string[]): boolean => {
    const config = useToolConfigStore.getState().configs[toolId] || {}
    if (requiredFields.length === 0) return true
    return requiredFields.every((field) => {
      const value = config[field]
      return value !== undefined && value !== ''
    })
  },
  clearConfig: (toolId: string, key: string) => {
    useToolConfigStore.getState().actions.clearConfig(toolId, key)
  },
  clearAllToolConfigs: (toolId: string) => {
    useToolConfigStore.getState().actions.clearAllToolConfigs(toolId)
  },
}
