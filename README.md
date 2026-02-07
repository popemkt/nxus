# Nxus

A local-first, node-based application ecosystem for managing apps, tools, scripts, and repositories.

## Quick Start

```bash
pnpm install
pnpm dev
```

This starts all three mini-apps:

| App | URL | Description |
|-----|-----|-------------|
| Gateway | `http://localhost:3001/` | Landing page with links to all mini-apps |
| Core | `http://localhost:3000/core` | App management, commands, settings |
| Workbench | `http://localhost:3002/workbench` | Node browser and graph explorer |

## Project Structure

```
apps/                          # Runnable applications
├── nxus-gateway/              # Landing page (port 3001)
├── nxus-core/                 # Main app (port 3000, /core)
└── nxus-workbench/            # Workbench app (port 3002, /workbench)

libs/                          # Shared libraries
├── nxus-ui/                   # UI components (shadcn/ui)
├── nxus-db/                   # Database layer (SQLite + SurrealDB)
├── nxus-workbench/            # Node management library
└── nxus-calendar/             # Calendar integration

packages/                      # Legacy
├── _commands/                 # CLI commands
└── repos/                     # Repository configs
```

## Development

```bash
pnpm dev              # Start all apps
pnpm dev:gateway      # Gateway only
pnpm dev:core         # Core only
pnpm dev:workbench    # Workbench only
```

## Nx Commands

```bash
npx nx show projects  # List all projects
npx nx graph          # Visualize dependency graph
npx nx sync           # Sync TypeScript project references
```

## Documentation

See [`docs/`](docs/index.md) for detailed documentation, or [`AGENTS.md`](AGENTS.md) for AI development guidelines.
