import { describe, expect, it } from 'vitest'
import { escapePosixArg, sanitizeWindowsPath } from './shell-utils'

describe('shell-utils', () => {
  describe('escapePosixArg', () => {
    it('should quote a normal string', () => {
      expect(escapePosixArg('foo')).toBe("'foo'")
    })

    it('should quote a string with spaces', () => {
      expect(escapePosixArg('foo bar')).toBe("'foo bar'")
    })

    it('should escape single quotes', () => {
      expect(escapePosixArg("foo'bar")).toBe("'foo'\\''bar'")
    })

    it('should handle empty string', () => {
      expect(escapePosixArg('')).toBe("''")
    })

    it('should handle complex string with multiple quotes and spaces', () => {
      expect(escapePosixArg("foo 'bar' baz")).toBe("'foo '\\''bar'\\'' baz'")
    })
  })

  describe('sanitizeWindowsPath', () => {
    it('should return a normal path as is', () => {
      expect(sanitizeWindowsPath('C:\\Windows\\System32')).toBe(
        'C:\\Windows\\System32',
      )
    })

    it('should preserve spaces', () => {
      expect(sanitizeWindowsPath('C:\\Program Files\\App')).toBe(
        'C:\\Program Files\\App',
      )
    })

    it('should remove double quotes', () => {
      expect(sanitizeWindowsPath('"C:\\Program Files\\App"')).toBe(
        'C:\\Program Files\\App',
      )
    })

    it('should remove inserted quotes', () => {
      expect(sanitizeWindowsPath('foo"bar')).toBe('foobar')
    })
  })
})
