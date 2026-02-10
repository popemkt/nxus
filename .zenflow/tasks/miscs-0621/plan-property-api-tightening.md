# Plan: Tighten Property API Type Safety

## Problem

The property read/write API uses `string` everywhere, making it easy to mix up:
- **SystemId** (`'field:parent'`) — used for DB writes (`setProperty`, `addPropertyValue`, etc.)
- **FieldContentName** (`'parent'`, `'legacyId'`) — used for reading from `AssembledNode.properties`
- **UUID** — raw node IDs, also accepted by write functions

The current `resolveFieldKey` approach (accepting "either" at runtime) makes things worse — it hides bugs behind runtime guessing instead of catching them at compile time.

## Approach: Branded Types + Separate Signatures

### Step 1: Create branded types in `node-schema.ts`

```typescript
// Branded types to prevent mixing up field identifiers
declare const __fieldSystemId: unique symbol
declare const __fieldContentName: unique symbol

/** A field systemId like 'field:parent', 'field:status'. Used for write operations. */
export type FieldSystemId = string & { readonly [__fieldSystemId]: true }

/** A field content/display name like 'parent', 'legacyId'. Used for reading from AssembledNode. */
export type FieldContentName = string & { readonly [__fieldContentName]: true }
```

Make `SYSTEM_FIELDS` values typed as `FieldSystemId`:
```typescript
export const SYSTEM_FIELDS = {
  PARENT: 'field:parent' as FieldSystemId,
  ORDER: 'field:order' as FieldSystemId,
  // ... etc
} as const
```

Add a companion `FIELD_NAMES` constant typed as `FieldContentName`:
```typescript
export const FIELD_NAMES = {
  PARENT: 'parent' as FieldContentName,
  ORDER: 'order' as FieldContentName,
  COLOR: 'color' as FieldContentName,
  ICON: 'icon' as FieldContentName,
  LEGACY_ID: 'legacyId' as FieldContentName,
  CHECK_COMMAND: 'checkCommand' as FieldContentName,
  // ... matching every SYSTEM_FIELDS entry with its bootstrap content value
} as const
```

### Step 2: Tighten `AssembledNode.properties` key type

Change from `Record<string, PropertyValue[]>` to `Record<FieldContentName, PropertyValue[]>`:

```typescript
export interface AssembledNode {
  // ...
  properties: Record<FieldContentName, PropertyValue[]>
}
```

This means `node.properties[SYSTEM_FIELDS.PARENT]` will now be a **type error** (FieldSystemId ≠ FieldContentName). You must use `node.properties[FIELD_NAMES.PARENT]` or `getProperty(node, FIELD_NAMES.PARENT)`.

### Step 3: Tighten write API parameter types

```typescript
// setProperty accepts FieldSystemId (or plain string UUID, via overloads)
export function setProperty(
  db: Database,
  nodeId: string,
  fieldId: FieldSystemId,  // was: string
  value: unknown,
  order?: number,
): void

// Same for addPropertyValue, clearProperty, linkNodes
```

For cases where the fieldId is dynamic (e.g., `nodes.server.ts` iterating over a `properties` record, `automation.service.ts` using `action.fieldId`), the caller's input type needs to be `FieldSystemId`. This propagates the constraint upstream.

### Step 4: Tighten read API parameter types

```typescript
// getProperty accepts FieldContentName only
export function getProperty<T = unknown>(
  node: AssembledNode,
  fieldName: FieldContentName,  // was: string (or fieldKey)
): T | undefined

// Same for getPropertyValues
```

### Step 5: Remove `resolveFieldKey` and `isSystemId` usage in getProperty

The `resolveFieldKey` function I added earlier becomes unnecessary — it was a band-aid for the "accepts either" pattern. Remove it. `getProperty` just does `node.properties[fieldName]` directly.

### Step 6: Fix all call sites

**Read call sites (getProperty / getPropertyValues / node.properties[]):**

| File | Current | Fix |
|------|---------|-----|
| `tag.server.ts` | `getProperty(node, 'parent')` | `getProperty(node, FIELD_NAMES.PARENT)` |
| `tag.server.ts` | `getProperty(node, 'order')` | `getProperty(node, FIELD_NAMES.ORDER)` |
| `tag.server.ts` | `getProperty(node, 'color')` | `getProperty(node, FIELD_NAMES.COLOR)` |
| `tag.server.ts` | `getProperty(node, 'icon')` | `getProperty(node, FIELD_NAMES.ICON)` |
| `inbox.server.ts` | `getProperty(node, 'status')` etc. | `getProperty(node, FIELD_NAMES.STATUS)` |
| `node-items.server.ts` | Local duplicate `getProperty` + raw strings | Delete local duplicates, import from `@nxus/db/server`, use `FIELD_NAMES.*` |
| `calendar.server.ts` | `getProperty(node, 'start_date')` etc. | `getProperty(node, FIELD_NAMES.START_DATE)` |
| `google-sync.server.ts` | `getProperty(node, 'gcal_access_token')` etc. | `FIELD_NAMES.GCAL_ACCESS_TOKEN` |
| `query.server.ts` | `getProperty(node, 'queryDefinition')` etc. | `FIELD_NAMES.QUERY_DEFINITION` |
| `hierarchy-extractor.ts` | `node.properties[SYSTEM_FIELDS.PARENT]` | `node.properties[FIELD_NAMES.PARENT]` |
| `dependency-extractor.ts` | `node.properties[SYSTEM_FIELDS.DEPENDENCIES]` | `node.properties[FIELD_NAMES.DEPENDENCIES]` |
| `tag-synthesizer.ts` | `node.properties[SYSTEM_FIELDS.TAGS]` | `node.properties[FIELD_NAMES.TAGS]` |

