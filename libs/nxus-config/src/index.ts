// @nxus/config — Shared configuration system

// Theme types
export type { ThemePalette, ColorMode } from './theme/theme.types'
export type { ThemeOption } from './theme/theme-options'

// Theme store
export { useThemeStore, useThemeHydrated } from './theme/theme.store'

// Theme metadata
export { themeOptions } from './theme/theme-options'

// Theme utilities
export { applyStoredTheme, getThemeScript, ALL_PALETTES } from './theme/theme-apply'

// Theme components
export { ThemeProvider } from './theme/theme-provider'
export { ScrollbarManager } from './theme/scrollbar-manager'
export { ThemeChooser } from './components/theme-chooser'

// Config factory
export { createConfigStore } from './config/create-config-store'
export type { CreateConfigStoreOptions } from './config/config.types'
