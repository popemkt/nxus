import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { request as httpRequest } from 'node:http'
import { connect as netConnect } from 'node:net'

/** Headers safe to forward to upstream mini-app servers */
const FORWARDED_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'authorization',
  'cache-control',
  'content-length',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'origin',
  'referer',
  'user-agent',
])

/** Strip CR/LF characters to prevent header injection */
function sanitizeHeaderValue(value: string | string[] | undefined): string {
  if (value === undefined) return ''
  const str = Array.isArray(value) ? value.join(', ') : value
  return str.replace(/[\r\n]/g, '')
}

/** Strip CR/LF from URL to prevent request smuggling */
function sanitizeUrl(url: string): string {
  return url.replace(/[\r\n]/g, '')
}

/** Check if a URL matches a route prefix exactly (not just starts with) */
function matchesRoutePrefix(url: string, prefix: string): boolean {
  return url === prefix || url.startsWith(prefix + '/')
}

/** Filter and sanitize request headers for proxying */
function filterHeaders(
  rawHeaders: Record<string, string | string[] | undefined>,
  targetHost: string,
  remoteAddress: string | undefined,
): Record<string, string> {
  const filtered: Record<string, string> = { host: targetHost }
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (FORWARDED_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      filtered[key] = sanitizeHeaderValue(value)
    }
  }
  if (remoteAddress) {
    const existing = rawHeaders['x-forwarded-for']
    filtered['x-forwarded-for'] = existing
      ? `${sanitizeHeaderValue(existing)}, ${remoteAddress}`
      : remoteAddress
  }
  return filtered
}

const PROXY_TIMEOUT_MS = 30_000

/**
 * Vite plugin that proxies /core, /workbench, and /calendar requests to the
 * respective mini-app dev servers. Uses configureServer to register middleware before
 * TanStack Start / Nitro SSR, so HTML page requests are proxied correctly.
 */
function miniAppProxy(): Plugin {
  const routes: Record<string, { target: string; port: number }> = {
    '/core': {
      target: 'localhost',
      port: parseInt(process.env.NXUS_CORE_PORT || '3000', 10),
    },
    '/workbench': {
      target: 'localhost',
      port: parseInt(process.env.NXUS_WORKBENCH_PORT || '3002', 10),
    },
    '/calendar': {
      target: 'localhost',
      port: parseInt(process.env.NXUS_CALENDAR_PORT || '3003', 10),
    },
  }

  return {
    name: 'mini-app-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || ''
        const url = sanitizeUrl(rawUrl)
        const match = Object.entries(routes).find(([prefix]) =>
          matchesRoutePrefix(url, prefix),
        )

        if (!match) return next()

        const [, { target, port }] = match
        const targetHost = `${target}:${port}`
        const proxyReq = httpRequest(
          {
            hostname: target,
            port,
            path: url,
            method: req.method,
            headers: filterHeaders(
              req.headers,
              targetHost,
              req.socket.remoteAddress,
            ),
            timeout: PROXY_TIMEOUT_MS,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers)
            proxyRes.pipe(res, { end: true })
          },
        )

        proxyReq.on('timeout', () => {
          proxyReq.destroy()
          if (!res.headersSent) {
            res.writeHead(504, { 'content-type': 'text/plain' })
            res.end('Gateway Timeout')
          }
        })

        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/plain' })
            res.end('Bad Gateway')
          }
        })

        req.pipe(proxyReq, { end: true })
      })

      // WebSocket proxying for HMR
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const rawUrl = req.url || ''
        const url = sanitizeUrl(rawUrl)
        const match = Object.entries(routes).find(([prefix]) =>
          matchesRoutePrefix(url, prefix),
        )
        if (!match) return

        const [, { target, port }] = match
        const upstream = netConnect(port, target, () => {
          // Build sanitized headers for the raw HTTP upgrade request
          const sanitizedHeaders = Object.entries(req.headers)
            .filter(
              ([k]) =>
                FORWARDED_HEADERS.has(k.toLowerCase()) ||
                k.toLowerCase().startsWith('sec-websocket') ||
                k.toLowerCase() === 'connection' ||
                k.toLowerCase() === 'upgrade',
            )
            .map(([k, v]) => `${k}: ${sanitizeHeaderValue(v)}`)
            .join('\r\n')

          upstream.write(
            `${req.method} ${url} HTTP/${req.httpVersion}\r\n` +
              `host: ${target}:${port}\r\n` +
              sanitizedHeaders +
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