**Write call sites (setProperty / addPropertyValue / clearProperty / linkNodes):**
- Already use `SYSTEM_FIELDS.*` — these just need the type to narrow from `string` to `FieldSystemId`, which happens automatically since `SYSTEM_FIELDS` values will be typed as `FieldSystemId`.

**Dynamic call sites requiring special attention:**
- `nodes.server.ts` lines 116-118, 184-185: `for (const [fieldSystemId, value] of Object.entries(properties))` — the `properties` input schema needs its keys typed as `FieldSystemId`. Since this comes from a Zod schema (`z.record(z.string(), ...)`), we cast the key: `setProperty(db, nodeId, fieldSystemId as FieldSystemId, value)`.
- `automation.service.ts` line 273: `action.fieldId` — the automation action type needs `fieldId: FieldSystemId`.
- `query-evaluator.service.ts`: `fieldId` in filter types — type as `FieldSystemId`.

### Step 7: Fix tests

- Update `node.service.test.ts` to use `FIELD_NAMES.*` for read assertions and `SYSTEM_FIELDS.*` for write operations
- Remove the systemId-acceptance tests I added (they tested the `resolveFieldKey` behavior which we're removing)
- Test that `'Path' as FieldContentName` works in the test's seeded data

### Step 8: Delete dead code

- Remove `resolveFieldKey()` from `node.service.ts`
- Remove the `isSystemId` import/usage from `getProperty`/`getPropertyValues` (it's still used in setProperty/addPropertyValue/clearProperty for event emission)
- Remove local `getProperty`/`getPropertyValues` duplicates from `node-items.server.ts`

## Key Design Decisions

1. **Branded types, not enums** — branded types are zero-cost at runtime (they compile away), but enforce correctness at compile time.

2. **`FIELD_NAMES` companion constant** — mirrors `SYSTEM_FIELDS` structure but with content names. Single source of truth for field content names.

3. **No "accepts either" pattern** — each function takes exactly one type. If you want to read, use `FieldContentName`. If you want to write, use `FieldSystemId`. TypeScript enforces this.

4. **`node.properties` keyed by `FieldContentName`** — makes direct property access type-safe too. `node.properties[SYSTEM_FIELDS.X]` becomes a type error.

## Files to modify

1. `libs/nxus-db/src/schemas/node-schema.ts` — branded types, SYSTEM_FIELDS typing, FIELD_NAMES
2. `libs/nxus-db/src/types/node.ts` — AssembledNode.properties key type
3. `libs/nxus-db/src/services/node.service.ts` — tighten function signatures, remove resolveFieldKey
4. `libs/nxus-db/src/services/bootstrap.ts` — no changes needed (already uses SYSTEM_FIELDS for writes)
5. `libs/nxus-db/src/services/node.service.test.ts` — update tests
6. `apps/nxus-core/src/services/tag.server.ts` — use FIELD_NAMES for reads
7. `apps/nxus-core/src/services/inbox/inbox.server.ts` — use FIELD_NAMES for reads
8. `apps/nxus-core/src/services/apps/node-items.server.ts` — delete local duplicates, use FIELD_NAMES
9. `libs/nxus-workbench/src/server/query.server.ts` — use FIELD_NAMES for reads
10. `libs/nxus-workbench/src/server/nodes.server.ts` — cast dynamic keys
11. `libs/nxus-workbench/src/features/graph/provider/extractors/hierarchy-extractor.ts` — FIELD_NAMES
12. `libs/nxus-workbench/src/features/graph/provider/extractors/dependency-extractor.ts` — FIELD_NAMES
13. `libs/nxus-workbench/src/features/graph/provider/utils/tag-synthesizer.ts` — FIELD_NAMES
14. `libs/nxus-calendar/src/server/calendar.server.ts` — FIELD_NAMES for reads
15. `libs/nxus-calendar/src/server/google-sync.server.ts` — FIELD_NAMES for reads
16. `libs/nxus-db/src/reactive/automation.service.ts` — type action.fieldId as FieldSystemId
17. `libs/nxus-db/src/reactive/computed-field.service.ts` — type fieldId params
18. `libs/nxus-db/src/services/query-evaluator.service.ts` — type fieldId in filter types
