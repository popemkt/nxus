# Getting Started with Nxus

> **Note**: launch commands and the app registry are owned by the spec — [spec/tech/toolchain.md](../spec/tech/toolchain.md) (commands) and [spec/tech/architecture.md](../spec/tech/architecture.md) (apps/ports/paths). This page is a convenience walkthrough; when it disagrees with the spec or `package.json` scripts, those win.

## Prerequisites

- **Node.js** 20+
- **pnpm** (see `packageManager` in `package.json`)
- **Git**

The SQLite database is created and seeded automatically on first run — there is no separate migration step.

## Installation

```bash
git clone https://github.com/popemkt/nxus.git
cd nxus
pnpm install
pnpm dev
```

`pnpm dev` starts all six apps in parallel (ports 3000-3005; it force-kills anything already bound to those ports). Open the gateway at `http://localhost:3001/` — it fronts every app at its base path. Single-app variants (`pnpm dev:editor`, `pnpm dev:core`, …) and the full app table: see [README.md](../README.md).

## First Steps

1. **Command palette** — press `Cmd+K` (or `Ctrl+K`) in core to search apps and commands.
2. **Explore the graph** — open the workbench (`/workbench`) to browse nodes, inspect properties, and run queries.
3. **Try the editor** — open `/editor` for the Tana-style outline: create nodes, tag them with `#supertags`, fill fields.
4. **Install an app** — in core, find an item tagged `#remote-repo` and use its **Install** command to clone it locally.

## Troubleshooting

- **Seed data**: `pnpm --filter @nxus/core-app db:seed` re-seeds the core app data.
- **Port conflicts**: `pnpm dev`'s `predev` hook already kills ports 3000-3005; if an app still fails to bind, check `lsof -i :<port>`.

For the data model see [spec/product/data-model.md](../spec/product/data-model.md); for architecture see [spec/tech/architecture.md](../spec/tech/architecture.md).
