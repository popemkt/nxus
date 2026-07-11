---
id: testing
scope: tests
principle: Traceability
enforcement: ci
gate: .github/workflows/ci.yml
guards: observation, I5
---

# Testing rule

Invalidated by: policy decisions about what tests are for and how they are named.

Tests are the executable half of the spec. The e2e suite under `e2e/` is the **behavioral proof layer**: when a `spec/product/` claim and an e2e assertion disagree, one of them is wrong and the disagreement MUST become a `DRIFT:` block ([drift.md](drift.md)).

**Why tests exist (exactly three purposes, no fourth).** Every test serves at least one of: (1) **verification** — proving a claimed behavior actually holds; (2) **regression protection** — inherent, because tests are never deleted (skips record divergence, deletion is vandalism); (3) **unwanted-side-effect elimination** — non-functional guarantees: perf budgets, incorrectness under concurrency, resource growth. Coverage percentage is never a purpose: a test written only to move a coverage number is noise and gets rejected in review. Corollary: an honest `(unguarded)` clause marker ([bdd-clauses.md](bdd-clauses.md)) beats a hollow test.

1. **Story-named behavior tests.** Test titles describe user-observable behavior in story form ("pressing Enter creates a sibling node below"), not implementation ("calls createNodeServerFn"). A reader of `--reporter=list` output should be reading a behavioral spec. New product behavior lands with an e2e or store-level behavior test naming the story.
2. **e2e as proof layer.** `pnpm e2e` (Playwright, `playwright.config.ts`) boots the full app constellation and runs ~85 specs across `e2e/{editor,workbench,calendar,core,recall,gateway}/`. CI runs the suite in an `ARCHITECTURE_TYPE: [node, graph]` matrix (`.github/workflows/ci.yml:70-78`). Unit tests (`pnpm test`, Vitest per project) prove component/store/service logic; they complement, never replace, the e2e proof of a product claim.
3. **`it.skip` / `test.skip` = drift.** A skip is a recorded, visible divergence between claimed and proven behavior — the test-suite twin of a `DRIFT:` block. Every skip MUST carry a reason string naming what would unskip it. Conditional skips encoding known capability gaps (e.g. `test.skip(isGraphMode, 'Calendar events not yet supported in graph mode')`, `e2e/calendar/event-crud.spec.ts:63`) MUST correspond to a `DRIFT:` block in the owning spec file. Deleting a failing test instead of skipping it is spec vandalism.
4. Tests MUST NOT paper over product bugs to pass. Data-availability skips (`e2e/workbench/node-inspector.spec.ts:16`) are tolerated but SHOULD be replaced by deterministic seeding.
5. **Coded behavior clauses.** Guarantees are written as coded Given/When/Then clauses in the owning spec file, and the guarding test carries the clause code in its title — see [bdd-clauses.md](bdd-clauses.md). Story-named titles (rule 1) and clause codes compose: `'REST-B4: returns 404 for an unknown action'`.

DRIFT: tests excluded from lint
- canonical: CI gates lint + typecheck + unit + e2e on every push/PR, covering test code.
- current: the typecheck job is live again (`.github/workflows/ci.yml:34-49`, re-enabled 2026-07-07 — the previous version of this block claiming it was commented out was stale), but tests are still excluded from oxlint entirely (`.oxlintrc.json:36-42`).
- impact: lint-level rule violations in tests merge silently; the [server-functions.md](server-functions.md) import ban does not cover test code, so a test can normalize an anti-pattern.
- closes: drop `**/*.test.ts` and `**/__tests__/**` from oxlint ignorePatterns and fix fallout.

**Drift mode:** this rule drifts via unexplained skips, implementation-named tests, and product claims with no proving test. Skips are greppable (`grep -rn "\.skip(" e2e/`); the skip↔DRIFT correspondence is enforced by review only.
