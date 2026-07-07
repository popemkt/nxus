import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePalette =
  | 'default'
  | 'tokyonight'
  | 'dracula'
  | 'nord'
  | 'catppuccin'
  | 'retro'
  | 'github'
  | 'synthwave'
  | 'gruvbox'
  | 'rosepine'
  | 'everforest'
  | 'kanagawa'
  | 'solarized'
  | 'anime'
  | 'sketch'
  | 'celshaded'
  | 'vaporwave'
  | 'neon'
  | 'brutalism'
  | 'gothic'
  | 'cyberpunk'
  | 'bauhaus';

export type ColorMode = 'light' | 'dark';

interface PersistedThemeState {
  state?: {
    colorMode?: string;
    palette?: string;
  };
}

interface ThemeState {
  palette: ThemePalette;
  colorMode: ColorMode;
  setPalette: (palette: ThemePalette) => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
}

interface ThemeProviderProps {
  palettes?: readonly string[];
  palette?: string;
  colorMode?: ColorMode;
  hydrated?: boolean;
  scrollFallback?: 'none' | 'documentElement';
}

const THEME_STORAGE_KEY = 'nxus-theme';
const HIDE_SCROLLBAR_DELAY_MS = 1000;

export const STANDARD_THEME_PALETTES = [
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
] as const satisfies readonly ThemePalette[];

export const ALL_THEME_PALETTES = [
  ...STANDARD_THEME_PALETTES,
  'gothic',
  'cyberpunk',
  'bauhaus',
] as const satisfies readonly ThemePalette[];

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      palette: 'default',
      colorMode: 'dark',
      setPalette: (palette) => set({ palette }),
      setColorMode: (colorMode) => set({ colorMode }),
      toggleColorMode: () =>
        set((state) => ({
          colorMode: state.colorMode === 'dark' ? 'light' : 'dark',
        })),
    }),
    {
      name: THEME_STORAGE_KEY,
    },
  ),
);

export function useThemeHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => {
    return useTheme.persist?.hasHydrated?.() ?? false;
  });

  useEffect(() => {
    if (!hydrated) {
      return useTheme.persist?.onFinishHydration?.(() => setHydrated(true));
    }

    return undefined;
  }, [hydrated]);

  return hydrated;
}

export function applyStoredTheme(
  palettes: readonly string[] = STANDARD_THEME_PALETTES,
): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) return;

    const state = parseStoredTheme(stored).state;
    const colorMode = state?.colorMode || 'dark';
    const palette = state?.palette || 'default';

    applyThemeClasses({
      palettes,
      colorMode,
      palette,
    });
  } catch {
    // Preserve the previous app-local behavior: malformed storage is ignored.
  }
}

export function getThemeHeadScript(): string {
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
            `;
}

export function ThemeProvider({
  palettes = STANDARD_THEME_PALETTES,
  palette,
  colorMode,
  hydrated,
  scrollFallback = 'none',
}: ThemeProviderProps) {
  const isControlled = palette !== undefined || colorMode !== undefined;

  useEffect(() => {
    if (isControlled) {
      if (hydrated === false) return;

      applyThemeClasses({
        palettes,
        colorMode: colorMode || 'dark',
        palette: palette || 'default',
      });
      return;
    }

    applyStoredTheme(palettes);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyStoredTheme(palettes);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [colorMode, hydrated, isControlled, palette, palettes]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const handleScroll = (event: Event) => {
      const element = getScrollElement(event.target, scrollFallback);
      if (!element) return;

      element.setAttribute('data-scrolling', 'true');

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        element.removeAttribute('data-scrolling');
      }, HIDE_SCROLLBAR_DELAY_MS);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(timeout);
    };
  }, [scrollFallback]);

  return null;
}

function parseStoredTheme(stored: string): PersistedThemeState {
  const parsed: unknown = JSON.parse(stored);

  if (!isObject(parsed)) return {};
  const state = parsed.state;
  if (!isObject(state)) return {};

  return {
    state: {
      colorMode:
        typeof state.colorMode === 'string' ? state.colorMode : undefined,
      palette: typeof state.palette === 'string' ? state.palette : 'default',
    },
  };
}

function applyThemeClasses({
  palettes,
  colorMode,
  palette,
}: {
  palettes: readonly string[];
  colorMode: string;
  palette: string;
}) {
  const root = document.documentElement;

  palettes.forEach((themePalette) => root.classList.remove(themePalette));
  root.classList.remove('dark');

  if (colorMode === 'dark') root.classList.add('dark');
  if (palette !== 'default') root.classList.add(palette);
}

function getScrollElement(
  target: EventTarget | null,
  fallback: 'none' | 'documentElement',
): HTMLElement | null {
  if (target instanceof Document) return target.documentElement;
  if (target instanceof HTMLElement) return target;
  if (target && fallback === 'documentElement') return document.documentElement;
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
