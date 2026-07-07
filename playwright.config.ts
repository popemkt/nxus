import { defineConfig, devices } from '@playwright/test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// e2e runs get their own database, recreated fresh on every run — they must
// never touch the developer's real DB (libs/nxus-db/data/nxus.db). The dev
// servers the webServer block boots inherit NXUS_DB_PATH and seed demo data
// into it on first request. See spec/tech/toolchain.md.
const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(E2E_DB_PATH + suffix, { force: true })
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'html',

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    env: { ...process.env, NXUS_DB_PATH: E2E_DB_PATH },
    url: 'http://localhost:3001/__health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
})
