# Sentinel Journal

## 2025-02-18 - Shell Command Injection in Terminal Launcher
**Vulnerability:** The `openTerminalWithCommand` function in `nxus-core` constructed shell commands by concatenating user inputs (`cwd` and `command`) without proper escaping. This allowed attackers to inject arbitrary commands via `cwd` (e.g., `"; rm -rf /; #`) or break out of `echo` statements in the command execution flow.
**Learning:** Nesting commands inside shell wrappers (like `bash -c "..."` or AppleScript `do script "..."`) significantly increases complexity. A string safe for `bash` might become unsafe when nested inside another quoted string.
**Prevention:**
1. Avoid constructing shell commands via string concatenation whenever possible (use `execFile` with array arguments).
2. If concatenation is necessary (e.g. for `gnome-terminal -- bash -c ...`), use rigorous, context-aware escaping (single quotes for inner args, double-quote escaping for outer wrapper).
3. Centralize escaping logic in verified utility functions (`shell-utils.ts`) rather than ad-hoc replacement.
