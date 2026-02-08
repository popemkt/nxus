# Project Information

- **Project**: Nxus - local-first, node-based application ecosystem
- **Framework**: Vite / React / TanStack Start
- **Structure**: Nx monorepo with `apps/` (runnable apps) and `libs/` (shared libraries)

## Applications

| App | Package | Port | Base Path | Location |
|-----|---------|------|-----------|----------|
| Gateway | `@nxus/gateway` | 3001 | `/` | `apps/nxus-gateway` |
| Core | `nxus-core` | 3000 | `/core` | `apps/nxus-core` |
| Workbench | `@nxus/workbench-app` | 3002 | `/workbench` | `apps/nxus-workbench` |

## How to Run

```bash
# Start all apps simultaneously
pnpm dev

# Start individual apps
pnpm dev:gateway    # Gateway at http://localhost:3001/
pnpm dev:core       # Core at http://localhost:3000/core
pnpm dev:workbench  # Workbench at http://localhost:3002/workbench
```

## Useful Nx Commands

- **List all projects**: `npx nx show projects`
- **Show project details**: `npx nx show project nxus-core`
- **View project graph**: `npx nx graph`
