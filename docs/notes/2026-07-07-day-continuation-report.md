# Day continuation report — 2026-07-07

Date: 2026-07-07 (daytime session, continues the overnight remodel — see [2026-07-07-overnight-remodel-report.md](2026-07-07-overnight-remodel-report.md))
Verdict: typecheck honest-green across all 12 projects; Tana top-4 gaps shipped; harness re-rooted on the typed model with all five review gaps closed; one real hydration regression caught and fixed same-day.

## Shipped (committed + pushed, `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `2114c35` | fix(core): core-app typecheck finished (spread-destroyed discriminated union, dead workflow.description, tagId z.number→z.string) |
| `3b700fa` | feat(editor): References split into Mentioned/Referenced (Tana parity) |
| `ee69578` + `aa96e46` | docs: harness review vs the typed-loop model; all five gaps closed same day |
| `1feac80` | fix(types): gateway/workbench/recall typecheck (recall server fns never returned failure branch) |
| `d7c3c7c` | docs(harness): **layer-0 typed model** as root; `guards:` frontmatter on every rule (typed-model elements, not stabilizers — intent-holder correction incorporated) |
| `951b2ba` | refactor(ui): theme dedup into @nxus/ui ThemeProvider (−527 lines) |
| `3cd378d` | feat(harness): spec-first CI gate + typecheck + agent:check jobs live |
| `d9b4c09` | feat(harness): durable elicitation sign-off in feature-intake (G1) |
| `90bb2f5` | refactor(node-api): **DR-1** — canonical node-API surface in @nxus/node-api, three drifting stacks deleted |
| `6bc3488` | docs: Tana gap recon regenerated against the live app (prior top-3 corrected) |
| `4baa99e` + `6fd9ceb` | Gates: commit-trailer convention (G3); app-registry drift check in CI (G4) |
| `d165b80` | feat(fields): **formula fields** — assembly-time computed values, dependency-free evaluator (Tana gap #1) |
| `3ee0cd4` | test(e2e): move test owns its nodes (ownerId-not-field:parent discovery) |
| `36eda43` | feat(supertags): **multi-parent DAG inheritance**, I4 asymmetry fixed (Tana gap #2) |
| `cbaa5cc` | feat(editor): **inline mention backlinks** — `[[node:<id>]]` tokens, `[[` autocomplete, Mentioned fills (Tana gap #3) |
| `cf192d9` | fix(ui): **hydration regression** — @nxus/ui/theme subpath (barrel import in __root delayed hydration; e2e clicks hit dead SSR buttons; bisect-pinned to 951b2ba) |
| `ef7e5e0` | feat(query): **nested logical groups + path-filter authoring** (Tana gap #4) + bootstrap cross-process race DRIFT |

## Gate status (end of session)

- typecheck: green, all 12 projects, verified after `nx reset` (cache not trusted)
- unit: nxus-db 629/633, workbench 155/155, core 172, gateway 11 — all green
- e2e editor+workbench (today's touched surface): **47 passed / 6 skipped / 0 failed**
- e2e full suite, 1 worker (CI-equivalent): 82 passed / 2 failed — core gallery C2/C3, order-dependent (pass isolated AND at overnight baseline; DRIFT recorded in toolchain.md §6)
- lint: 0 errors
- CI now gates: lint, agent:check, app-registry check, typecheck, spec-first coupling, unit, e2e

## Delegation ledger

Codex (until credits ran out midday): backlinks split, theme dedup, DR-1, formula fields, multi-parent inheritance — all green-gated. Sonnet subagents: three typecheck sweeps, Tana recon (live app), inline mentions, query-builder authoring. Every delegated slice independently re-verified before commit.

## Known open items (ordered)

1. **Base UI Select press-open/release-select hazard** — a slow click on any Select can silently choose the first option (`alignItemWithTrigger`, `libs/nxus-ui/src/components/select.tsx:81`). Product-wide UX bug, found via e2e traces. Candidate: `alignItemWithTrigger={false}`.
2. **Bootstrap cross-process race** — DRIFT in persistence.md; close with `INSERT ... ON CONFLICT DO NOTHING`.
3. **Core e2e order-dependence** — gallery C2/C3 + inbox C8; DRIFT in toolchain.md; close by seeding-isolation treatment.
4. Tana gap #5+ — supertag base-type, palette unification (Cmd+S/Cmd+K), multi-panel, schema tiers, auto-initialize, view tabs (docs/notes/2026-07-07-tana-gap-recon.md).
5. Harness: ontology-as-data extraction from the 1d essay (the "connect to source of truth" end-state in spec/rules/harness-model.md); rules-index generator; `hook` matrix cell still empty.
6. Codex credits: refill to restore the second delegation channel (memory updated with the caveat).
