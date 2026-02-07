import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { request as httpRequest } from 'node:http'
import { connect as netConnect } from 'node:net'

/**
 * Vite plugin that proxies /core and /workbench requests to the respective
 * mini-app dev servers. Uses configureServer to register middleware before
 * TanStack Start / Nitro SSR, so HTML page requests are proxied correctly.
 */
function miniAppProxy(): Plugin {
  const routes: Record<string, { target: string; port: number }> = {
    '/core': { target: 'localhost', port: 3000 },
    '/workbench': { target: 'localhost', port: 3002 },
  }

  return {
    name: 'mini-app-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        const match = Object.entries(routes).find(([prefix]) =>
          url.startsWith(prefix)
        )

        if (!match) return next()

        const [, { target, port }] = match
        const proxyReq = httpRequest(
          {
            hostname: target,
            port,
            path: url,
            method: req.method,
            headers: { ...req.headers, host: `${target}:${port}` },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers)
            proxyRes.pipe(res, { end: true })
          },
        )

        proxyReq.on('error', () => {
          // Upstream app not running yet — let the gateway handle it
          next()
        })

        req.pipe(proxyReq, { end: true })
      })

      // WebSocket proxying for HMR
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = req.url || ''
        const match = Object.entries(routes).find(([prefix]) =>
          url.startsWith(prefix)
        )
        if (!match) return

        const [, { target, port }] = match
        const upstream = netConnect(port, target, () => {
          upstream.write(
            `${req.method} ${url} HTTP/${req.httpVersion}\r\n` +
              Object.entries(req.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n') +
              '\r\n\r\n',
          )
          if (head.length) upstream.write(head)
          socket.pipe(upstream).pipe(socket)
        })
        upstream.on('error', () => socket.destroy())
        socket.on('error', () => upstream.destroy())
      })
    },
  }
}

const config = defineConfig({
  plugins: [
    miniAppProxy(),
    tanstackStart(),
    nitro(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    viteReact(),
  ],
  server: {
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
})

export default config
