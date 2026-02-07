import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
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
