# Technical Specification: Nx Package Separation

## 1. Technical Context

### Current Stack
- **Framework**: TanStack Start (SSR) + TanStack Router + React 19
- **Build**: Vite 7.1.7 + pnpm workspaces
- **Monorepo**: Nx 22.3.3
- **Database**: SQLite (better-sqlite3) + Drizzle ORM + SurrealDB (graph)
- **State**: Zustand + TanStack React Query
- **TypeScript**: 5.7.2

### Key Findings from Analysis

| Aspect | Finding | Implication |
|--------|---------|-------------|
| UI Components | Node features have ZERO cross-feature imports | Can extract without @nxus/ui package |
| Router | TanStack Router auto-discovers routes in `src/routes/` | External routes need manual registration |
| Server Functions | `createServerFn` exports cleanly from library packages | No special handling needed |
| Legacy Schema | Cleanly separable, no circular dependencies | Include in @nxus/db |
| Feature Toggle | `ARCHITECTURE_TYPE` controls legacy vs node queries | Both systems coexist safely |

---

## 2. Package Architecture

### Final Structure

```
packages/
├── nxus-db/                      # NEW: Data layer package
│   ├── src/
│   │   ├── schemas/
│   │   │   ├── node-schema.ts    # nodes, nodeProperties tables
│   │   │   ├── item-schema.ts    # items, itemCommands, itemTags, tags
│   │   │   ├── inbox-schema.ts   # inbox table
│   │   │   └── index.ts          # Re-exports all schemas
│   │   ├── services/
│   │   │   ├── node.service.ts   # Node CRUD + assembly
│   │   │   └── index.ts
│   │   ├── client/
│   │   │   ├── master-client.ts  # Master DB init (nxus.db)
│   │   │   ├── graph-client.ts   # SurrealDB client
│   │   │   └── ephemeral-factory.ts  # Factory for app-specific ephemeral DBs
│   │   ├── types/
│   │   │   ├── node.ts
│   │   │   ├── item.ts
│   │   │   └── index.ts
│   │   ├── constants/
│   │   │   └── system.ts         # SYSTEM_SUPERTAGS, SYSTEM_FIELDS
│   │   └── index.ts              # Public API barrel
│   ├── package.json
│   └── tsconfig.json
│
├── nxus-workbench/               # NEW: Node browser UI package
│   ├── src/
│   │   ├── components/
│   │   │   ├── NodeBrowser.tsx
│   │   │   ├── NodeInspector.tsx
│   │   │   ├── SupertagSidebar.tsx
│   │   │   └── shared/
│   │   │       ├── NodeBadge.tsx
│   │   │       ├── NodeLink.tsx
│   │   │       └── SupertagChip.tsx
│   │   ├── server/
│   │   │   └── nodes.server.ts   # Server functions
│   │   ├── hooks/
│   │   │   └── use-node-queries.ts
│   │   ├── route.tsx             # The /nodes route component
│   │   └── index.ts              # Public API
│   ├── package.json
│   └── tsconfig.json
│
├── nxus-core/                    # MODIFIED: Main app (orchestrator)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── __root.tsx        # Providers (unchanged structure)
│   │   │   ├── index.tsx         # AppManager (stays)
│   │   │   ├── nodes.tsx         # MODIFIED: imports from @nxus/workbench
│   │   │   └── ...
│   │   ├── db/
│   │   │   └── ephemeral-items/  # App-specific ephemeral (renamed)
│   │   │       ├── schema.ts
│   │   │       └── client.ts
│   │   ├── services/
│   │   │   ├── apps/             # Uses @nxus/db schemas
│   │   │   └── ...
│   │   └── components/
│   │       ├── ui/               # shadcn components (stay here)
│   │       └── features/
│   │           ├── gallery/      # AppManager features (stay)
│   │           └── nodes/        # REMOVED: moved to @nxus/workbench
│   └── package.json
```

### Dependency Graph

