import { HeadContent, Scripts, createRootRoute, ErrorComponentProps } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import appCss from '../styles.css?url'
import { useSystemInfo } from '@/hooks/use-system-info'
import { useThemeStore } from '@/stores/theme.store'
import { themeOptions } from '@/config/theme-options'
import { CommandPalette } from '@/components/features/command-palette/command-palette'
import { TerminalPanel } from '@/components/features/terminal/terminal-panel'
import { ConfigureModal } from '@/components/features/app-detail/modals/configure-modal'
import { InboxModal } from '@/components/features/inbox/inbox-modal'
import { GlobalCommandParamsModal } from '@/components/features/command-params/global-command-params-modal'


import { queryClient } from '@/lib/query-client'

function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
      {import.meta.env.DEV && (
        <pre style={{ whiteSpace: 'pre-wrap', color: '#ef4444', marginBottom: '1rem' }}>
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          borderRadius: '0.375rem',
          border: '1px solid #d1d5db',
          background: '#f9fafb',
        }}
      >
        Reload
      </button>
    </div>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  errorComponent: RootErrorComponent,
  shellComponent: RootDocument,
})

/**
 * System info loader component - fetches OS/dev info on mount
 */
function SystemInfoLoader() {
  // This hook fetches and persists system info via React Query
  useSystemInfo()
  return null
}

/**
 * Theme provider - applies theme palette and color mode classes to html element
 */
function ThemeProvider() {
  const palette = useThemeStore((s) => s.palette)
  const colorMode = useThemeStore((s) => s.colorMode)

  useEffect(() => {
    const root = document.documentElement

    // Remove all palette classes
    themeOptions.forEach((t) => root.classList.remove(t.value))
    root.classList.remove('dark')

    // Apply color mode
    if (colorMode === 'dark') {
      root.classList.add('dark')
    }

    // Apply palette class (except for 'default' which uses base styles)
    if (palette !== 'default') {
      root.classList.add(palette)
    }
  }, [palette, colorMode])

  return null
}

/**
 * Manages scrollbar visibility by adding/removing data-scrolling attribute
 */
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
      }, 1000) // Hide after 1 second of inactivity
    }

    // Use capture to catch scroll events from all elements
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      clearTimeout(timeout)
    }
  }, [])

  return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
  // Use the global singleton instance (stable across re-renders)

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
          <SystemInfoLoader />
          <ThemeProvider />
          <ScrollbarManager />
          {children}
          <CommandPalette />
          <TerminalPanel />
          <ConfigureModal />
          <InboxModal />
          <GlobalCommandParamsModal />
        </QueryClientProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
