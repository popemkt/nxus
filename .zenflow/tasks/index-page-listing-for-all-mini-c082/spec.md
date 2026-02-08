# Technical Specification: Gateway App & Nx Convention Restructuring

## Technical Context

| Aspect | Detail |
|--------|--------|
| **Framework** | TanStack Start (React Router v1.132.0) + Vite 7.1.7 + Nitro |
| **Language** | TypeScript 5.9.2, React 19.2.0 |
| **Package Manager** | pnpm 10.15.0 (workspace protocol) |
| **Build System** | Nx 22.3.3 (plugin-based discovery, no project.json files) |
| **Database** | SQLite (better-sqlite3/Drizzle ORM) + SurrealDB |
| **State** | Zustand + TanStack Query |
| **Styling** | Tailwind CSS 4.0.6 + shadcn/ui via @nxus/ui |
| **SSR** | Nitro server runtime for TanStack Start server functions |

### Nx Discovery

No `project.json` files exist. Nx discovers projects via the `@nx/js/typescript` plugin configured in `nx.json`, which scans `packages/*` for `package.json` files. After restructuring, this plugin config must be updated to scan `apps/*` and `libs/*` as well.

### TypeScript Strategy

- **Libraries** (`nxus-db`, `nxus-workbench`): Extend `tsconfig.base.json`, use `composite: true`, `nodenext` module resolution, emit declarations only.
- **UI library** (`nxus-ui`): Uses `tsconfig.lib.json` with `bundler` module resolution (React JSX).
- **Apps** (`nxus-core`): Standalone tsconfig with `bundler` resolution, `noEmit: true`, path aliases (`@/*` → `./src/*`), and `references` to consumed libs.

### Key Patterns

- **Server functions**: Use `createServerFn` from `@tanstack/react-start`. External library server code is dynamically imported inside handlers to avoid client bundling.
- **SSR config**: Vite's `ssr.noExternal` forces server-only packages (`@nxus/db`, `@nxus/workbench`) to be bundled server-side. `optimizeDeps.exclude` prevents them from being pre-bundled for the client.

---

## Implementation Approach

### Phase 1: Monorepo Restructuring (move packages to apps/ and libs/)

**Strategy**: Use `git mv` for all moves to preserve git history. Do NOT copy files — move them.

#### 1a. Create directory structure

```bash
mkdir -p apps libs
```

#### 1b. Move libraries to libs/

```bash
git mv packages/nxus-db libs/nxus-db
git mv packages/nxus-ui libs/nxus-ui
git mv packages/nxus-workbench libs/nxus-workbench
```

#### 1c. Move nxus-core app to apps/

```bash
git mv packages/nxus-core apps/nxus-core
```

#### 1d. Update pnpm-workspace.yaml

```yaml
packages:
  - apps/*
  - libs/*
  - packages/*
```

Keep `packages/*` for `_commands` and `repos`.

#### 1e. Update nx.json plugin discovery

The `@nx/js/typescript` plugin's `exclude`/`include` patterns reference `packages/nxus-ui/*`. Update to `libs/nxus-ui/*`.

#### 1f. Update tsconfig references

All `tsconfig.json` files that use relative `references` paths must be updated:

