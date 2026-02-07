# Server Functions Migration Plan

## Current State

`@nxus/workbench/server` still exports TanStack server functions with **top-level imports from `@nxus/db/server`**, which causes the `better-sqlite3` bundling issue when imported from non-`.server.ts` files.

### Files to Migrate

1. **`nodes.server.ts`** - Node CRUD + legacy Item/Tag adapters
   - `getNodeServerFn`
   - `getNodesBySupertagServerFn`
   - `updateNodeContentServerFn`
   - `createNodeServerFn`
   - `deleteNodeServerFn`
   - `setNodePropertiesServerFn`
   - `getAllItemsFromNodesServerFn`
   - `getItemByIdFromNodesServerFn`
   - `getAllTagsFromNodesServerFn`

2. **`search-nodes.server.ts`** - Search and navigation
   - `searchNodesServerFn`
   - `getSupertagsServerFn`
   - `getAllNodesServerFn`
   - `getBacklinksServerFn`
   - `getOwnerChainServerFn`
   - `getChildNodesServerFn`

3. **`graph.server.ts`** - Graph visualization
   - `getGraphStructureServerFn`
   - `getBacklinksWithDepthServerFn`
   - `getEdgesBetweenNodesServerFn`

4. **`adapters.ts`** - Legacy type converters (pure functions, not server functions)
   - `nodeToItem`
   - `nodeToTag`
   - `nodeToCommand`
   - `nodesToItems`

## Target Architecture

```
@nxus/db/server
├── Pure functions (evaluateQuery, createNode, assembleNode, etc.)
└── No TanStack dependency

nxus-core/src/services/
├── query/query.server.ts        ✅ DONE
├── nodes/nodes.server.ts        TODO
├── nodes/search.server.ts       TODO
├── nodes/graph.server.ts        TODO
└── nodes/adapters.ts            TODO (pure functions, can use top-level imports)
```

## Migration Pattern

Each server function needs to:

1. Use **dynamic imports inside handlers** for `@nxus/db/server`
2. Define validation schemas inline with Zod
3. Return typed results

Example:
```typescript
export const getNodeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, findNode } = await import('@nxus/db/server')
    const { identifier } = ctx.data

    initDatabase()
    const db = getDatabase()
    const node = findNode(db, identifier)

    if (!node) {
      return { success: false as const, error: 'Node not found' }
    }
    return { success: true as const, node }
  })
```

## Adapters Note

The adapter functions (`nodeToItem`, `nodeToTag`, etc.) are **pure functions**, not server functions. They can be migrated as-is since they'll only be called from within `.server.ts` file handlers where dynamic imports have already loaded `@nxus/db/server`.

## After Migration

1. Remove server function exports from `@nxus/workbench/server/index.ts`
2. Delete the migrated files from `@nxus/workbench/src/server/`
3. Update imports in `nxus-core` to use local wrappers
4. Keep `graph.types.ts` in workbench (client-safe types)

## Current Imports to Update

Files importing from `@nxus/workbench/server`:
- `packages/nxus-core/src/services/apps/apps.server.ts` - uses `getAllItemsFromNodesServerFn`
- `packages/nxus-core/src/services/nodes/index.ts` - re-exports many functions
- Various scripts in `packages/nxus-core/scripts/`
