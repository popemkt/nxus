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
    exclude: ['node-pty'],
  },
  build: {
    rollupOptions: {
      external: ['node-pty'],
    },
  },
})

export default config
