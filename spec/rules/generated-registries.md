---
id: generated-registries
scope: docs
principle: Single source of truth
enforcement: prose
gate: scripts/agent-hub-sync.mjs
guards: record
---

# Generated registries rule

Invalidated by: policy decisions about how derivable documentation is produced.

Per the placement question ([placement.md](placement.md)), text invalidated by **nothing** — fully derivable from code or config — MUST be generated, never hand-written. Hand-copying derivable facts creates N mirrors with no owner; every one observed in this repo has drifted (README said 3 apps, AGENTS.md said 4, the gateway routes 5 behind the launcher, 6 exist).

1. Applies to: the **app registry** (name/port/basePath — derivable from `package.json` scripts + `apps/nxus-gateway/vite.config.ts:16-22` + `apps/nxus-gateway/src/config/mini-apps.ts:9-50`), the **rules index** (`spec/rules/README.md` — derivable from rule frontmatter), doc manifests, and any future port/route/manifest table.
2. Generators are idempotent scripts wired as root package scripts ([dev-entrypoints.md](dev-entrypoints.md)) with a `--check` mode that fails CI on staleness. The working exemplar is the agent-hub sync: `pnpm agent:sync` regenerates, `pnpm agent:check` verifies (`scripts/agent-hub-sync.mjs`).
3. Generated files carry a `GENERATED — do not hand-edit` header naming their generator. Hand-editing one is a rule violation even when the edit is correct — fix the source instead.
4. Until a generator exists, the derivable table lives in exactly ONE hand-written home (currently: app registry table only in `spec/tech/architecture.md`; rules index only in `spec/rules/README.md`) and every other document links to it.

DRIFT: registries still hand-written, checks not in CI
- canonical: app registry and rules index are generated with CI-enforced `--check`; consumers (README, AGENTS.md) embed generated output.
- current: no generator exists for either; `spec/rules/README.md` is a hand-authored temporary index; app/port/path facts are still mirrored in code (`mini-apps.ts:9-50`, gateway `vite.config.ts:16-22`, per-app vite configs) and legacy docs; even the proven `pnpm agent:check` is not wired into `.github/workflows/ci.yml`.
- impact: each mirror drifts independently; agents ingest whichever copy they find first.
- closes: write the two generators, add their `--check` plus `agent:check` to CI, replace mirrors with generated includes or links.

**Drift mode:** this rule drifts when someone hand-edits a generated file or hand-copies a derivable table into prose. Detection: `--check` scripts where they exist; review for new tables of ports/paths/rule-lists elsewhere.