- `apps/nxus-core/tsconfig.json`: references change from `../nxus-*` to `../../libs/nxus-*`
- `libs/nxus-workbench/tsconfig.json`: references change from `../nxus-ui` and `../nxus-db` to `./nxus-ui` → no, they become `../nxus-ui` and `../nxus-db` (same relative since they're all under `libs/`)
- `libs/nxus-db/tsconfig.json`: extends changes from `../../tsconfig.base.json` to same (still `../../` since `libs/nxus-db/` is same depth as `packages/nxus-db/`)

Actually: depth stays the same (`apps/nxus-core/` = 2 levels, same as `packages/nxus-core/`), so `../../tsconfig.base.json` paths remain valid. The cross-references between libs stay the same too (`../nxus-ui`). Only nxus-core references change since it moves from `packages/` to `apps/` (peer libs are now in `libs/` not `packages/`):

**apps/nxus-core/tsconfig.json references**:
```json
"references": [
  { "path": "../../libs/nxus-workbench" },
  { "path": "../../libs/nxus-ui" },
  { "path": "../../libs/nxus-db" }
]
```

#### 1g. Update Vite config watch paths

`apps/nxus-core/vite.config.ts` has watch ignore patterns referencing `**/packages/repos/**`. Update to match new structure if needed.

#### 1h. Update Vite SSR/optimizeDeps config

The `ssr.noExternal` and `optimizeDeps.exclude` reference `@nxus/db` and `@nxus/workbench` by package name (not path), so these remain unchanged.

#### 1i. Reinstall dependencies

```bash
pnpm install
```

pnpm workspace resolution uses package names (`workspace:*`), not paths, so all `@nxus/db`, `@nxus/ui`, `@nxus/workbench` imports continue to work after `pnpm-workspace.yaml` is updated.

#### 1j. Verify

```bash
nx graph                    # Check project graph is correct
nx run nxus-core:dev        # Verify core app starts
nx run nxus-core:typecheck  # Verify types resolve
```

---

### Phase 2: Decouple workbench from nxus-core

#### 2a. Remove /nodes route from nxus-core

Delete `apps/nxus-core/src/routes/nodes.tsx`.

#### 2b. Remove @nxus/workbench dependency from nxus-core

In `apps/nxus-core/package.json`, remove `"@nxus/workbench": "workspace:*"`.

In `apps/nxus-core/vite.config.ts`:
- Remove `@nxus/workbench` from `optimizeDeps.exclude`
- Remove `@nxus/workbench` from `ssr.noExternal`

In `apps/nxus-core/tsconfig.json`:
- Remove the `{ "path": "../../libs/nxus-workbench" }` reference

#### 2c. Clean up any remaining workbench imports in nxus-core

Search for `@nxus/workbench` imports in `apps/nxus-core/src/` and remove them. The `nodes.tsx` route was the only consumer, but verify no other files reference it.

#### 2d. Verify nxus-core still works without workbench

```bash
nx run nxus-core:dev
nx run nxus-core:typecheck
```

---

### Phase 3: Create nxus-workbench app shell

#### 3a. Create app directory structure

```
apps/nxus-workbench/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    router.tsx
    routeTree.gen.ts    # Generated by TanStack Router
    styles.css
    routes/
      __root.tsx
      index.tsx          # Mounts NodeWorkbenchRoute
```

#### 3b. package.json

Based on nxus-core's package.json but minimal — only dependencies needed for the workbench:

```json
{
  "name": "@nxus/workbench-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3002",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@nxus/db": "workspace:*",
    "@nxus/ui": "workspace:*",
    "@nxus/workbench": "workspace:*",
    "@tailwindcss/vite": "^4.0.6",
    "@tanstack/react-devtools": "^0.7.0",
    "@tanstack/react-query": "^5.90.12",
    "@tanstack/react-router": "^1.132.0",
    "@tanstack/react-start": "^1.132.0",
    "@tanstack/router-plugin": "^1.132.0",
    "@vitejs/plugin-react": "^5.0.4",
    "better-sqlite3": "^12.6.0",
    "nitro": "latest",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwindcss": "^4.0.6",
    "vite-tsconfig-paths": "^5.1.4",
    "zustand": "^5.0.9"
  },
  "devDependencies": {
    "@tanstack/devtools-vite": "^0.3.11",
    "@types/better-sqlite3": "^7.6.13",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^5.7.2",
    "vite": "^7.1.7"
  }
}
```

#### 3c. vite.config.ts

Mirrors nxus-core's config but with workbench-specific SSR settings:

```typescript
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitro(),
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    viteReact(),
  ],
  optimizeDeps: {
    exclude: ['better-sqlite3', 'drizzle-orm/better-sqlite3', '@nxus/db', '@nxus/workbench'],
  },
  build: {
    rollupOptions: { external: ['better-sqlite3'] },
  },
  ssr: {
    noExternal: ['@nxus/db', '@nxus/workbench'],
  },
})
```

#### 3d. Routes

**`__root.tsx`**: Minimal root with QueryClientProvider and theme support (borrow theme logic from nxus-core's `__root.tsx`).

**`index.tsx`**: Mounts `NodeWorkbenchRoute` from `@nxus/workbench`:
```typescript
import { createFileRoute } from '@tanstack/react-router'
import { NodeWorkbenchRoute } from '@nxus/workbench'

export const Route = createFileRoute('/')({ component: () => <NodeWorkbenchRoute /> })
```

#### 3e. Verify

```bash
pnpm install
nx run @nxus/workbench-app:dev  # Should serve workbench at localhost:3002
```

---

### Phase 4: Create nxus-gateway app

#### 4a. Create app directory structure

```
apps/nxus-gateway/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    router.tsx
    routeTree.gen.ts
    styles.css
    config/
      mini-apps.ts       # Static manifest of available mini-apps
    routes/
      __root.tsx
      index.tsx           # Gateway landing page
```

#### 4b. package.json

Minimal — no database, no workbench:

```json
{
  "name": "@nxus/gateway",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3001",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@nxus/ui": "workspace:*",
    "@tailwindcss/vite": "^4.0.6",
    "@tanstack/react-query": "^5.90.12",
    "@tanstack/react-router": "^1.132.0",
    "@tanstack/react-start": "^1.132.0",
    "@tanstack/router-plugin": "^1.132.0",
    "@vitejs/plugin-react": "^5.0.4",
    "nitro": "latest",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwindcss": "^4.0.6",
    "vite-tsconfig-paths": "^5.1.4"
  },
  "devDependencies": {
    "@tanstack/devtools-vite": "^0.3.11",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^5.7.2",
    "vite": "^7.1.7"
  }
}
```

#### 4c. Mini-apps manifest

```typescript
// src/config/mini-apps.ts
export interface MiniApp {
  id: string
  name: string
  description: string
  icon: string       // Phosphor icon name
  path: string       // URL path
  port: number       // Dev server port
}

export const miniApps: MiniApp[] = [
  {
    id: 'nxus-core',
    name: 'Core',
    description: 'Development tool manager — browse, configure, and run your dev toolkit',
    icon: 'Command',
    path: '/core',
    port: 3000,
  },
  {
    id: 'nxus-workbench',
    name: 'Workbench',
    description: 'Node workbench — Tana-inspired knowledge graph and query builder',
    icon: 'Graph',
    path: '/workbench',
    port: 3002,
  },
]
```

#### 4d. Gateway index page

A clean grid of mini-app cards using `@nxus/ui` components. Each card is an `<a>` link (not React Router Link, since navigation crosses app boundaries).

#### 4e. Theme support

Reuse the same `nxus-theme` localStorage key and theme classes from `@nxus/ui`. The gateway's `__root.tsx` includes the inline theme script from nxus-core.

#### 4f. Verify

```bash
pnpm install
nx run @nxus/gateway:dev  # Should serve gateway at localhost:3001
```

---

### Phase 5: Multi-app serving & dev experience

#### 5a. Development proxy script

Create a root-level script or Nx target that:
1. Starts all three apps on their respective ports (3000, 3001, 3002)
2. Runs a lightweight H3/Nitro proxy on port 3333 that routes:
   - `/` → localhost:3001 (gateway)
   - `/core/*` → localhost:3000 (nxus-core)
   - `/workbench/*` → localhost:3002 (workbench)

Alternatively, use `concurrently` or Nx's `run-many` to start all apps.

#### 5b. Base path configuration

Each app needs its Vite `base` configured:
- Gateway: `base: '/'`
- nxus-core: `base: '/core'` (or TanStack Router's `basepath` option)
- Workbench: `base: '/workbench'`

TanStack Router supports a `basePath` option in `createRouter()`:
```typescript
const router = createRouter({ routeTree, basePath: '/core' })
```

#### 5c. Root package.json scripts

```json
{
  "scripts": {
    "dev": "nx run-many --target=dev --projects=@nxus/gateway,nxus-core,@nxus/workbench-app",
    "dev:gateway": "nx run @nxus/gateway:dev",
    "dev:core": "nx run nxus-core:dev",
    "dev:workbench": "nx run @nxus/workbench-app:dev"
  }
}
```

---

## Source Code Structure Changes

### Files moved (via `git mv`)

| From | To |
|------|----|
| `packages/nxus-core/` | `apps/nxus-core/` |
| `packages/nxus-db/` | `libs/nxus-db/` |
| `packages/nxus-ui/` | `libs/nxus-ui/` |
| `packages/nxus-workbench/` | `libs/nxus-workbench/` |

### Files deleted

| File | Reason |
|------|--------|
| `apps/nxus-core/src/routes/nodes.tsx` | Workbench route moved to its own app |

### Files created

| File | Purpose |
|------|---------|
| `apps/nxus-gateway/` (entire directory) | New gateway app |
| `apps/nxus-workbench/` (entire directory) | New workbench app shell |

### Files modified

| File | Change |
|------|--------|
| `pnpm-workspace.yaml` | Add `apps/*` and `libs/*` |
| `nx.json` | Update plugin include/exclude patterns |
| `apps/nxus-core/tsconfig.json` | Update reference paths |
| `apps/nxus-core/package.json` | Remove `@nxus/workbench` dependency |
| `apps/nxus-core/vite.config.ts` | Remove workbench from SSR/optimizeDeps, update watch paths |
| `apps/nxus-core/src/router.tsx` | Add `basePath: '/core'` |
| `package.json` (root) | Add dev scripts |

---

## Data Model / API / Interface Changes

**None.** The database schema, server functions, and API contracts are unchanged. This is purely a structural/routing refactor.

---

## Delivery Phases (Incremental, Testable Milestones)

| Phase | Deliverable | Verification |
|-------|-------------|--------------|
| **1** | Monorepo restructured (`apps/` + `libs/`) | `nx graph` shows correct deps, `nxus-core:dev` works, `nxus-core:typecheck` passes |
| **2** | Workbench decoupled from nxus-core | nxus-core runs without workbench dependency, `/nodes` route removed |
| **3** | Workbench app shell created | Workbench accessible at its own port, all features work |
| **4** | Gateway app created | Gateway shows mini-app list, links work |
| **5** | Multi-app dev experience | All apps start together, base paths configured, proxy routes correctly |

Each phase is independently verifiable. If a phase fails, previous phases remain stable.

---

## Verification Approach

### After Phase 1 (restructuring)
```bash
pnpm install
nx graph                         # Visual check: deps are correct
nx run nxus-core:typecheck       # Types resolve across new paths
nx run nxus-core:dev             # App starts and works at localhost:3000
nx run @nxus/workbench:typecheck # Lib types resolve
nx run @nxus/db:typecheck        # DB lib types resolve
```

### After Phase 2 (decouple workbench)
```bash
nx run nxus-core:dev             # Core works without workbench
# Manually verify: /nodes route returns 404
# Manually verify: all other routes (/, /apps/:id, /inbox, /settings) work
```

### After Phase 3 (workbench app)
```bash
nx run @nxus/workbench-app:dev   # Workbench starts at localhost:3002
# Manually verify: node browser, graph view, query builder all work
```

### After Phase 4 (gateway)
```bash
nx run @nxus/gateway:dev         # Gateway starts at localhost:3001
# Manually verify: mini-app cards render, links point to correct paths
```

### After Phase 5 (integration)
```bash
pnpm dev                         # All apps start
# Manually verify via proxy: / → gateway, /core → core, /workbench → workbench
```
