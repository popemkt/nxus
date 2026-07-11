// @ts-check
const { tmpdir } = require('node:os')
const { join } = require('node:path')

/**
 * Deterministic demo seed: the server auto-seeds demo data only while ZERO
 * non-system nodes exist (master-client.ts). Without this setup, whichever
 * spec runs first decides the fate of every demo-data-dependent spec — a
 * direct-DB seed landing before the server's first request suppresses the
 * demo seed for the whole run (learnings/e2e-autoseed-suppression.md).
 * This was masked while the e2e DB persisted across runs; fresh-DB runs
 * (learnings/e2e-db-split-brain.md) made it deterministic.
 *
 * Runs after the webServer is healthy: warm a core route to trigger the
 * server-side seed, then wait until `item:%` rows are visible in the DB file.
 * CJS on purpose — Playwright transpiles globalSetup to CJS, which collides
 * with the workspace's `"type": "module"` for .ts/.js here.
 */
module.exports = async function globalSetup() {
  const dbPath = process.env.NXUS_DB_PATH ?? join(tmpdir(), 'nxus-e2e.db')
  const deadline = Date.now() + 90_000
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // A bare HTML GET does NOT trigger the seed — the db-touching calls are
  // client-side server-fn fetches, so a real browser must load the page.
  const { chromium } = require('@playwright/test')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const warm = async () => {
    // Each app is its own Node process with its own module-level bootstrap
    // state — warming only /editor leaves core's first bootstrap to race
    // whichever spec hits it first (C4/C1 flake class). Warm both.
    await page.goto('http://localhost:3001/editor', { waitUntil: 'networkidle' }).catch(() => {})
    await page.goto('http://localhost:3001/core/', { waitUntil: 'networkidle' }).catch(() => {})
  }
  await warm()

  // Graph mode has no SQLite lazy auto-seed to await: demo data comes from
  // the explicit `ARCHITECTURE_TYPE=graph db:seed` run before the suite
  // (ci.yml seeds unconditionally; local graph runs must do the same), and
  // the embedded surrealkv file can't be safely opened read-only here while
  // the app servers hold it. Warm-up above still triggers each app's
  // bootstrap; seed presence is the seeder's contract in this mode.
  if (process.env.ARCHITECTURE_TYPE === 'graph') {
    console.log('[global-setup] graph mode — skipping SQLite demo-seed poll')
    await browser.close().catch(() => {})
    return
  }

  const Database = require('better-sqlite3')
  try {
    while (Date.now() < deadline) {
      try {
        const db = new Database(dbPath, { readonly: true, fileMustExist: true })
        try {
          const row = db
            .prepare("SELECT COUNT(*) AS count FROM nodes WHERE system_id LIKE 'item:%'")
            .get()
          if (row.count > 0) {
            console.log(`[global-setup] demo seed visible (${row.count} item nodes)`)
            return
          }
        } finally {
          db.close()
        }
      } catch {
        // DB file or nodes table not created yet — keep polling.
      }
      await warm()
      await sleep(1_000)
    }

    throw new Error(
      `[global-setup] demo seed never appeared in ${dbPath} within 90s — ` +
        'demo-data-dependent specs (core gallery/app-detail, search palette) would fail. ' +
        'See learnings/e2e-autoseed-suppression.md.',
    )
  } finally {
    await browser.close().catch(() => {})
  }
}
