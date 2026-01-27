import os from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { getPlatformCommands } from './platform-commands'

vi.mock('os')

describe('platform-commands security', () => {
  it('should not allow command injection in openFolder on darwin', () => {
    vi.mocked(os.platform).mockReturnValue('darwin')
    const commands = getPlatformCommands()
    const maliciousPath = '"; touch /tmp/pwned; "'
    const command = commands.openFolder(maliciousPath)

    // The path should be wrapped in single quotes, making it a single string argument
    expect(command).toBe(`open '"; touch /tmp/pwned; "'`)
  })

  it('should not allow command injection in openFolder on win32', () => {
    vi.mocked(os.platform).mockReturnValue('win32')
    const commands = getPlatformCommands()
    const maliciousPath = 'foo" & calc & "bar'
    const command = commands.openFolder(maliciousPath)

    // Double quotes should be removed, preventing breakout from the quoted argument
    expect(command).toBe('start "" "foo & calc & bar"')
  })
})
