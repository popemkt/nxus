# Nxus

A local-first, "everything is a node" personal knowledge ecosystem: one SQLite-backed node graph, many specialized app lenses (outline editor, node workbench, calendar, spaced repetition, app/tool hub), served under one origin via a dev gateway. Schema is attached to nodes via `#supertags`; everything is queryable and automatable. This repo is developed **spec-as-source** — the specs under [`spec/`](spec/README.md) are the artifact of record and the code is one materialization.

## Quick Start

```bash
pnpm install
pnpm dev        # starts all six apps in parallel (ports 3000-3005)
```

Then open the gateway at `http://localhost:3001/` — it fronts every app at its base path.

Run a single app:

```bash
pnpm dev:gateway    # port 3001, /
pnpm dev:core       # port 3000, /core
pnpm dev:workbench  # port 3002, /workbench
pnpm dev:calendar   # port 3003, /calendar
pnpm dev:recall     # port 3004, /recall
pnpm dev:editor     # port 3005, /editor
```

Note: `pnpm dev` force-kills anything bound to ports 3000-3005 first (`predev` script). These root `package.json` scripts are the only sanctioned launch surface — see [spec/rules/dev-entrypoints.md](spec/rules/dev-entrypoints.md).

## Apps

The canonical app/port/base-path registry lives in **[spec/tech/architecture.md](spec/tech/architecture.md)** (§4) — this table is a downstream copy.

| App | URL (dev) | Role |
|-----|-----------|------|
| nxus-gateway | `http://localhost:3001/` | Launcher landing page + dev reverse proxy (one-origin entry point) |
| nxus-core | `http://localhost:3000/core` | Hub: app/tool registry, command palette, terminal, inbox + automations, settings |
| nxus-workbench | `http://localhost:3002/workbench` | Node browser, inspector, 2D/3D graph, query builder |
| nxus-calendar | `http://localhost:3003/calendar` | Nodes-as-events calendar, Google 2-way sync |
| nxus-recall | `http://localhost:3004/recall` | FSRS spaced repetition + AI question generation |
| nxus-editor | `http://localhost:3005/editor` | Tana-style outline editor: supertags, fields, inline queries, backlinks |

## Repository Layout

```
apps/       # Runnable TanStack Start applications (thin shells where a paired lib exists)
libs/       # Shared libraries: @nxus/db, @nxus/ui, @nxus/workbench, @nxus/calendar, @nxus/mastra
spec/       # Normative specs (product / tech / rules) — the artifact of record
learnings/  # Hard-won substrate facts (tool/infra quirks)
e2e/        # Playwright behavioral proof layer
packages/   # Legacy — dead, do not add to
```

## Common Commands

```bash
pnpm test         # unit tests (Vitest, all projects)
pnpm e2e          # Playwright end-to-end tests
pnpm lint         # oxlint
pnpm typecheck    # tsc across all projects
```

Full command registry and toolchain contract: [spec/tech/toolchain.md](spec/tech/toolchain.md).

## Documentation

Start at **[spec/README.md](spec/README.md)** — it defines the reading path, placement rules, and doc layers. Agents start at [AGENTS.md](AGENTS.md) (a thin router into the spec tree). Legacy prose docs under [docs/](docs/index.md) are being folded into `spec/`; when they disagree, `spec/` wins.
