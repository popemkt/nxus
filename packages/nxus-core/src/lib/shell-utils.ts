/**
 * Escapes an argument for use in a POSIX shell command.
 * Wraps the argument in single quotes and escapes existing single quotes.
 *
 * Example: foo'bar -> 'foo'\''bar'
 */
export function escapePosixArg(arg: string): string {
  if (arg === '') return "''"
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Sanitizes a path for use in a Windows cmd.exe command.
 * Removes double quotes to prevent breaking out of quoted strings.
 *
 * Example: foo"bar -> foobar
 */
export function sanitizeWindowsPath(path: string): string {
  // Windows file paths should not contain double quotes.
  // We simply remove them to prevent command injection via argument breakout.
  return path.replace(/"/g, '')
}
