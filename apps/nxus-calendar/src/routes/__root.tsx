import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, applyStoredTheme, getThemeHeadScript } from '@nxus/ui/theme';
import appCss from '../styles.css?url';
import { queryClient } from '@/lib/query-client';

applyStoredTheme();

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'nXus Calendar' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
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
          <ThemeProvider scrollFallback="documentElement" />
          {children}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
