# Overnight remodel report — 2026-07-07

Date: 2026-07-07 (~00:00–08:00, session ended early: user left for work)
Verdict: harness shipped, editor healed, typecheck honest-and-green except core-app (WIP).

## Shipped (committed + pushed, `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `5640eda` | chore: untracked ~45 debug PNGs + tool caches |
| `60d0741` | fix(db): FIELD_NAMES ↔ bootstrap parity (live prod bug: all field types silently degraded to 'text') + latent bootstrap RangeError crash + parity regression test |
| `1ebf840` | docs: **spec-as-source harness** — AGENTS.md router (CLAUDE.md symlink), spec/product + spec/tech + spec/rules (11 rules, frontmatter, honest enforcement column), learnings/, ~50 DRIFT blocks, .claude/rules rewritten as thin true caches, README/HUMANS de-drifted, committed codebase-memory graph artifact |
| `c48d9d3` | feat(harness): **archon workflows** as sanctioned entrypoints (feature-intake, bug-fix, spec-drift-check, tana-gap) — validated via `archon workflow list` |
| `4f13d97` | fix(types): workspace typecheck repaired + made honest (~500 masked errors; JsonValue for property/filter values; every app got a real `tsc --noEmit` script — editor/core had echo-disabled targets) |
| `19917bc` | fix(editor): **all 12 failing e2e behaviors** — Escape double-handling killed select-mode (one-line stopPropagation after diagnosis via live browser), system nodes leaked into workspace root, order-swap no-op on tied keys (rebalance-on-tie), e2e isolated DB (NXUS_DB_PATH, was mutating the dev's real DB) |
| `b71fc41` | feat(editor): **undo/redo persist** structural ops (pure snapshot differ + restoreNode soft-delete inverse; fields/supertags DRIFT narrowed) |
| `ee677b2` | feat(editor): wired the dead 1,019-line SupertagConfigPanel (hover gear on badges → inline popover) |
| `ce47411` | **wip (INCOMPLETE)**: dead-code sweep + core-app typecheck |

## Current gate status

- typecheck: green everywhere EXCEPT `@nxus/core-app` (WIP commit `ce47411` is mid-repair; rerun `npx nx run @nxus/core-app:typecheck` to see remainder)
- unit tests: green at last full run pre-WIP (602+124 etc.)
- editor e2e: 33 passed / 0 failed; full e2e: one flaky `e2e/core/inbox.spec.ts` C8 (passes isolated)
- lint: 0 errors (~120 warnings)

## How to continue (in order)

1. **Finish `ce47411`**: fix remaining `@nxus/core-app` typecheck errors (same recipes: branded types via SYSTEM_FIELDS/FIELD_NAMES constants, QueryFilter required-default fields, JsonValue at parse boundaries, delete-don't-fix anything in the §dead-code list of the repo map). Then full gates + un-WIP the commit message story.
2. **Theme dedup** (repo-map §4#2): 6 copies of the 19-palette theme system in every app's `__root.tsx` → ThemeProvider in `@nxus/ui` (~1,000 lines). Was queued for Codex; not started.
3. **Options-from-supertag field feature**: Codex was launched with a full spec-first prompt and stopped seconds later — prompt preserved in git history / re-runnable; not started.
4. **Node-API consolidation** (spec/tech/architecture.md DR-1): triplicated node server-fn layer — biggest remaining structural DRIFT.
5. **Tana gap backlog**: scratchpad recon ranked top-10 (formula fields #1, boolean query grammar #2, extends config UI #3…) — recon file was session-local; regenerate via `.archon/workflows/tana-gap.yaml` or re-run recon.
6. CI: wire `pnpm typecheck` + lint + `agent:check` into CI per spec/tech/toolchain.md DRIFT blocks.

## Learnings from tonight (worth keeping in mind)

- Anthropic API was unstable most of the night: subagents stalled/died repeatedly; the e2e-diagnose workflow burned 1.7M tokens and died. Mitigations that worked: small-step instructions to agents, resuming via SendMessage, doing surgical diagnosis inline, Codex CLI as an independent channel.
- nx cache lies after config changes — `pnpm typecheck` "green" was stale twice; `npx nx reset` before trusting a gate.
- The three editor root causes were found by driving the real app (playwright MCP + store instrumentation via `import('/editor/src/stores/outline.store.ts')` from page context) — faster and more certain than static reading.
