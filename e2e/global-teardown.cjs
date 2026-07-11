/**
 * global-teardown.cjs — reap orphaned dev-server trees.
 *
 * Playwright's webServer teardown kills its direct child (`sh -c rm ... &&
 * pnpm dev`) but the nx/vite grandchildren detach, reparent to init, and
 * keep holding ports 3000-3005 — the next run then dies with
 * "http://localhost:3001/__health is already used" (observed 2026-07-11;
 * secondary flake source in the C4 diagnosis). Sweep the ports by pid.
 *
 * CJS on purpose: Playwright transpiles global hooks to CJS, which
 * collides with the repo's "type": "module" (see e2e/global-setup.cjs).
 */
const { execSync } = require('node:child_process')

const PORTS = [3000, 3001, 3002, 3003, 3004, 3005]

module.exports = async function globalTeardown() {
  // Only sweep when THIS run booted the servers; under PW_REUSE_SERVER a
  // developer's own long-running `pnpm dev` must survive the test run.
  if (process.env.PW_REUSE_SERVER) return

  for (const port of PORTS) {
    try {
      const pids = execSync(`lsof -nP -ti :${port}`, { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGKILL')
          console.log(`[global-teardown] reaped orphan pid ${pid} on :${port}`)
        } catch {
          // already gone
        }
      }
    } catch {
      // lsof exits non-zero when the port is free — the good case
    }
  }
}
