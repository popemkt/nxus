import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSystemInfo } from '@/hooks/use-system-info'
import { useThemeStore } from '@/stores/theme.store'
import { themeOptions } from '@/config/theme-options'
import { CommandPalette } from '@/components/features/command-palette/command-palette'
import { TerminalPanel } from '@/components/features/terminal/terminal-panel'
import { ConfigureModal } from '@/components/features/app-detail/modals/configure-modal'
import { InboxModal } from '@/components/features/inbox/inbox-modal'

import appCss from '../styles.css?url'

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
 * Theme provider - applies theme class to html element
 */
function ThemeProvider() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement

    // Remove all theme classes
    themeOptions.forEach((t) => root.classList.remove(t.value))
    root.classList.remove('dark')

    // Get theme option to check if dark
    const themeOption = themeOptions.find((t) => t.value === theme)

    // Add dark class for dark themes
    if (themeOption?.isDark) {
      root.classList.add('dark')
    }

    // Add specific theme class (except for base 'dark' and 'light')
    if (theme !== 'dark' && theme !== 'light') {
      root.classList.add(theme)
    }
  }, [theme])

  return null
}

import { queryClient } from '@/lib/query-client'

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
                  var storedTheme = localStorage.getItem('theme');
                  var theme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
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
          {children}
          <CommandPalette />
          <TerminalPanel />
          <ConfigureModal />
          <InboxModal />
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
