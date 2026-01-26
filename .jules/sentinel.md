## 2026-01-26 - Command Injection in Platform Commands
**Vulnerability:** `getPlatformCommands().openFolder(path)` and similar functions constructed shell commands by naively interpolating user-provided paths into strings passed to `exec`.
**Learning:** Even simple operations like "open this folder" can be vectors for critical RCE if the underlying mechanism uses `exec(string)` and the platform uses shell commands (like `xdg-open`, `start`, `open`).
**Prevention:** Always use `escapePosixArg` (wraps in single quotes) or `sanitizeWindowsPath` (removes double quotes) when constructing shell commands dynamically. Prefer `spawn` with argument arrays over `exec` where possible, but for `start`/`open`/`xdg-open` via shell, rigorous escaping is required.
