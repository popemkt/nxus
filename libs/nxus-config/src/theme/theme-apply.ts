import type { ThemePalette } from './theme.types'

export const ALL_PALETTES: ThemePalette[] = [
  'default',
  'tokyonight',
  'dracula',
  'nord',
  'catppuccin',
  'retro',
  'github',
  'synthwave',
  'gruvbox',
  'rosepine',
  'everforest',
  'kanagawa',
  'solarized',
  'anime',
  'sketch',
  'celshaded',
  'vaporwave',
  'neon',
  'brutalism',
  'gothic',
  'cyberpunk',
  'bauhaus',
]

/**
 * Module-scope theme application — runs synchronously before React renders.
 * The inline <script> in <head> handles the very first paint; this catches
 * any case where the module loads after the script has already run (e.g. SPA
 * navigation) and keeps classes in sync with localStorage.
 */
export function applyStoredTheme(): void {
  if (typeof window === 'undefined') return
  try {
    const stored = localStorage.getItem('nxus-theme')
    if (!stored) return
    const state = JSON.parse(stored).state
    const colorMode = state?.colorMode || 'dark'
    const palette = state?.palette || 'default'
    const root = document.documentElement

    ALL_PALETTES.forEach((p) => root.classList.remove(p))
    root.classList.remove('dark')

    if (colorMode === 'dark') root.classList.add('dark')
    if (palette !== 'default') root.classList.add(palette)
  } catch {
    /* ignore */
  }
}

/**
 * Returns the inline JS string for FOUC (Flash of Unstyled Content) prevention.
 * Place in <head> as: <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
 */
export function getThemeScript(): string {
  return `
    (function() {
      try {
        var stored = localStorage.getItem('nxus-theme');
        if (stored) {
          var state = JSON.parse(stored).state;
          var colorMode = state.colorMode || 'dark';
          var palette = state.palette || 'default';

          if (colorMode === 'dark') {
            document.documentElement.classList.add('dark');
          }
          if (palette !== 'default') {
            document.documentElement.classList.add(palette);
          }
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    })();
  `
}
