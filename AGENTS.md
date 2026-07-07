# Nxus — Agent Router

Nxus is a local-first, "everything is a node" personal knowledge ecosystem: one SQLite-backed node graph, many specialized app lenses, with the Tana-style outline editor and the node data model at its center. This repo is developed **spec-as-source**: the specs under `spec/` are the artifact of record and the code is one materialization. If you change behavior, the spec changes in the same commit ([spec/README.md](spec/README.md) defines the regime). This file is a router — it contains no rule bodies, no domain model, no setup guides. Follow the links.

## Principles (canonical home)

Layer 0 is the typed harness model — two membranes, the actor/process/artifact loop, invariants I1–I6 ([spec/rules/harness-model.md](spec/rules/harness-model.md)); every rule names the typed-model element it guards (`guards:` frontmatter). The six principles below are layer 1, derived lenses of that model; every rule in `spec/rules/` also traces to one of them:

1. **Separation of concerns** — one module, one reason to change; boundaries are explicit (client/server, product/tech, app/lib).
2. **Single source of truth** — every fact has exactly one hand-written home; duplicates are either generated or drift.
3. **Determinism** — same inputs, same outputs: reproducible builds, seeded tests, no hidden environment dependence.
4. **Traceability** — every normative claim cites evidence (`path:line`); every divergence is a searchable `DRIFT:` block, never silence.
5. **Fail-fast** — invalid states are unrepresentable or rejected at the boundary; no silent fallbacks, no swallowed errors.
6. **Minimizing accidental complexity** — the simplest design that satisfies the spec; delete before you abstract.

## Reading path

1. [spec/README.md](spec/README.md) — the placement rule, doc layers, and spec conventions. Read first, always.
2. The spec files your task touches — product behavior in `spec/product/`, implementation contracts in `spec/tech/`, workflow policy in `spec/rules/` ([index](spec/rules/README.md)).
3. [learnings/README.md](learnings/README.md) — before any build/tooling/infra work; it holds hard-won substrate facts (Vite, Playwright, SQLite quirks) that are cheaper to read than rediscover.

## Where things live

| What | Where |
|---|---|
| Product behavior (what nxus does) | [spec/product/](spec/product/) — vision, data-model, editor, per-app briefs |
| Implementation contracts (how it's built) | [spec/tech/](spec/tech/) — architecture, persistence, reactivity, editor-sync, toolchain |
| Workflow & coding rules | [spec/rules/](spec/rules/) (one rule per file; [README](spec/rules/README.md) is the index — hand-maintained placeholder until generated) |
| Substrate discoveries (tool/infra quirks) | [learnings/](learnings/) |
| Exploratory notes (dated, non-normative) | [docs/notes/](docs/notes/) |
| Frozen history | [docs/archived/](docs/archived/) |

`.claude/rules/*.md` are a thin session-loaded cache of `spec/rules/` content; update them in the same commit as the rule they cache.

## Code grounding

- **codebase-memory MCP** is indexed for this repo: use `search_graph` to locate symbols, `trace_path` for call chains, `get_code_snippet` to read definitions — prefer these over blind grepping for structural questions.
- The persisted graph artifact lives at `.codebase-memory/` in the repo root.
- e2e specs under `e2e/` are the behavioral proof layer; when spec and e2e disagree, record a `DRIFT:` block.

## Changing things

- Non-trivial changes run through the Archon workflows in [.archon/workflows/](.archon/workflows/README.md) — `feature-intake`, `bug-fix`, `spec-drift-check`, `tana-gap`. They are the sanctioned action entrypoints (enforcement is still prose; see the README's honest note).
- Follow the spec-first change workflow: [spec/rules/spec-first-change.md](spec/rules/spec-first-change.md).
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). No CHANGELOG ceremony.
- Known spec↔code divergence is marked `DRIFT:` (searchable) — record it, don't hide it.

## Running things

Dev entrypoints, ports, test/lint commands: [spec/tech/toolchain.md](spec/tech/toolchain.md). The app/port/base-path registry lives ONLY in [spec/tech/architecture.md](spec/tech/architecture.md).
