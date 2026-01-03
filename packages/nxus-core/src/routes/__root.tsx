import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { useSystemInfo } from '@/hooks/use-system-info'
import { CommandPalette } from '@/components/command-palette'
import { TerminalPanel } from '@/components/terminal-panel'
import { ConfigureModal } from '@/components/configure-modal'
import { InboxModal } from '@/components/inbox-modal'

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
