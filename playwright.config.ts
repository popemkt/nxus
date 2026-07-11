import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// e2e runs get their own database, recreated fresh on every run — they must
// never touch the developer's real DB (libs/nxus-db/data/nxus.db). The dev
// servers the webServer block boots inherit NXUS_DB_PATH and seed demo data
// into it on first request. See spec/tech/toolchain.md.
//
// The delete MUST happen inside the webServer command, nowhere else: this
// config file is re-evaluated by EVERY worker process, so a module-scope
// rmSync unlinks the db mid-run under the live servers — server and test
// process then silently operate on two different databases at the same path
// (split brain: direct-DB-seeded specs fail, demo-data specs pass). Putting
// it in the command runs it exactly once, before the apps boot, in the same
// shell. Server reuse stays OFF for the same reason: reused servers hold the
// inode a later run's delete would orphan. PW_REUSE_SERVER=1 opts back in for
// fast local iteration (no fresh delete — the DB accumulates across runs).
// See learnings/e2e-db-split-brain.md.
const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')
const REUSE_SERVER = !!process.env.PW_REUSE_SERVER && !process.env.CI
const RM_DB = `rm -f '${E2E_DB_PATH}' '${E2E_DB_PATH}-wal' '${E2E_DB_PATH}-shm'`

export default defineConfig({
  testDir: './e2e',
  // Triggers + awaits the server's demo auto-seed before any spec runs, so
  // seed presence never depends on spec execution order (e2e/global-setup.ts).
  globalSetup: './e2e/global-setup.cjs',
  // Reaps orphaned nx/vite grandchildren that survive webServer teardown and
  // block the next run's ports (skipped under PW_REUSE_SERVER).
  globalTeardown: './e2e/global-teardown.cjs',
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
    command: `${RM_DB} && pnpm dev`,
    env: { ...process.env, NXUS_DB_PATH: E2E_DB_PATH, NXUS_E2E: '1' },
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
