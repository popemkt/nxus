import { defineConfig, devices } from '@playwright/test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// e2e runs get their own database, recreated fresh on every run — they must
// never touch the developer's real DB (libs/nxus-db/data/nxus.db). The dev
// servers the webServer block boots inherit NXUS_DB_PATH and seed demo data
// into it on first request. See spec/tech/toolchain.md.
//
// The rm below UNLINKS the db; a still-running dev server keeps the open
// inode, so server and test process silently operate on two different
// databases at the same path (split brain: direct-DB-seeded specs fail,
// demo-data specs pass). Server reuse is therefore OFF by default — the rm
// and the reuse flag must stay coupled; never re-enable reuse while the rm
// runs unconditionally. PW_REUSE_SERVER=1 opts back in for fast iteration
// (skips the rm; the DB then accumulates across runs — specs must tolerate
// pre-existing data). See learnings/e2e-db-split-brain.md.
const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')
const REUSE_SERVER = !!process.env.PW_REUSE_SERVER && !process.env.CI
if (!REUSE_SERVER) {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(E2E_DB_PATH + suffix, { force: true })
  }
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
    reuseExistingServer: REUSE_SERVER,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
})