```
┌─────────────────┐
│   nxus-core     │  (main app)
│  - AppManager   │
│  - Route mount  │
└────────┬────────┘
         │ depends on
         ├──────────────────────┐
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ nxus-workbench  │───▶│    nxus-db      │
│  - NodeBrowser  │    │  - schemas      │
│  - /nodes route │    │  - node.service │
└─────────────────┘    │  - db clients   │
                       └─────────────────┘
                               ▲
                               │ depends on
┌─────────────────┐            │
│ [future-app]    │────────────┘
│  - own routes   │
│  - own ephemeral│
└─────────────────┘
```

---

## 3. Implementation Approach

### Phase 1: Create @nxus/db Package (Foundation)

**Goal**: Extract data layer without breaking nxus-core

#### 1.1 Generate Nx Library
```bash
nx g @nx/js:library nxus-db --directory=packages/nxus-db --bundler=tsc --unitTestRunner=vitest
```

#### 1.2 Move Files (bulk operations)
Source → Destination mapping:

| Source (nxus-core/src/) | Destination (@nxus/db/src/) |
|-------------------------|------------------------------|
| `db/schema.ts` | `schemas/item-schema.ts` |
| `db/node-schema.ts` | `schemas/node-schema.ts` |
| `types/item.ts` | `types/item.ts` |
| `types/workflow.ts` | `types/workflow.ts` |
| `types/command.ts` | `types/command.ts` |
| `types/command-params.ts` | `types/command-params.ts` |
| `services/nodes/node.service.ts` | `services/node.service.ts` |
| `db/client.ts` | `client/master-client.ts` |
| `db/graph-client.ts` | `client/graph-client.ts` |
| `db/columns.ts` | `schemas/columns.ts` |

#### 1.3 Create Public API (`index.ts`)
```typescript
// @nxus/db public API

// Schemas
export * from './schemas/node-schema'
export * from './schemas/item-schema'
export * from './schemas/columns'

// Types
export type { Item, ItemCommand, Tag } from './types/item'
export type { AssembledNode, NodeProperty } from './types/node'

// Services
export { NodeService } from './services/node.service'
export type { NodeQueryOptions } from './services/node.service'

// Clients
export { initDatabase, getDatabase } from './client/master-client'
export { initGraph, getGraph } from './client/graph-client'
export { createEphemeralDb } from './client/ephemeral-factory'

// Constants
export { SYSTEM_SUPERTAGS, SYSTEM_FIELDS } from './constants/system'
```

#### 1.4 Ephemeral DB Factory Pattern
```typescript
// client/ephemeral-factory.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

export interface EphemeralDbConfig {
  appName: string           // e.g., 'items', 'my-mini-app'
  schema: Record<string, unknown>  // Drizzle schema
  basePath?: string         // Default: ~/.popemkt/.nxus/
}

export function createEphemeralDb<T extends Record<string, unknown>>(
  config: EphemeralDbConfig
): ReturnType<typeof drizzle<T>> {
  const dbPath = `${config.basePath ?? getDefaultPath()}/ephemeral-${config.appName}.db`
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { schema: config.schema as T })
}
```

### Phase 2: Create @nxus/workbench Package

**Goal**: Extract node browser UI as standalone package

#### 2.1 Generate Nx Library
```bash
nx g @nx/react:library nxus-workbench --directory=packages/nxus-workbench --bundler=vite --unitTestRunner=vitest
```

#### 2.2 Move Components (bulk)
| Source (nxus-core/src/) | Destination (@nxus/workbench/src/) |
|-------------------------|-------------------------------------|
| `components/features/nodes/node-browser/` | `components/NodeBrowser.tsx` |
| `components/features/nodes/node-inspector/` | `components/NodeInspector.tsx` |
| `components/features/nodes/supertag-sidebar/` | `components/SupertagSidebar.tsx` |
| `components/features/nodes/shared/` | `components/shared/` |
| `services/nodes/nodes.server.ts` | `server/nodes.server.ts` |
| `services/nodes/search-nodes.server.ts` | `server/search-nodes.server.ts` |

#### 2.3 Handle UI Component Dependencies

