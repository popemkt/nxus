# Core-mechanism overnight — 2026-07-08

Goal (intent holder, 2026-07-08 night): "core mechanism as tight and performant and reliable as possible — solve one by one, go as far as possible."
Verdict: all five planned slices + stretch shipped; **full e2e suite green for the first time on record** (86 passed / 0 failed / exit 0, 1 worker, CI-equivalent), and the two biggest read/write-path structural defects are gone.

## Shipped (committed + pushed, `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `9657c43` | fix(db): **write-path atomicity** — all multi-statement node mutations in transactions, events emitted post-commit (closes reactivity's half-applied-state DRIFT); bootstrap `ON CONFLICT DO NOTHING` (closes cross-process race DRIFT); atomic `swapOrder` move (closes non-atomic-move DRIFT); `reconcileMentions` fast path; order-key helper centralizing 9 `parseInt(...)||0` sites |
| `1466e24` | perf(db): **read-path N+1 killed** — request-scoped AssemblyCache + frontier-batched tree load. Benchmark (1011 nodes, depth 4): **39,507 → 52 SQL statements (760×), ~1040ms → ~21ms (49×)**; equivalence + ratio enforced by a permanent test |
| `ecdee0e` | fix(e2e): **split-brain #1** — config-time DB rm under reused servers = two databases at one path; reuse off by default (learnings/e2e-db-split-brain.md) |
| `5ef44c2` | fix(ui): **Select press-release hazard** — `alignItemWithTrigger` off product-wide (DR-4) |
| `1329174` | feat(harness): **rules index generated** from frontmatter; `pnpm rules:check` in CI (closes half the generated-registries DRIFT) |
| `6a56158` | perf(editor,db): **invalidation storm** — content saves patch the query cache (+2s trailing convergence invalidation) instead of refetching the tree every 500ms; query evaluator seeds from indexed supertag membership when a top-level conjunct proves it (OR/NOT fall back to full scan; equivalence tested) |
| `866ed29` | test(db): benchmark timeout under parallel suite load |
| `8bf91be` | fix(e2e): **split-brain #2 + seed determinism + overlay** — the DB delete ran in *every worker process* (config is re-evaluated per worker) → moved inside `webServer.command`; `e2e/global-setup.cjs` browser-warms and gates on demo seed (bare HTML GET doesn't trigger it); vite error overlay off under `NXUS_E2E` (it intercepts clicks). Closes the "order-dependent core specs" DRIFT — the order dependence was infra, not test state |
| `07c4970` | docs(spec): **5 stale editor DRIFTs closed** (multi-select, move, command palette, query persistence, fields-display) — their e2e proofs all pass in the green run |
| `2a25f2e` | feat(supertags): **base-type** (Tana gap #5) — `field:base_type` (`task\|person\|event\|day\|flashcard`), inherited resolution helpers, calendar honors `event`/`task` base types so user-defined tags participate; picker in both supertag config surfaces; BT1 e2e story |
| `7adc9fc` | fix(supertags): base-type follow-ups — **soft-deleted nodes leaked** through `getNodeIdsBySupertagBaseType` (deleted events resurfaced on calendar); Select popups z-ordered under panel portals; panel dismissed on option click (portal-aware outside-click) |

## Gate status (end of night, all freshly derived after `nx reset`)

- typecheck: 12/12 projects
- unit: @nxus/db 636 passed / 0 failed (incl. new assembly benchmark, seed-narrowing equivalence, base-type tests); editor-app 131
- e2e full suite, 1 worker (CI-equivalent): **86 passed / 0 failed / exit 0** (~4 min) — reproduced twice
- CI now also gates: rules-index staleness (`pnpm rules:check`)

## The night's central finding (read this if nothing else)

The repo's long-standing "flaky/order-dependent e2e" reputation was **three stacked infra defects**, not test-state leakage:
1. `playwright.config.ts` deleted the e2e DB at module scope — and the config is re-evaluated by every worker process, so the file was unlinked mid-run under the live dev servers. Server and tests silently operated on two different databases at one path (`lsof` shows the server holding the deleted inode). Vite SSR reloads after commits "fixed" it intermittently, making failures look correlated with whatever had just landed.
2. Demo auto-seed ran only if the server got a request before any spec's direct-DB write — whichever spec ran first decided the fate of every demo-data-dependent spec.
3. Vite's error overlay swallowed clicks after transient dev-server hiccups.

Consequence recorded in learnings/e2e-db-split-brain.md: **an e2e verdict produced against reused servers proves nothing about the commit under test.** Two earlier "verified" gates this night were hollow for exactly that reason and were re-derived after the fix.

## Delegation ledger

Codex (credits restored): slice 1 atomicity, slice 3 invalidation, base-type — all green-gated, independently re-verified. Slice 2 Codex stalled at ~45min (0% CPU, log frozen); killed, work on disk was complete except spec+benchmark-baseline+commit — finished by hand. One Sonnet worktree agent (Select hazard) landed on a stale base; discarded, redone by hand (1-line fix). Every delegated slice re-verified from `nx reset` before push.

## Open items (ordered)

1. Editor typing-latency follow-through: content saves no longer storm, but structural ops still broad-invalidate; `node:created`/`node:deleted` still `affectsAll` in the dependency tracker (recorded in persistence.md).
2. Remaining core-mechanism DRIFTs: no versioned migrations (persistence.md §7), reactive layer process-local + sync-SQLite-hard-wired (reactivity.md §9), facade bypasses (persistence.md §5).
3. Order-key persistence still numeric (DRIFT in persistence.md — migration to opaque string keys).
4. Tana gaps #6+ (palette unification, multi-panel, schema tiers, auto-initialize, view tabs) — recon in docs/notes/2026-07-07-tana-gap-recon.md.
5. Harness: ontology-as-data extraction from the 1d essay; app-registry checker → generator promotion (generated-registries.md DRIFT residual).
