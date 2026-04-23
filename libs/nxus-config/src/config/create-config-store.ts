import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CreateConfigStoreOptions } from './config.types'

type ConfigActions<T> = {
  /** Partially update config values */
  update: (partial: Partial<T>) => void
  /** Reset all values to defaults */
  resetToDefaults: () => void
}

/**
 * Factory for creating standardized Zustand config stores with localStorage persistence.
 *
 * @example
 * ```ts
 * export const useRecallConfigStore = createConfigStore({
 *   name: 'nxus-recall-config',
 *   defaults: { cardsPerSession: 20, showHints: true },
 * })
 *
 * // Usage:
 * const cards = useRecallConfigStore((s) => s.cardsPerSession)
 * const update = useRecallConfigStore((s) => s.update)
 * update({ cardsPerSession: 30 })
 * ```
 */
export function createConfigStore<T extends Record<string, unknown>>(
  options: CreateConfigStoreOptions<T>,
) {
  return create<T & ConfigActions<T>>()(
    persist(
      (set) => ({
        ...options.defaults,
        update: (partial) => set((state) => ({ ...state, ...partial })),
        resetToDefaults: () =>
          set(() => ({ ...options.defaults }) as T & ConfigActions<T>),
      }),
      {
        name: options.name,
        version: options.version ?? 1,
      },
    ),
  )
}
