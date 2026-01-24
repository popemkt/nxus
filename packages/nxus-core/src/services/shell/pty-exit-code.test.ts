import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPtySession } from './pty-session-manager.server'
import * as pty from 'node-pty'

// Mock node-pty
vi.mock('node-pty', () => {
  return {
    spawn: vi.fn(),
  }
})

describe('PTY Exit Code', () => {
  let mockPtyProcess: any
  let onExitCallback: (event: { exitCode: number; signal?: number }) => void

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock PTY process
    onExitCallback = vi.fn()

    mockPtyProcess = {
      on: vi.fn(), // Fallback if implementation changes to use .on
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn((_cb) => {
        return { dispose: vi.fn() }
      }),
      onExit: vi.fn((cb) => {
        onExitCallback = cb
        return { dispose: vi.fn() }
      }),
      pid: 12345,
    }

    vi.mocked(pty.spawn).mockReturnValue(mockPtyProcess)
  })

  it('should capture actual exit code when process exits', () => {
    // Create session
    const session = createPtySession({
      command: 'echo',
      args: ['hello'],
    })

    expect(session).toBeDefined()
    expect(session.isAlive).toBe(true)

    // Simulate exit with code 123
    const exitCode = 123
    // Trigger the callback captured by the mock
    onExitCallback({ exitCode })

    // Check if session is marked as not alive
    expect(session.isAlive).toBe(false)

    // Check if exit code is captured (this is expected to fail initially)
    // We cast session to any because exitCode is not yet on the interface
    expect((session as any).exitCode).toBe(exitCode)
  })
})
