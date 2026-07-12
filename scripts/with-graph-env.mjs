#!/usr/bin/env node
// Graph-mode launcher (spec/tech/toolchain.md "Launch configurations").
//
// Loads envs/graph.env, ensures the local SurrealDB server is running
// (starts `~/.surrealdb/surreal3` with the in-memory engine if the port is
// free), then execs the given command with that environment:
//
//   node scripts/with-graph-env.mjs [--fresh] <command> [args...]
//
// --fresh kills any server already on the port and starts a clean one —
// e2e uses it so runs never inherit stale data (a stale server once
// poisoned a whole verification run; see learnings/surrealkv-multiprocess.md
// for why multi-process topologies need a server, not embedded surrealkv).

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from 'node:net'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SURREAL_BIN = join(homedir(), '.surrealdb', 'surreal3')

const args = process.argv.slice(2)
const fresh = args[0] === '--fresh'
const command = fresh ? args.slice(1) : args
if (command.length === 0) {
  console.error('usage: with-graph-env.mjs [--fresh] <command> [args...]')
  process.exit(2)
}

// --- load envs/graph.env ----------------------------------------------------
const envFile = readFileSync(join(ROOT, 'envs', 'graph.env'), 'utf8')
const graphEnv = {}
for (const line of envFile.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  graphEnv[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const url = new URL(graphEnv.SURREAL_URL)
const port = Number(url.port)
const host = url.hostname

// --- ensure the SurrealDB server --------------------------------------------
function portInUse() {
  return new Promise((resolve) => {
    const socket = connect({ port, host, timeout: 500 })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}

if (fresh) {
  spawnSync('sh', ['-c', `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`])
  await new Promise((r) => setTimeout(r, 300))
}

if (await portInUse()) {
  console.log(`[graph-env] reusing SurrealDB already on :${port}`)
} else {
  console.log(`[graph-env] starting SurrealDB (memory engine) on :${port}`)
  const server = spawn(
    SURREAL_BIN,
    ['start', '--user', graphEnv.SURREAL_USER, '--pass', graphEnv.SURREAL_PASS, '--bind', `${host}:${port}`, 'memory'],
    { detached: true, stdio: 'ignore' },
  )
  server.on('error', () => {
    console.error(
      `[graph-env] SurrealDB binary not found at ${SURREAL_BIN}.\n` +
        `  Install: curl -sSf https://install.surrealdb.com | sh -s -- --version v3.2.1\n` +
        `  then: mv ~/.surrealdb/surreal ~/.surrealdb/surreal3`,
    )
    process.exit(1)
  })
  server.unref()
  // wait for readiness (up to ~5s)
  let up = false
  for (let i = 0; i < 25 && !up; i++) {
    await new Promise((r) => setTimeout(r, 200))
    up = await portInUse()
  }
  if (!up) {
    console.error(`[graph-env] SurrealDB did not come up on :${port}`)
    process.exit(1)
  }
}

// --- exec the command --------------------------------------------------------
const child = spawn(command[0], command.slice(1), {
  stdio: 'inherit',
  cwd: ROOT,
  env: { ...process.env, ...graphEnv },
})
child.on('exit', (code) => process.exit(code ?? 1))
