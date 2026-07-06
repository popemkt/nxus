---
id: testing
scope: tests
principle: Traceability
enforcement: ci
gate: .github/workflows/ci.yml
---

# Testing rule

Invalidated by: policy decisions about what tests are for and how they are named.

Tests are the executable half of the spec. The e2e suite under `e2e/` is the **behavioral proof layer**: when a `spec/product/` claim and an e2e assertion disagree, one of them is wrong and the disagreement MUST become a `DRIFT:` block ([drift.md](drift.md)).

1. **Story-named behavior tests.** Test titles describe user-observable behavior in story form ("pressing Enter creates a sibling node below"), not implementation ("calls createNodeServerFn"). A reader of `--reporter=list` output should be reading a behavioral spec. New product behavior lands with an e2e or store-level behavior test naming the story.
2. **e2e as proof layer.** `pnpm e2e` (Playwright, `playwright.config.ts`) boots the full app constellation and runs ~85 specs across `e2e/{editor,workbench,calendar,core,recall,gateway}/`. CI runs the suite in an `ARCHITECTURE_TYPE: [node, graph]` matrix (`.github/workflows/ci.yml:70-78`). Unit tests (`pnpm test`, Vitest per project) prove component/store/service logic; they complement, never replace, the e2e proof of a product claim.
3. **`it.skip` / `test.skip` = drift.** A skip is a recorded, visible divergence between claimed and proven behavior — the test-suite twin of a `DRIFT:` block. Every skip MUST carry a reason string naming what would unskip it. Conditional skips encoding known capability gaps (e.g. `test.skip(isGraphMode, 'Calendar events not yet supported in graph mode')`, `e2e/calendar/event-crud.spec.ts:63`) MUST correspond to a `DRIFT:` block in the owning spec file. Deleting a failing test instead of skipping it is spec vandalism.
4. Tests MUST NOT paper over product bugs to pass. Data-availability skips (`e2e/workbench/node-inspector.spec.ts:16`) are tolerated but SHOULD be replaced by deterministic seeding.

DRIFT: CI typecheck disabled
- canonical: CI gates lint + typecheck + unit + e2e on every push/PR.
- current: the typecheck job is commented out pending stale test types (`.github/workflows/ci.yml:29-42`); tests are excluded from oxlint entirely (`.oxlintrc.json:36-42`).
- impact: type regressions and rule violations in tests merge silently; the [typescript.md](typescript.md) and [server-functions.md](server-functions.md) gates do not cover test code.
- closes: fix `libs/nxus-db/src/reactive/__tests__/automation.test.ts` types, re-enable the job, drop tests from oxlint ignorePatterns.

**Drift mode:** this rule drifts via unexplained skips, implementation-named tests, and product claims with no proving test. Skips are greppable (`grep -rn "\.skip(" e2e/`); the skip↔DRIFT correspondence is enforced by review only.
