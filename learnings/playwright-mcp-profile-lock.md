# Playwright MCP fails to launch when a stray Chrome holds the profile lock

- **Date**: 2026-07-06
- **Substrate**: Playwright MCP server (`mcp__playwright__*`) + Chrome/Chromium on macOS
- **Symptom**: `browser_navigate` (or any first browser call) fails with an error like "Browser is already in use" / cannot launch because the persistent browser profile is locked.

## The discovery

The Playwright MCP server launches Chrome with a **persistent user-data-dir profile**. Chrome guards that directory with a `SingletonLock`. If a previous Chrome process from an earlier session did not exit cleanly (crashed session, killed terminal, orphaned MCP server), it keeps holding the lock, and every new launch fails until the holder dies. This happens **routinely** across long-lived agent sessions — it is not a rare corruption.

Recovery:

```bash
# find the process holding the Playwright MCP profile
ps aux | grep -i "chrome" | grep -i "mcp-chrome\|playwright"
# or find the lock holder directly
lsof +D "$HOME/Library/Caches/ms-playwright" 2>/dev/null | head

# kill the specific holder PID (NOT a blanket pkill of your real Chrome)
kill <pid>
```

Then retry the MCP browser call — the profile unlocks as soon as the holder exits. Deleting the profile directory also works but loses session state (logins, storage) and is almost never necessary.

## Takeaway

When Playwright MCP reports the browser is already in use, find the stray Chrome process holding the MCP profile lock and kill that PID, then retry — do not restart the whole session or delete the profile first.