**Finding**: Node components import from `@/components/ui/` (shadcn)

**Solution**: Peer dependency + import alias
```json
// packages/nxus-workbench/package.json
{
  "peerDependencies": {
    "nxus-core": "*"  // For UI components access
  }
}
```

```typescript
// packages/nxus-workbench/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/components/ui/*": ["../nxus-core/src/components/ui/*"],
      "@/lib/*": ["../nxus-core/src/lib/*"]
    }
  }
}
```

**Alternative**: Copy shadcn components to workbench (increases duplication but removes coupling)

#### 2.4 Route Export Pattern

Since TanStack Router auto-discovers only from main app's `src/routes/`, we export the component:

```typescript
// @nxus/workbench/src/route.tsx
import { NodeBrowser } from './components/NodeBrowser'
import { NodeInspector } from './components/NodeInspector'
import { SupertagSidebar } from './components/SupertagSidebar'

export function NodeWorkbenchRoute() {
  // Full route component logic here
  return (
    <div className="flex h-screen">
      <SupertagSidebar />
      <NodeBrowser />
      <NodeInspector />
    </div>
  )
}
```

```typescript
// nxus-core/src/routes/nodes.tsx
import { createFileRoute } from '@tanstack/react-router'
import { NodeWorkbenchRoute } from '@nxus/workbench'

export const Route = createFileRoute('/nodes')({
  component: NodeWorkbenchRoute,
})
```

#### 2.5 Server Functions Export
```typescript
// @nxus/workbench/src/server/nodes.server.ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { NodeService, getDatabase, initDatabase } from '@nxus/db'

export const getNodeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(async (ctx) => {
    initDatabase()
    const db = getDatabase()
    const node = NodeService.findNode(db, ctx.data.identifier)
    return node ? { success: true, node } : { success: false, error: 'Not found' }
  })

// Re-export from package index
// @nxus/workbench/src/index.ts
export { getNodeServerFn, getAllNodesServerFn } from './server/nodes.server'
```

### Phase 3: Update nxus-core

**Goal**: Wire up new packages, rename ephemeral

#### 3.1 Update Dependencies
```json
// packages/nxus-core/package.json
{
  "dependencies": {
    "@nxus/db": "workspace:*",
    "@nxus/workbench": "workspace:*"
  }
}
```

#### 3.2 Update Import Paths
Global find/replace in nxus-core:

| Old Import | New Import |
|------------|------------|
| `from '../../db/schema'` | `from '@nxus/db'` |
| `from '../../db/node-schema'` | `from '@nxus/db'` |
| `from '../../types/item'` | `from '@nxus/db'` |
| `from '../../services/nodes/node.service'` | `from '@nxus/db'` |
| `from '../nodes/nodes.server'` | `from '@nxus/workbench'` |

#### 3.3 Rename Ephemeral DB
```
nxus-core/src/db/ephemeral.ts → nxus-core/src/db/ephemeral-items/
```

Update all imports referencing ephemeral schema to new path.

#### 3.4 Remove Moved Files
After verifying everything works:
- Delete `nxus-core/src/components/features/nodes/`
- Delete `nxus-core/src/services/nodes/` (except adapters if needed)
- Delete moved db/types files

---

## 4. Source Code Structure Changes

