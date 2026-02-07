import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import appCss from '../styles.css?url'
import { queryClient } from '@/lib/query-client'

type ThemePalette =
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

const ALL_PALETTES: ThemePalette[] = [
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
]

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'nXus Gateway' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function ThemeProvider() {
  useEffect(() => {
    const applyTheme = () => {
      try {
        const stored = localStorage.getItem('nxus-theme')
        if (!stored) return

        const state = JSON.parse(stored).state
        const colorMode = state?.colorMode || 'dark'
        const palette = state?.palette || 'default'
        const root = document.documentElement

        ALL_PALETTES.forEach((p) => root.classList.remove(p))
        root.classList.remove('dark')

        if (colorMode === 'dark') {
          root.classList.add('dark')
        }

        if (palette !== 'default') {
          root.classList.add(palette)
        }
      } catch {
        // ignore parse errors
      }
    }

    applyTheme()

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'nxus-theme') applyTheme()
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return null
}

function ScrollbarManager() {
  useEffect(() => {
    let timeout: NodeJS.Timeout

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      if (!target || !target.setAttribute) return

      const element = target === document ? document.documentElement : target

      element.setAttribute('data-scrolling', 'true')

      clearTimeout(timeout)
      timeout = setTimeout(() => {
        element.removeAttribute('data-scrolling')
      }, 1000)
    }

    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      clearTimeout(timeout)
    }
  }, [])

  return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
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
            `,
          }}
        />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider />
          <ScrollbarManager />
          {children}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
