# Server Functions Migration Plan

## Current State

The migration from `@nxus/workbench/server` to local nxus-core services is **complete** for Item/Command adapters and query functions. Node CRUD and search/graph server functions remain in `@nxus/workbench` (which is now a separate app concern).

### What was migrated to nxus-core

1. **`apps/node-items.server.ts`** - Item/Command adapters + server functions
   - `nodeToItem` (adapter)
   - `nodeToCommand` (adapter)
   - `getAllItemsFromNodesServerFn`
   - `getItemByIdFromNodesServerFn`

2. **`query/query.server.ts`** - Query execution (previously migrated)

### What remains in `@nxus/workbench`

These are workbench-specific concerns (node browsing, graph visualization, search):

- `nodes.server.ts` - Generic node CRUD (`getNodeServerFn`, `createNodeServerFn`, etc.)
- `search-nodes.server.ts` - Node search and navigation
- `graph.server.ts` - Graph visualization queries
- `query.server.ts` - Saved query execution

## Architecture

```
@nxus/db/server
├── Pure functions (evaluateQuery, createNode, assembleNode, etc.)
└── No TanStack dependency

apps/nxus-core/src/services/
├── apps/node-items.server.ts   ✅ Item/Command adapters + server functions
├── apps/apps.server.ts         ✅ Uses node-items.server via dynamic import
└── query/query.server.ts       ✅ Query execution

libs/nxus-workbench/src/server/
├── nodes.server.ts             Generic node CRUD (workbench concern)
├── search-nodes.server.ts      Node search (workbench concern)
├── graph.server.ts             Graph visualization (workbench concern)
└── query.server.ts             Saved queries (workbench concern)
```

## Import Pattern

All `@nxus/db/server` imports in server functions use **dynamic imports inside handlers** to prevent Vite from bundling `better-sqlite3` into the client bundle:

```typescript
export const myServerFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { initDatabase, getDatabase } = await import('@nxus/db/server')
    // ...
  })
```
