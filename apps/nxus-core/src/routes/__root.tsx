import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import appCss from '../styles.css?url'
import { useSystemInfo } from '@/hooks/use-system-info'
import { applyStoredTheme, getThemeScript, ThemeProvider, ScrollbarManager } from '@nxus/config'
import { CommandPalette } from '@/components/features/command-palette/command-palette'
import { TerminalPanel } from '@/components/features/terminal/terminal-panel'
import { ConfigureModal } from '@/components/features/app-detail/modals/configure-modal'
import { InboxModal } from '@/components/features/inbox/inbox-modal'
import { GlobalCommandParamsModal } from '@/components/features/command-params/global-command-params-modal'

import { queryClient } from '@/lib/query-client'

// Module-scope theme application — runs synchronously before React renders.
applyStoredTheme()

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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
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
