/**
 * PTY Session Manager
 *
 * Server-side singleton that manages pseudo-terminal sessions using node-pty.
 * Each session represents an interactive shell that can receive input and produce output.
 */

import * as pty from 'node-pty'
import * as os from 'os'
import * as fs from 'fs'

export interface PtySession {
  id: string
  pty: pty.IPty
  cwd: string
  shell: string
  createdAt: Date
  outputBuffer: string[] // Buffer for reconnection
  bufferOffset: number // Total characters shifted out of the buffer
  isAlive: boolean
  exitCode?: number
  resizeInProgress: boolean // Flag to suppress output during resize
  resizeDebounceTimeout: NodeJS.Timeout | null // Resize settle timer
}

// Maximum buffer size per session (characters)
const MAX_BUFFER_SIZE = 50000

// Session timeout (5 minutes of inactivity)
const SESSION_TIMEOUT_MS = 5 * 60 * 1000

// Store active sessions
const sessions = new Map<string, PtySession>()

// Cleanup timers
const cleanupTimers = new Map<string, NodeJS.Timeout>()

/**
 * Detect the best shell for the current platform
 */
function detectShell(): { shell: string; args: string[] } {
  const platform = os.platform()

  // Check for WSL
  if (platform === 'linux') {
    try {
      const versionPath = '/proc/version'
      if (fs.existsSync(versionPath)) {
        const version = fs.readFileSync(versionPath, 'utf-8').toLowerCase()
        if (version.includes('microsoft') || version.includes('wsl')) {
          // WSL - use bash with login
          const userShell = process.env.SHELL
          if (userShell && fs.existsSync(userShell)) {
            return { shell: userShell, args: ['--login'] }
          }
          return { shell: '/bin/bash', args: ['--login'] }
        }
      }
    } catch {
      // Ignore
    }
  }

  // macOS/Linux - prefer user's shell
  if (platform !== 'win32') {
    const userShell = process.env.SHELL
    if (userShell && fs.existsSync(userShell)) {
      const shellName = userShell.split('/').pop()?.toLowerCase()
      // sh doesn't support --login in all implementations
      const args = shellName === 'sh' ? [] : ['--login']
      return { shell: userShell, args }
    }
    // Fallback to common shells
    for (const shell of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
      if (fs.existsSync(shell)) {
        return { shell, args: shell === '/bin/sh' ? [] : ['--login'] }
      }
    }
    return { shell: '/bin/sh', args: [] }
  }

  // Windows - prefer PowerShell 7, then PowerShell, then cmd
  const pwshPaths = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
  ]
  for (const pwsh of pwshPaths) {
    if (fs.existsSync(pwsh)) {
      return { shell: pwsh, args: [] }
    }
  }

  // Check if pwsh is in PATH
  try {
    const { execSync } = require('child_process')
    execSync('where pwsh', { stdio: 'ignore' })
    return { shell: 'pwsh.exe', args: [] }
  } catch {
    // PowerShell 7 not in PATH
  }

  return { shell: 'powershell.exe', args: [] }
}

/**
 * Create a new PTY session
 */
