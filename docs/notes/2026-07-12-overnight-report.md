# Overnight report — 2026-07-11/12

Non-normative session record. Follow-up to the reliability sprint (same day, earlier): docs/notes/2026-07-11-reliability-sprint.md.

## Shipped (all on `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `c54e5da` | **INV-8 per-node write queue** — issue-order server writes, temp→server chain migration, multi-node barrier; closes INV-7's ordering clause. First BDD-coded clauses (INV8-B1..B6) |
| `b7b4149` | **REST adapter** (`@nxus/rest`) — registry-driven GET /actions + POST /actions/:id; review caught an unhandled URIError crash (REST-B4) |
| `0188757` | **BDD clause convention** (spec/rules/bdd-clauses.md) — coded Given/When/Then as the spec unit for guarantees |
| `33528a8` | **Tana UX synthesis + extracted production design tokens** (app.tana.inc bundle, per-value provenance); 3-purpose testing philosophy canonized |
| `8b8fd69` | **Production plan** — blockers, Tailscale-first hosting, P1–P5 workstreams |
| `112adc4` | **BDD retrofit wave 1** — 26 coded clauses across 4 contracts + `clauses:check` CI gate |
| `301e859` | Graph node-identity contract (spec) |
| `e0ae675` | **T1/T2 theming** — six duplicated ~115-var styles.css token blocks → one `@nxus/ui` token layer + additive `--nx-*` Tana-informed roles; one-hue→light/dark supertag color derivation |
| `7d25763` | **Graph-skip burndown** — 13 of 20 graph-mode e2e skips removed (mode-aware seed helper, Surreal UUIDv7 record ids, `⟨⟩` normalization); 7 kept with verified root causes |
| `8ba3b1d` | **Reactive fail-fast** — graph mode now throws instead of silently evaluating a disconnected SQLite copy (REACT-B1/B2) |
| `d1a7ffc` | **Calendar in graph mode** — supertag catalog self-heal (STAG-B1) + fail-fast createNode (STAG-B2); 4 more skips removed |
| `2792b9c` | `.env.example` + stale nested lockfile deleted |
| `f46f0ec` | **Graph bootstrap parity** — all 19 system entity supertag definition nodes (STAG-B2's fail-fast exposed the seed aborting on the missing #Inbox row — the old silent-skip had been shipping untagged inbox items) |
| `(morning)` | **Backend-parity perf budgets** — env-gated benchmark running the same four API ops through both backends; first cross-backend numbers: @1k nodes surreal/sqlite = seed 5.2×, query 17.7×, assemble 5.9×, children-batch 16.3× — Surreal read paths scale worse than SQLite's (tracked) |

## Delegation record

Codex lanes (gpt-5.6-sol/terra) delivered the graph-skip burndown, REST adapter, token layer, and the reactive guard; codex ran out of credits mid-night (lane F relaunched on a Sonnet subagent, which stalled twice on long-running commands — self-heal finished by hand). All delegated output reviewed; gates re-derived independently before each commit.

## Findings worth remembering

- Tana's production theme is publicly extractable: app.tana.inc serves its full CSS unauthenticated. Their "feel" is latency + static state feedback, not animation (motion tokens exist but are 50–200ms micro-transitions).
- The graph mode's remaining warts were all the same shape as the reliability sprint's: silent fallbacks (skip-and-continue supertag RELATE, reactive layer computing against the wrong database). Both now fail fast.
- `StringRecordId` truncates unquoted hyphenated keys; typed `RecordId` + client-generated UUIDv7 keys sidestep the whole v3 id-quirk class.
- Sonnet agents stall on >10-min silent commands (watchdog); codex lanes wedge or die on credits — long e2e gates belong on the main thread with `run_in_background`.

## Honest residue (tracked as tasks)

- #26: one `Node not found` per graph e2e run (a delete for an already-deleted/never-created node, somewhere in the undo path) — needs live repro; the empty-child skip documents it.
- #27: BT1 supertag-base-type fixture still SQLite-seeded; 4 formula/query-builder skips retryable on the self-heal.
- #4: per-query convergence invalidation (deprioritized).
- Editor/workbench `vite build` blocked by pre-existing `@nxus/db` `fileURLToPath` browser-import leak (production plan P1).
- Production plan P1–P5 not started beyond quick wins (.env.example, lockfile).
- Full local e2e legs unverifiable at push time: the machine entered active daytime use (load 22–58), inflating runs 20× with pure-timeout failures (zero error-signature lines). Unit estate (736 db + 141 editor), tsc ×5, both checkers, and focused graph calendar/core runs are green locally; the CI node×graph matrix is the authoritative full-leg verdict for this push.
- Theming T3 (component migration onto `--nx-*` roles) and T4 (panels, quick-capture, onboarding) enumerated in the synthesis note.
