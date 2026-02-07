import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  plugins: [
    tanstackStart(),
    devtools({
      injectSource: {
        enabled: false,
      },
    }),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    viteReact(),
  ],
  server: {
    watch: {
      // Exclude unnecessary folders from file watching to prevent "too many open files" error
      ignored: [
        '**/packages/repos/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/.turbo/**',
        '**/dist/**',
        '**/.next/**',
        '**/build/**',
      ],
    },
  },
  optimizeDeps: {
    exclude: [
      'node-pty',
      'better-sqlite3',
      'drizzle-orm/better-sqlite3',
      '@nxus/db',
    ],
    // Force rrule to use its ESM entry point which has proper named exports
    esbuildOptions: {
      mainFields: ['module', 'main'],
    },
  },
  resolve: {
    // Ensure CommonJS modules resolve to their ESM entry points for proper interop
    alias: {
      // rrule: Force ESM module with proper named exports (RRule, RRuleSet, rrulestr)
      rrule: 'rrule/dist/esm/index.js',
      // react-big-calendar sub-path aliases: Must resolve BEFORE the main alias
      // The base CSS provides essential layout/positioning styles
      'react-big-calendar/lib/css/react-big-calendar.css':
        'react-big-calendar/lib/css/react-big-calendar.css',
      // The addon is only available in lib/ (CommonJS), not in the ESM bundle
      'react-big-calendar/lib/addons/dragAndDrop/styles.css':
        'react-big-calendar/lib/addons/dragAndDrop/styles.css',
      'react-big-calendar/lib/addons/dragAndDrop':
        'react-big-calendar/lib/addons/dragAndDrop/index.js',
      // react-big-calendar: Force ESM module with proper named exports (Calendar, dateFnsLocalizer, etc.)
      // This ensures both SSR and client builds use the same module format
      'react-big-calendar': 'react-big-calendar/dist/react-big-calendar.esm.js',
    },
  },
  build: {
    rollupOptions: {
      external: ['node-pty', 'better-sqlite3'],
    },
  },
  ssr: {
    // These packages should only run on the server
    noExternal: ['@nxus/db', '@nxus/calendar'],
  },
})

export default config
