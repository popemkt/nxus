/**
 * Cross-platform port killer for predev.
 * Kills any process listening on ports 3000-3005.
 * Works on Windows (netstat), macOS/Linux (lsof).
 */

import { execSync } from 'node:child_process'

const ports = [3000, 3001, 3002, 3003, 3004, 3005]
const isWindows = process.platform === 'win32'

for (const port of ports) {
  try {
    if (isWindows) {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const pids = new Set(
        output
          .split('\n')
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => pid && pid !== '0')
      )
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          console.log(`Killed PID ${pid} on port ${port}`)
        } catch {}
      }
    } else {
      const output = execSync(`lsof -ti :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const pids = new Set(output.trim().split('\n').filter(Boolean))
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
          console.log(`Killed PID ${pid} on port ${port}`)
        } catch {}
      }
    }
  } catch {
    // No process on this port — nothing to kill
  }
}
