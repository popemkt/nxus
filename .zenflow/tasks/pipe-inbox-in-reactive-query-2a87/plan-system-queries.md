# Plan: Persist Inbox Queries as System Query Nodes

## Problem

The inbox queries (`pendingItems`, `processingItems`, `doneItems`, `allItems`) are currently hardcoded as ephemeral `QueryDefinition` objects in `inbox-reactive.server.ts`. They should be **persisted as system query nodes** with `systemId`s so they're:

1. **Discoverable** in the workbench node browser (under the `#Query` supertag group)
2. **Referenceable** by `systemId` (e.g., `query:inbox-pending`) instead of inline definitions
3. **Consistent** with the existing node-based architecture (everything is a node)

## Architecture

The infrastructure already exists:
- `supertag:query` — the `#Query` supertag (bootstrapped in `bootstrap.ts`)
- `field:query_definition` — JSON field for storing `QueryDefinition` on query nodes
- `CreateNodeOptions.systemId` — create a node with a stable system ID
- `nodeFacade.findNodeBySystemId()` — look up a node by its system ID
- `nodeFacade.evaluateQuery(definition)` — evaluate a `QueryDefinition` and return `AssembledNode[]`

The pattern follows exactly how `#ComputedField` and `#Automation` nodes work.

## Changes

### 1. Add system query constants to `node-schema.ts`

Add a `SYSTEM_QUERIES` constant (parallel to `SYSTEM_SUPERTAGS`, `SYSTEM_FIELDS`):

```typescript
export const SYSTEM_QUERIES = {
  INBOX_ALL: 'query:inbox-all',
  INBOX_PENDING: 'query:inbox-pending',
  INBOX_PROCESSING: 'query:inbox-processing',
  INBOX_DONE: 'query:inbox-done',
} as const
```

### 2. Create system query nodes in `bootstrap.ts`

Add a Step 5 that creates the 4 inbox query nodes:

```typescript
// Step 5: Create system query nodes
const systemQueries = [
  {
    systemId: SYSTEM_QUERIES.INBOX_ALL,
    content: 'Inbox: All Items',
    definition: { filters: [{ type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX }] },
  },
  {
    systemId: SYSTEM_QUERIES.INBOX_PENDING,
    content: 'Inbox: Pending Items',
    definition: {
      filters: [
        { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
        { type: 'property', fieldId: SYSTEM_FIELDS.STATUS as string, op: 'eq', value: 'pending' },
      ],
    },
  },
  // ... processingItems, doneItems
];

for (const q of systemQueries) {
  const id = upsertSystemNode(db, q.systemId, q.content, verbose);
  assignSupertag(db, id, querySupertag, supertagFieldId);
  assignSupertag(db, id, systemId, supertagFieldId, 1);  // Mark as #System
  setProperty(db, id, queryDefFieldId, JSON.stringify(q.definition));
}
```

This is idempotent — `upsertSystemNode` checks `systemId` and skips if already exists.

### 3. Add a `loadSystemQuery` helper in `inbox-reactive.server.ts`

Replace the hardcoded `INBOX_QUERIES` object with a function that loads query definitions from system nodes:

```typescript
async function loadSystemQueryDefinition(systemId: string): Promise<QueryDefinition> {
  const { nodeFacade, FIELD_NAMES } = await import('@nxus/db/server')
  await nodeFacade.init()
  const node = await nodeFacade.findNodeBySystemId(systemId)
  if (!node) throw new Error(`System query node not found: ${systemId}`)
  const defProp = node.properties[FIELD_NAMES.QUERY_DEFINITION]
  if (!defProp?.[0]) throw new Error(`No query definition on ${systemId}`)
  return JSON.parse(defProp[0].value as string) as QueryDefinition
}
```

### 4. Update `queryInboxItemsByStatus` to load from system nodes

Instead of passing inline `QueryDefinition` objects, pass the `systemId`:

```typescript
async function queryInboxItemsByStatus(querySystemId: string): Promise<InboxItem[]> {
  const { nodeFacade } = await import('@nxus/db/server')
  await nodeFacade.init()
  const definition = await loadSystemQueryDefinition(querySystemId)
  const result = await nodeFacade.evaluateQuery(definition)
  return result.nodes
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(nodeToInboxItem)
}
```

Then the 3 server functions become:
```typescript
export const getInboxPendingQueryServerFn = createServerFn({ method: 'GET' }).handler(async () => {
  const data = await queryInboxItemsByStatus(SYSTEM_QUERIES.INBOX_PENDING)
  return { success: true, data }
})
```

### 5. Update computed field definitions to reference system queries

The `INBOX_COMPUTED_FIELD_DEFS` currently embed inline `QueryDefinition` objects. They should instead load the definition from the system query node at init time. Since `ensureInboxReactiveInit` already runs at startup, it can load the query definitions once from the system nodes and pass them to `computedFieldService.create()`.

### 6. Keep `INBOX_QUERIES` as a fallback constant

Keep the inline `INBOX_QUERIES` object for test helpers (`getInboxQueries()`) and as a fallback in case the system query nodes haven't been bootstrapped yet. The runtime code path should prefer loading from system nodes.

### 7. Regenerate `nxus.db`

Run `npx tsx apps/nxus-core/scripts/db-seed.ts` to create the new system query nodes in the committed DB, then WAL checkpoint.

## Files Changed

| File | Change |
|------|--------|
| `libs/nxus-db/src/schemas/node-schema.ts` | Add `SYSTEM_QUERIES` constant |
| `libs/nxus-db/src/services/bootstrap.ts` | Add Step 5: create system query nodes with definitions |
| `apps/nxus-core/src/services/inbox/inbox-reactive.server.ts` | Replace inline queries with system node lookups |
| `libs/nxus-db/src/data/nxus.db` | Regenerate with new system query nodes |

## What Does NOT Change

- The route (`inbox.tsx`) — still calls the same 3 server functions
- The inbox-button and index route — still call `getInboxPendingQueryServerFn`
- The E2E tests — same behavior, just backed by system nodes now
- The `InboxItem` type and `nodeToInboxItem` conversion
