#!/usr/bin/env node
/**
 * Cross-platform script to kill processes on dev server ports.
 * Works on both Windows (netstat + taskkill) and Unix (lsof + kill).
 */
import { execSync } from 'node:child_process';

const ports = [3000, 3001, 3002, 3003, 3004, 3005];
const isWindows = process.platform === 'win32';

for (const port of ports) {
  try {
    if (isWindows) {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set(
        output
          .split('\n')
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => pid && /^\d+$/.test(pid) && pid !== '0')
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`Killed PID ${pid} on port ${port}`);
        } catch {}
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    }
  } catch {
    // No process on this port — that's fine
  }
}
