/**
 * Escapes an argument for use in a POSIX shell command.
 * Wraps the argument in single quotes and escapes existing single quotes.
 */
export function escapePosixArg(arg: string): string {
  if (arg === '') return "''";
  if (!/[^a-zA-Z0-9_,._+:@%/-]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Sanitizes a path for use in a Windows cmd command.
 * Windows paths cannot contain " characters.
 */
export function sanitizeWindowsPath(path: string): string {
  // Double quotes are not allowed in Windows paths.
  // We remove them to prevent breaking out of quoted strings in cmd.
  return path.replace(/"/g, '');
}
