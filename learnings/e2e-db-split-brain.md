# e2e DB split brain: config-time rm + reused dev servers

Date: 2026-07-08
Substrate: Playwright `webServer.reuseExistingServer` + SQLite (WAL) + macOS unlink semantics

## Symptom

Direct-DB-seeded e2e specs (inline-mentions, formula-fields, Cmd+Shift+Down move pair) fail with the seeded nodes never rendering, while demo-data specs pass — but only on the *second and later* local runs. Runs balloon from ~45s to 15+ minutes (each seeded spec burns its full navigation-retry/timeout budget). Everything passes in CI and on the first run after a reboot. Re-running right after a commit that touches app server code passes again — then subsequent runs fail again.

## Mechanism

1. `playwright.config.ts` ran `rmSync(E2E_DB_PATH…)` unconditionally **at config load**, i.e. on every `playwright test` invocation.
2. `reuseExistingServer: !CI` kept the previous run's dev servers alive. A running server holds its better-sqlite3 connection to the now-**unlinked inode** (visible via `lsof`: `nxus-e2e.db-wal` open with nonzero size while absent from `ls`).
3. The test process (and the server's *next cold boot*) create a **new file at the same path**. From then on: server reads/writes the dead inode, test seeds the live file. Two databases, one path.
4. Vite SSR module reload (triggered by any commit touching server code) tears down and re-imports the db module → the server reopens the path → lands on the live inode → everything "passes again". This makes the failure look correlated with whatever you just committed. It is not.

## Diagnostic signature

- `sqlite3 $TMPDIR/nxus-e2e.db "SELECT …"` shows the seeded rows; the app says the node doesn't exist.
- `lsof -p <server pid> | grep nxus-e2e` shows `.db`/`.db-wal` handles whose sizes disagree with the on-disk files (or whose files are missing).
- Zoomed editor URL for a seeded node renders "No nodes found" while the same URL works after a server restart.

## Second mechanism (found hours later)

Turning reuse off was NOT sufficient: `playwright.config.ts` is re-evaluated by **every worker process**, so a module-scope `rmSync` still unlinked the db mid-run under the servers the run itself had just booted. The delete must live where it can run exactly once, before the apps boot: inside the `webServer.command` (`rm -f … && pnpm dev`).

## Rule

The db delete lives ONLY in `webServer.command` (once, pre-boot, same shell). Never at config module scope — config runs per worker. Server reuse stays OFF by default (`reuseExistingServer`); `PW_REUSE_SERVER=1` re-enables reuse and skips the fresh delete (DB accumulates; specs must tolerate pre-existing data).

Corollary for agents: an e2e verification run made against reused servers proves nothing about the commit under test if server code changed — the server may be executing pre-commit code on a pre-rm database. When a gate matters, kill ports 3000-3005 first or rely on the new default.