### Files Created
```
packages/nxus-db/
├── src/
│   ├── schemas/
│   │   ├── node-schema.ts
│   │   ├── item-schema.ts
│   │   ├── inbox-schema.ts
│   │   ├── columns.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── node.service.ts
│   │   └── index.ts
│   ├── client/
│   │   ├── master-client.ts
│   │   ├── graph-client.ts
│   │   └── ephemeral-factory.ts
│   ├── types/
│   │   ├── node.ts
│   │   ├── item.ts
│   │   └── index.ts
│   ├── constants/
│   │   └── system.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
└── vite.config.ts

packages/nxus-workbench/
├── src/
│   ├── components/
│   │   ├── NodeBrowser.tsx
│   │   ├── NodeInspector.tsx
│   │   ├── SupertagSidebar.tsx
│   │   └── shared/
│   │       ├── NodeBadge.tsx
│   │       ├── NodeLink.tsx
│   │       └── SupertagChip.tsx
│   ├── server/
│   │   ├── nodes.server.ts
│   │   └── search-nodes.server.ts
│   ├── hooks/
│   │   └── use-node-queries.ts
│   ├── route.tsx
│   └── index.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Files Modified
```
packages/nxus-core/
├── src/
│   ├── routes/
│   │   └── nodes.tsx              # Simplified: imports from @nxus/workbench
│   ├── db/
│   │   ├── ephemeral-items/       # RENAMED from ephemeral.ts
│   │   │   ├── schema.ts
│   │   │   └── client.ts
│   │   └── (removed: schema.ts, node-schema.ts, client.ts, graph-client.ts)
│   ├── services/
│   │   ├── apps/
│   │   │   ├── apps.server.ts     # Updated imports to @nxus/db
│   │   │   └── apps-mutations.server.ts
│   │   ├── tag.server.ts          # Updated imports
│   │   └── (removed: nodes/ directory)
│   ├── components/
│   │   └── features/
│   │       └── (removed: nodes/ directory)
│   └── types/
│       └── (removed: item.ts, workflow.ts, etc.)
├── package.json                   # Added @nxus/db, @nxus/workbench deps
└── tsconfig.json                  # Updated paths
```

### Files Deleted (after migration)
```
packages/nxus-core/src/
├── db/
│   ├── schema.ts
│   ├── node-schema.ts
│   ├── client.ts
│   ├── graph-client.ts
│   └── columns.ts
├── services/nodes/
│   ├── node.service.ts
│   ├── nodes.server.ts
│   └── search-nodes.server.ts
├── components/features/nodes/
│   └── (entire directory)
└── types/
    ├── item.ts
    ├── workflow.ts
    ├── command.ts
    └── command-params.ts
```

---

## 5. Data Model / API Changes

### No Schema Changes
The SQLite schema remains identical. This is purely a code organization change.

### Public API: @nxus/db

```typescript
// Types
export type Item = { id: string; name: string; ... }
export type ItemCommand = { id: string; appId: string; ... }
export type Tag = { id: number; name: string; ... }
export type AssembledNode = { uuid: string; systemId: string; ... }
export type NodeProperty = { uuid: string; nodeUuid: string; ... }

// Schemas (Drizzle tables)
export const items: SQLiteTable
export const itemCommands: SQLiteTable
export const itemTags: SQLiteTable
export const tags: SQLiteTable
export const nodes: SQLiteTable
export const nodeProperties: SQLiteTable

// Services
export const NodeService: {
  findNode(db, identifier): AssembledNode | null
  createNode(db, data): AssembledNode
  updateNode(db, uuid, data): AssembledNode
  deleteNode(db, uuid): boolean
  queryNodes(db, options): AssembledNode[]
  // ... other methods
}

// Clients
export function initDatabase(): void
export function getDatabase(): BetterSqlite3Database
export function initGraph(): void
export function getGraph(): Surreal
export function createEphemeralDb<T>(config): DrizzleDb<T>

// Constants
export const SYSTEM_SUPERTAGS: Record<string, string>
export const SYSTEM_FIELDS: Record<string, string>
```

### Public API: @nxus/workbench

```typescript
// Route Component
export function NodeWorkbenchRoute(): JSX.Element

// Server Functions
export const getNodeServerFn: ServerFn<{ identifier: string }, NodeResult>
export const getAllNodesServerFn: ServerFn<QueryOptions, NodesResult>
export const searchNodesServerFn: ServerFn<SearchOptions, NodesResult>
export const getSupertagsServerFn: ServerFn<void, SupertagsResult>

