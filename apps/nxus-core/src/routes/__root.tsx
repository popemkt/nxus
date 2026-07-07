import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  ALL_THEME_PALETTES,
  ThemeProvider,
  applyStoredTheme,
  getThemeHeadScript,
  useTheme,
  useThemeHydrated,
} from '@nxus/ui/theme'
import appCss from '../styles.css?url'
import { useSystemInfo } from '@/hooks/use-system-info'
import { CommandPalette } from '@/components/features/command-palette/command-palette'
import { TerminalPanel } from '@/components/features/terminal/terminal-panel'
import { ConfigureModal } from '@/components/features/app-detail/modals/configure-modal'
import { InboxModal } from '@/components/features/inbox/inbox-modal'
import { GlobalCommandParamsModal } from '@/components/features/command-params/global-command-params-modal'

import { queryClient } from '@/lib/query-client'

applyStoredTheme(ALL_THEME_PALETTES)

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
  // Use the global singleton instance (stable across re-renders)
  const palette = useTheme((s) => s.palette)
  const colorMode = useTheme((s) => s.colorMode)
  const hydrated = useThemeHydrated()

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: getThemeHeadScript(),
          }}
        />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <SystemInfoLoader />
          <ThemeProvider
            palettes={ALL_THEME_PALETTES}
            palette={palette}
            colorMode={colorMode}
            hydrated={hydrated}
          />
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
