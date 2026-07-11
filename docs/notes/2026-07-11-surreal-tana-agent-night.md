# Surreal reconciliation, Tana gaps, agent surface — 2026-07-10/11 overnight

Intent holder's asks, in order: core mechanism tight/performant/reliable; is Surreal canonical and can it start; Tana parity report + close gaps (TIF, command nodes noted); frontend gaps + performance; edge-case tests; expose an agent tool surface (MCP vs frameworks). Standing: go as far as possible, delegate heavily.

Verdict: **16 commits pushed**, full e2e suite green (**87 passed / 7 skipped / exit 0** — new record, includes the new daily-note spec), db unit **713 passed / 4 skipped**, typecheck **14 projects**.

## The night's central finding

Git archaeology resolved the Surreal contradiction: the user's last HUMAN work (Feb–Mar 2026, PRs #45/#58) was a **SurrealDB migration**; every 2026-07-07/08 commit was a prior **agent session** committing under the user's identity — it hardened SQLite and wrote the "node mode is primary" decision record **the user never made**. Spec now records the truth: **graph (Surreal) is the canonical target; node is the working default until parity** (persistence.md §6 + provenance note). Ground truth: Surreal ≈35-40% complete; boots + runs the core app live; editor/calendar silently fall back to SQLite via facade bypasses.

## Shipped (all on `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `d0e97fa` | Tana parity report — 43-feature docs crawl vs repo inventory, ranked gaps (`docs/notes/2026-07-10-tana-parity-report.md`) |
| `8b13306` | **Surreal transactions + post-commit events** (driver `beginTransaction()` throws under embedded @surrealdb/node — batched `BEGIN…COMMIT` SurrealQL, proven atomic); spec reconciliation to Surreal-canonical |
| `9657…` | S1: 20 facade bypasses rewired (editor server fns, core, sync barrel deleted) |
| `52a65dc` | **TIF v0.1 import/export** — Zod-validated, transactional, round-trip proven |
| `4d8cb1e` | **S2: 8 NodeBackend methods on BOTH backends** (restore/reparent/reorder/roots/property-row/distinct/usage-stats/base-type) + callers rewired [codex] |
| `6730400` | **Relative-date query keywords** — evaluation-time windows, injected clock, ISO-Monday weeks, 16 tests |
| `2d5ff8e` | **Invalidation storm, client half** — structural ops → trailing convergence |
| `0bf3cb7` | **3-state todos** — `field:todo_state` engine primitive, checkbox UI, `[] ` conversion, TIF+calendar converged |
| `08c7b8f` | **Daily notes** — #Day nodes, race-safe `item:day-YYYY-MM-DD` identity, delete-resurrect, Today button; exposed+fixed the zoom-into-unloaded-node client gap |
| `bc962b2` | **C4/C1 flake class closed** — bootstrap in one BEGIN IMMEDIATE tx, global-setup warms /core, rejected ready-promise no longer cached |
| `716b9a9` | **Invalidation storm, server half** — membership events carry emission-time ancestor-expanded supertagIds; tracker narrows; AFFECTS_ALL only for unenriched legacy events |
| `71dbb3b` | **@nxus/mcp** — 10 agent tools over the facade, Streamable HTTP in-process (reactive layer sees agent writes), live client proof [codex] |
| `5427e5d` | e2e global teardown reaps orphaned dev-server trees (self-respawn port-block bug, observed live) |
| `…tests` | **39 adversarial edge tests** (DST, month-length, rollback, narrowing-through-real-bus, TIF edges) — **zero real bugs found** |
| `d5968b2` | **Action registry** — `libs/nxus-actions` as capability SSOT (Zod in/out at the boundary), MCP now a thin adapter [codex] |

## Architecture decision record (agent surface)

- Evaluated **agent-native** (Builder.io) and **fastmcp-ts** (Prefect) per intent holder's request: both 3-4 months old, both **without LICENSE files** as of 2026-07-11; agent-native is a platform (own server/router/DB/Electron), not a library. Research: `agent-framework-research.md` (session scratchpad) + spec/tech/actions.md.
- Chosen: **own ~100-line action registry** (zero lock-in; both frameworks consume this shape if adopted later) + official @modelcontextprotocol/sdk adapter. fastmcp-ts revisit trigger: a license + MCP-Apps need (the `ui://` dynamic-UI spec is hand-rollable on the raw SDK regardless).

## Delegation ledger

Codex: MCP build, S2 parity ops, actions registry — all green-gated, re-verified independently (one post-completion stall, work intact). Sonnet agents: two inventories, ground-truth audit, facade recon, parity report, C4 diagnosis, edge-test sweep, framework research — delivered; **five stall/API-drop incidents** mid-night, all salvaged from disk. Rule reinforced: *agent verdicts are re-derived, never trusted; two concurrent e2e-driving agents on one port namespace = friendly fire* (observed: C4 agent's loop killed my suite mid-run).

## Open (ordered)

1. Surreal parity continuation: S3 seed dispatch, composite tree read (AssemblyCache shape), core's duplicate hand-rolled Surreal layer consolidation — then the graph CI leg becomes real.
2. REST adapter over the action registry (thin; proves the SSOT claim).
3. Parallel-pool test pollution in libs/nxus-db (single-fork green, default pool flaky — 2 tif-edge tests observed; make the pool deterministic or isolate tmpdirs).
4. Command nodes (last big Tana gap) — automations exist, `create_node` action specced-only; parity report gap #2.
5. MCP tool edge-tests deeper than the 3-test smoke; MCP-Apps `ui://` view resource as the dynamic-UI proof.
