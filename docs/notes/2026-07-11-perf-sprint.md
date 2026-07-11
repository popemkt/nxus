# Performance sprint — 2026-07-11 (daytime, follow-up to the overnight run)

Intent holder asked: "is the editor as reliable/performant as Tana?" and "can we have benchmarks that clean up after themselves, at the API level?" Answer was honest-no on scale; this sprint closed the measured gaps.

## Shipped (all on `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `be392d3` | **Lazy tree loading** — mount fetches depth 3 (was: entire workspace), `hasUnloadedChildren` boundary contract, fetch-on-expand + fetch-on-zoom via `mergeServerNodes`; also fixes zoom-into-server-created-node "No nodes found" gap |
| `e3af25e` | **Benchmark harness** — `libs/nxus-db/src/benchmarks/`, deterministic seeded graphs, temp-dir DBs with proven zero-residue cleanup, vitest bench + `NXUS_PERF=1` budget gate with 10k→20k complexity-ratio guard (<3.5x), `NXUS_PERF_50K=1` smoke |
| `44f1b17` | **C8 inbox flake killed** — test was order-dependent (demo seed creates no inbox items); now self-seeding. Failed in isolation even at HEAD; exposed by new spec files shifting worker order |
| `371fbbd` | **Query evaluator 200-400x** — page-before-assemble (profile: 65-77% of time was assembling losers), per-evaluation membership memo, indexed IN() for inheritance, SQL temporal ranges. Reviewer caught + fixed an `after` boundary regression (gte vs gt) codex introduced; boundary now pinned by unit test |
| `50fb089` | **Virtualized wide child lists** — windowed rendering >150 children, active-row pinned, sub-threshold DOM byte-identical; 500-child e2e proves <250 DOM blocks |

## The numbers (10k-node seeded graph, mean)

| Path | Before | After |
|---|---:|---:|
| Editor boot tree read | 110ms (full) | 2.8ms (depth-2/3) |
| Inherited-supertag query | 2,300ms | 11.2ms |
| Relative-date temporal query | 4,106ms | 10.2ms |
| Supertag + field query | 285ms | 15.8ms |
| Content search | 258ms | 21.4ms |
| createNode / setProperty | 0.16ms / 0.06ms | unchanged (healthy) |

50k smoke: seed + full-tree read + query all inside budgets, ~15s total.

## Consequences

- Convergence-invalidation narrowing (planned P3) lost its urgency: re-evaluating a whole view's live queries now costs tens of ms, not tens of seconds. Tracked, deprioritized.
- The Tana-scale answer is materially different now: boot is depth-bounded, wide lists are windowed, queries are interactive-speed at 10k and budget-gated against regression. Remaining honest gaps: per-node fetch breadth is unbounded (a 10k-direct-children node arrives in one payload even though it renders windowed), Surreal backend parity (canonical target) unchanged, no real-device render profiling yet.

## Process notes

- Two codex lanes ran concurrently (libs vs apps+e2e) — clean handoff, but full-suite e2e verdicts taken only on the settled tree; a mid-edit e2e run produced a misleading C8 signal first (the flake turned out pre-existing anyway).
- Verification rule held: both codex slices re-verified independently; the evaluator slice contained a real semantic regression (temporal `after` boundary) that only review caught — the 713-test suite had no boundary pin until now.
