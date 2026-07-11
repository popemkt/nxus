# Surreal parity sprint — 2026-07-11 (evening, follow-up to the perf sprint)

Goal: make `ARCHITECTURE_TYPE=graph` real — the canonical-target backend was "at parity" on paper (29/29 NodeBackend methods, equivalence-tested) while everything around the interface silently fell back to SQLite.

## Shipped (all on `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `4fa6dc4` | **S2: mention parity + batch tree reads** — shared mention parser, Surreal-native in-transaction reconciliation, `getChildrenByParents`/`hasChildren` on `NodeBackend` (both backends, equivalence-tested), reopen-persistence test |
| `7ff1944` | **S1: seed writes the facade's read model** — `seed-graph.ts` hand-wrote `part_of`/`props` SurQL the backend never reads (fresh graph seed = structurally invisible); now seeds via `nodeFacade`. Lazy seed dispatches on mode |
| `c9eb32a` | **S3: composite tree read through the facade** — `getNodeTreeServerFn` drops raw drizzle entirely; editor tree read works on both backends. Depth-3 @10k: 2.64→4.04ms (accepted) |
| `6e6806d` | **S4: deleted core's duplicate Surreal layer** — 1,400 lines, zero consumers, −3,616 LOC total |
| `44c095c` | **S5: honest graph e2e leg** — SurrealDB *server* mode (embedded surrealkv corrupts multi-process: `learnings/surrealkv-multiprocess.md`), mode-aware global-setup, 17 surgical graph skips with reasons |

## The verdict that matters

| Leg | Before today | After |
|---|---|---|
| Graph e2e | green but fake (editor read SQLite) | **61 passed / 0 failed, 1.4 min**, against real SurrealDB |
| Node e2e | 90 passed | 90 passed (unchanged) |
| db unit suite | 714 | 720 (mentions, tree reads, reopen persistence) |

## Findings worth remembering

- The old graph CI leg passed **because of** the bug it should have caught: graph mode wrongly seeded SQLite, which satisfied global-setup's SQLite poll. Honest dispatch immediately broke the harness — good.
- Embedded surrealkv is single-process; six app servers sharing one file corrupt it (`Invalid revision … DefineTableStatement`) and run 20x slower. Server mode: 31.6min → 1.4min. CI graph leg now boots `surreal v3.2.1 memory` (v2.3.7 initially; upgraded same day).
- Codex misdiagnosed twice under review: claimed a boot-time `DEFINE TABLE OVERWRITE` data wipe (refuted with `surreal-reopen.test.ts` — likely a src/dist dual-module path mixup) and blanket-skipped the whole outline-editor suite where per-test skips + server mode preserved 32 tests of coverage. Lane review continues to pay.
- Lane collision: parallel codex lanes clobbered each other's in-flight edits once (lane B `git`-restored lane A's files). Sequential lanes or disjoint file sets from here.

## Honest residue (tracked)

- 17 graph-mode e2e skips: direct-SQLite fixtures (7), graph feature gaps (5: inbox reactive queries, backlink grouping ×2, empty-node child creation, multi-select root count), seed shape gaps (5: no app-card/inbox demo items in graph seed).
- Reactive layer is SQLite-hard-wired (last DRIFT in persistence.md §5).
- SurrealDB v3 upgrade: DONE same evening — `surrealdb@2.0.4` + `@surrealdb/node@3.0.3` + server 3.2.1, DDL dialect fixed, all gates re-green. New caveat: v3 embedded surrealkv hangs on same-process close→reopen (learnings updated).
