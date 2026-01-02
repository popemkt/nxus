import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeSetting = 'light' | 'dark' | 'system'

export interface KeybindingSettings {
  commandPalette: string
}

export interface GeneralSettings {
  theme: ThemeSetting
  defaultInstallPath: string
}

interface SettingsState {
  general: GeneralSettings
  keybindings: KeybindingSettings
}

interface SettingsActions {
  setTheme: (theme: ThemeSetting) => void
  setDefaultInstallPath: (path: string) => void
  setKeybinding: (key: keyof KeybindingSettings, value: string) => void
  resetToDefaults: () => void
}

const defaultSettings: SettingsState = {
  general: {
    theme: 'system',
    defaultInstallPath: '~/Projects',
  },
  keybindings: {
    commandPalette: 'Ctrl+Shift+P',
  },
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setTheme: (theme) =>
        set((state) => ({
          general: { ...state.general, theme },
        })),

      setDefaultInstallPath: (path) =>
        set((state) => ({
          general: { ...state.general, defaultInstallPath: path },
        })),

      setKeybinding: (key, value) =>
        set((state) => ({
          keybindings: { ...state.keybindings, [key]: value },
        })),

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'nxus-settings',
      version: 1,
    },
  ),
)

/**
 * Helper to parse a keybinding string into modifier keys
 */
export function parseKeybinding(binding: string): {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string
} {
  const parts = binding.split('+').map((p) => p.trim().toLowerCase())
  const key = parts[parts.length - 1].toUpperCase()

  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd'),
    key,
  }
}

/**
 * Check if a keyboard event matches a keybinding
 */
export function matchesKeybinding(
  event: KeyboardEvent,
  binding: string,
): boolean {
  const parsed = parseKeybinding(binding)

  return (
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    event.metaKey === parsed.meta &&
    event.key.toUpperCase() === parsed.key
  )
}

/**
 * Service for imperative access
 */
export const settingsService = {
  getTheme: () => useSettingsStore.getState().general.theme,
  getKeybinding: (key: keyof KeybindingSettings) =>
    useSettingsStore.getState().keybindings[key],
  setTheme: (theme: ThemeSetting) =>
    useSettingsStore.getState().setTheme(theme),
  setKeybinding: (key: keyof KeybindingSettings, value: string) =>
    useSettingsStore.getState().setKeybinding(key, value),
}