// Components (optional exports for customization)
export { NodeBrowser } from './components/NodeBrowser'
export { NodeInspector } from './components/NodeInspector'
export { SupertagSidebar } from './components/SupertagSidebar'
```

---

## 6. Delivery Phases

### Phase 1: Foundation (@nxus/db) - Core
1. Create nxus-db package structure
2. Move schemas (node-schema, item-schema, columns)
3. Move types (item, node, workflow, command)
4. Move node.service.ts
5. Move database clients (master, graph)
6. Create ephemeral-factory
7. Create barrel exports (index.ts)
8. Update tsconfig paths
9. **Verify**: Package builds, exports work

### Phase 2: Integration (nxus-core → @nxus/db)
1. Add @nxus/db dependency to nxus-core
2. Update import paths in apps.server.ts
3. Update import paths in tag.server.ts
4. Update import paths in other services
5. Rename ephemeral.ts → ephemeral-items/
6. Delete moved files from nxus-core
7. **Verify**: `nx build nxus-core` succeeds, app runs

### Phase 3: Workbench Extraction
1. Create nxus-workbench package structure
2. Move node components (NodeBrowser, NodeInspector, etc.)
3. Move server functions (nodes.server.ts)
4. Configure peer dependency on nxus-core (for UI)
5. Create NodeWorkbenchRoute export
6. **Verify**: Package builds

### Phase 4: Final Integration
1. Update nxus-core/routes/nodes.tsx to import from @nxus/workbench
2. Add @nxus/workbench dependency
3. Delete moved files from nxus-core
4. **Verify**: Full app runs, /nodes route works

### Phase 5: Testing & Documentation
1. Add unit tests to @nxus/db (node.service.ts)
2. Add integration tests for cross-package imports
3. Add example of mini-app using @nxus/db
4. Document public APIs

---

## 7. Verification Approach

### Build Verification
```bash
# After each phase
nx build nxus-db
nx build nxus-workbench
nx build nxus-core

# Full build
nx run-many -t build
```

### Type Check
```bash
nx run-many -t typecheck
```

### Lint
```bash
nx run-many -t lint
```

### Runtime Verification
```bash
# Start dev server
nx dev nxus-core

# Manual checks:
# 1. Navigate to / (AppManager) - should work
# 2. Navigate to /nodes (Workbench) - should work
# 3. Create/edit nodes - should persist
# 4. Switch architecture modes - should work
```

### Test Commands
```bash
# Unit tests (after adding)
nx test nxus-db
nx test nxus-workbench

# Integration tests
nx e2e nxus-core-e2e  # If exists
```

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Circular dependencies | @nxus/db has ZERO imports from other packages |
| Route discovery breaks | Manual registration in nxus-core/routes/nodes.tsx |
| UI component coupling | Peer dependency + path aliases (or copy components) |
| SSR issues with library routes | Server functions export cleanly per analysis |
| Import path breakage | Use automated refactoring, incremental verification |
| Legacy mode breaks | Keep all legacy schemas in @nxus/db |

---

## 9. TypeScript Configuration

### tsconfig.base.json (root)
```json
{
  "compilerOptions": {
    "paths": {
      "@nxus/db": ["packages/nxus-db/src/index.ts"],
      "@nxus/workbench": ["packages/nxus-workbench/src/index.ts"]
    }
  }
}
```

### packages/nxus-db/tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

### packages/nxus-workbench/tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "paths": {
      "@nxus/db": ["../nxus-db/src/index.ts"],
      "@/components/ui/*": ["../nxus-core/src/components/ui/*"],
      "@/lib/*": ["../nxus-core/src/lib/*"]
    }
  },
  "include": ["src/**/*"]
}
```

---

## 10. Decision Log

| Decision | Rationale |
|----------|-----------|
| Include legacy schemas in @nxus/db | Clean separation possible, no circular deps |
| Keep UI components in nxus-core | Zero cross-feature imports, no @nxus/ui needed |
| Use peer dependency for UI access | Simpler than copying shadcn components |
| Export route component, not route config | TanStack Router auto-discovery limitation |
| Keep adapters.ts in nxus-core | Bridges legacy/node systems at app level |
| Create ephemeral-factory helper | Consistent pattern for mini-app ephemeral DBs |
