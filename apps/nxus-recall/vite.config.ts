import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  base: '/recall/',
  plugins: [
    tanstackStart(),
    nitro(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    viteReact(),
  ],
  server: {
    port: 3004,
    strictPort: true,
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
      '@mastra/core',
      '@nxus/mastra',
    ],
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
  ssr: {
    noExternal: ['@nxus/db', '@nxus/mastra'],
  },
})

export default config
