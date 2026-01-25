/**
 * Utilities for escaping shell arguments and paths to prevent command injection.
 */

/**
 * Escapes a string for use as a single argument in a POSIX shell (sh, bash, zsh).
 * Wraps the string in single quotes and escapes internal single quotes.
 *
 * Example: foo'bar -> 'foo'\''bar'
 */
export function escapeShArg(str: string): string {
  // Replace ' with '\'' and wrap in '
  return "'" + str.replace(/'/g, "'\\''") + "'"
}

/**
 * Escapes characters that have special meaning inside a double-quoted string in Bash.
 * Escapes: \ " $ `
 *
 * Use this when embedding a string inside `bash -c "..."` to prevent expansion
 * by the outer shell.
 */
export function escapeDoubleQuoteString(str: string): string {
  return str.replace(/([\\"$`])/g, '\\$1')
}

/**
 * Escapes characters for an AppleScript string (double quoted).
 * Escapes: \ "
 *
 * Use this when embedding a string inside AppleScript `do script "..."`.
 */
export function escapeAppleScriptString(str: string): string {
  return str.replace(/([\\"])/g, '\\$1')
}

/**
 * Sanitizes a path for use in Windows commands.
 * Removes characters that are invalid in Windows file names and could be used for injection
 * when inside double quotes: " < > | ? *
 *
 * Note: & is valid in Windows paths, but safe inside double quotes.
 * Colon (:) is kept to support drive letters (C:\), though it is technically restricted in filenames.
 */
export function sanitizeWindowsPath(path: string): string {
  // Remove " < > | ? *
  return path.replace(/[<>|"?*]/g, '')
}
