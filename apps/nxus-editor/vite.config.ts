import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { tsImport } from 'tsx/esm/api'

function nxusMcpEndpoint(): Plugin {
  return {
    name: 'nxus-mcp-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (url !== '/editor/mcp' && url !== '/mcp') {
          next()
          return
        }

        try {
          const { handleNxusMcpHttpRequest } = await tsImport('@nxus/mcp/http', {
            parentURL: import.meta.url,
          })
          await handleNxusMcpHttpRequest(req, res)
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
          }
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }))
        }
      })
    },
  }
}

const config = defineConfig({
  base: '/editor/',
  plugins: [
    nxusMcpEndpoint(),
    tanstackStart(),
    nitro(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    viteReact(),
  ],
  server: {
    // e2e runs set NXUS_E2E: the error overlay intercepts pointer events and
    // turns any transient dev-server hiccup into unrelated test failures.
    hmr: process.env.NXUS_E2E ? { overlay: false } : undefined,
    watch: {
      ignored: [
        '**/packages/repos/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/.turbo/**',
        '**/dist/**',
        '**/build/**',
      ],
    },
  },
  optimizeDeps: {
    exclude: [
      'better-sqlite3',
      'drizzle-orm/better-sqlite3',
      '@nxus/db',
    ],
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
  ssr: {
    noExternal: ['@nxus/db'],
  },
})

export default config