export function createPtySession(options?: {
  cwd?: string
  command?: string
  args?: string[]
  shellCommand?: string // Full command to execute in shell (shell handles parsing)
  cols?: number
  rows?: number
}): PtySession {
  const id = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const { shell: detectedShell, args: shellArgs } = detectShell()
  const shell = options?.command || detectedShell
  const args = options?.args || shellArgs
  const cwd = options?.cwd || os.homedir()

  // Build environment
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
  }

  console.log(`[PTY] Creating session ${id} with shell: ${shell} in ${cwd}`)

  const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: options?.cols || 80,
    rows: options?.rows || 24,
    cwd,
    env,
  })

  const session: PtySession = {
    id,
    pty: ptyProcess,
    cwd,
    shell,
    createdAt: new Date(),
    outputBuffer: [],
    bufferOffset: 0,
    isAlive: true,
    resizeInProgress: false,
    resizeDebounceTimeout: null,
  }

  sessions.set(id, session)

  // Buffer output for potential reconnection
  ptyProcess.onData((data) => {
    // Skip output during resize to prevent redraw artifacts
    if (session.resizeInProgress) {
      return
    }

    session.outputBuffer.push(data)
    // Trim buffer if too large
    let totalSize = session.outputBuffer.reduce((acc, s) => acc + s.length, 0)
    while (totalSize > MAX_BUFFER_SIZE && session.outputBuffer.length > 1) {
      const shifted = session.outputBuffer.shift()
      if (shifted) {
        session.bufferOffset += shifted.length
      }
      totalSize = session.outputBuffer.reduce((acc, s) => acc + s.length, 0)
    }
    resetSessionTimeout(id)
  })

  // Handle exit
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Session ${id} exited with code ${exitCode}`)
    session.isAlive = false
    session.exitCode = exitCode
  })

  // Set cleanup timer
  resetSessionTimeout(id)

  // If shellCommand is provided, write it to the PTY
  // This lets the shell handle all parsing (quotes, escapes, etc.)
  if (options?.shellCommand) {
    // Small delay to ensure shell is ready
    setTimeout(() => {
      if (session.isAlive) {
        ptyProcess.write(`${options.shellCommand}\r`)
        console.log(`[PTY] Wrote shellCommand to session ${id}`)
      }
    }, 100)
  }

  console.log(`[PTY] Session ${id} created successfully`)
  return session
}

/**
 * Reset the session timeout timer
 */
function resetSessionTimeout(sessionId: string) {
  const existing = cleanupTimers.get(sessionId)
  if (existing) {
    clearTimeout(existing)
  }

  const timer = setTimeout(() => {
    console.log(`[PTY] Session ${sessionId} timed out, cleaning up`)
    closePtySession(sessionId)
  }, SESSION_TIMEOUT_MS)

  cleanupTimers.set(sessionId, timer)
}

/**
 * Get a session by ID
 */
export function getPtySession(sessionId: string): PtySession | undefined {
  return sessions.get(sessionId)
}

/**
 * Write data to a PTY session
 */
export function writePtySession(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId)
  if (!session || !session.isAlive) {
    console.warn(`[PTY] Session ${sessionId} not found or not alive`)
    return false
  }
  session.pty.write(data)
  resetSessionTimeout(sessionId)
  return true
}

/**
 * Resize a PTY session
 */
export function resizePtySession(
  sessionId: string,
  cols: number,
  rows: number,
  suppressOutput: boolean = true,
): boolean {
  const session = sessions.get(sessionId)
  if (!session || !session.isAlive) {
    return false
  }
  try {
    // Suppress output during resize to avoid TUI redraw artifacts
    if (suppressOutput) {
      session.resizeInProgress = true
      if (session.resizeDebounceTimeout) {
        clearTimeout(session.resizeDebounceTimeout)
      }
    }

    session.pty.resize(cols, rows)

    if (suppressOutput) {
      session.resizeDebounceTimeout = setTimeout(() => {
        session.resizeInProgress = false
        session.resizeDebounceTimeout = null
      }, 150)
    }

    return true
  } catch (error) {
    console.error(`[PTY] Error resizing session ${sessionId}:`, error)
    session.resizeInProgress = false
    return false
  }
}

/**
 * Close a PTY session
 */
export function closePtySession(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) {
    return false
  }

  try {
    if (session.isAlive) {
      session.pty.kill()
    }
  } catch {
    // Ignore errors during cleanup
  }

  if (session.resizeDebounceTimeout) {
    clearTimeout(session.resizeDebounceTimeout)
    session.resizeDebounceTimeout = null
  }

  sessions.delete(sessionId)

  const timer = cleanupTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    cleanupTimers.delete(sessionId)
  }

  console.log(`[PTY] Session ${sessionId} closed`)
  return true
}

/**
 * Get all active sessions
 */
export function getAllPtySessions(): Array<{
  id: string
  cwd: string
  shell: string
  isAlive: boolean
  createdAt: Date
}> {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    cwd: s.cwd,
    shell: s.shell,
    isAlive: s.isAlive,
    createdAt: s.createdAt,
  }))
}

/**
 * Get buffered output for a session (for reconnection)
 * Returns the full buffer and the current offset
 */
export function getPtySessionBuffer(
  sessionId: string,
): { buffer: string; offset: number } | null {
  const session = sessions.get(sessionId)
  return session
    ? { buffer: session.outputBuffer.join(''), offset: session.bufferOffset }
    : null
}
