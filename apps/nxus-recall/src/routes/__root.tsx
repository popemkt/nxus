import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import appCss from '../styles.css?url'
import { queryClient } from '@/lib/query-client'
import { applyStoredTheme, getThemeScript, ThemeProvider, ScrollbarManager } from '@nxus/config'

applyStoredTheme()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'nXus Recall' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
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
