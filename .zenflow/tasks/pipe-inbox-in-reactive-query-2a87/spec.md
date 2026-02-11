# Technical Specification: Pipe Inbox in Reactive Query

## Difficulty: Hard

Complex feature touching multiple layers (data model, server functions, reactive service integration, UI components, route creation). Requires careful coordination between the existing reactive system, inbox CRUD, and new UI. Many edge cases around initialization ordering, UUID resolution, and reactive lifecycle management.

---

## Technical Context

- **Language**: TypeScript (strict)
- **Framework**: TanStack Start (server functions) + TanStack Router (file-based routing) + React
- **Database**: SQLite via Drizzle ORM + better-sqlite3 (node architecture mode)
- **Reactive System**: Custom in-memory event bus + query subscriptions + computed fields + automations (`libs/nxus-db/src/reactive/`)
- **UI Library**: `@nxus/ui` (Base UI + Tailwind v4 + CVA + Phosphor Icons)
- **State Management**: Zustand, TanStack React Query
- **Test Framework**: Vitest (unit), Playwright (E2E)
- **Monorepo**: Nx + pnpm workspaces
- **Key Packages**:
  - `libs/nxus-db` — Database layer, node schema, reactive system services
  - `apps/nxus-core` — Core app (inbox lives here)
  - `libs/nxus-ui` — Shared UI components

---

## Implementation Approach

### Core Insight

The inbox already uses `nodeFacade.createNode()`, `nodeFacade.setProperty()`, `nodeFacade.deleteNode()` which internally call `node.service.ts` functions that emit `MutationEvent`s to the `eventBus`. The reactive system (query subscriptions, computed fields, automations) subscribes to these events. Therefore, **no changes to existing inbox CRUD code are needed** — we only need to:

1. Initialize the reactive services with the database
2. Create computed fields for inbox metrics
3. Create automation definitions from templates
4. Build the UI to display metrics and manage automations

### Architecture

```
Existing Inbox CRUD (inbox.server.ts → nodeFacade → node.service.ts)
  ↓ createNode / setProperty / deleteNode
  ↓ (already emits MutationEvents via eventBus)
  ↓
EventBus (singleton in @nxus/db)
  ↓
QuerySubscriptionService          ComputedFieldService
  ↓                                  ↓
AutomationService ←── threshold ── onValueChange()
  ↓
Actions: set_property, add_supertag, webhook
```

### Important: UUID Resolution

The reactive system works with node **UUIDs**, not systemIds. Query filters like `{ type: 'supertag', supertagId: 'supertag:inbox' }` need to use the actual UUID of the `supertag:inbox` node. The query evaluator in `libs/nxus-db/src/services/query-evaluator.service.ts` accepts systemIds and resolves them internally. However, the computed field and automation definitions store these in their JSON definitions — we need to verify that the query evaluator handles systemId-to-UUID resolution at evaluation time (it does, via `getFieldOrSupertagNode()`).

### Important: Initialization Strategy

The reactive server functions in `libs/nxus-workbench/src/server/reactive.server.ts` use `initDatabaseWithBootstrap()` for each call. Our inbox reactive server functions should follow the same pattern but also lazily initialize the reactive services (computedFieldService, automationService) once per server lifecycle.

---

## Source Code Structure Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/nxus-core/src/services/inbox/inbox-reactive.server.ts` | Server functions for inbox reactive features (init, metrics, automation CRUD, templates) |
| `apps/nxus-core/src/routes/inbox.automations.tsx` | Route for `/inbox/automations` page |
| `apps/nxus-core/src/components/features/inbox/inbox-metrics-bar.tsx` | Metrics display bar at top of inbox |
| `apps/nxus-core/src/components/features/inbox/inbox-automations-page.tsx` | Automation management page component |
| `apps/nxus-core/src/components/features/inbox/create-automation-modal.tsx` | Modal for creating automations from templates |
| `apps/nxus-core/src/stores/inbox-automations.store.ts` | Zustand store for automation UI state (modal open/close, selected template) |
| `apps/nxus-core/src/services/inbox/__tests__/inbox-reactive.test.ts` | Unit tests for template expansion and server function logic |

### Modified Files

| File | Change |
|------|--------|
| `libs/nxus-db/src/schemas/node-schema.ts` | Add `ARCHIVED_AT` to `SYSTEM_FIELDS` and `FIELD_NAMES` |
| `libs/nxus-db/src/services/bootstrap.ts` | Add `archivedAt` field definition to `commonFields` array |
| `apps/nxus-core/src/routes/inbox.tsx` | Add `InboxMetricsBar` component at top of page |

---

## Data Model Changes

### New System Field: `ARCHIVED_AT`

Add to `libs/nxus-db/src/schemas/node-schema.ts`:

```typescript
// In SYSTEM_FIELDS:
ARCHIVED_AT: 'field:archived_at' as FieldSystemId,

// In FIELD_NAMES:
ARCHIVED_AT: 'archivedAt' as FieldContentName,
```

Add to `libs/nxus-db/src/services/bootstrap.ts` in the `commonFields` array:

```typescript
{ systemId: SYSTEM_FIELDS.ARCHIVED_AT, content: 'archivedAt', fieldType: 'text' },
```

### Automation Supertag & Computed Field Supertag

Already exist in the system:
- `SYSTEM_SUPERTAGS.AUTOMATION` = `'supertag:automation'`
- `SYSTEM_SUPERTAGS.COMPUTED_FIELD` = `'supertag:computed_field'`

### Automation & Computed Field System Fields

Already exist:
- `SYSTEM_FIELDS.AUTOMATION_DEFINITION`, `AUTOMATION_STATE`, `AUTOMATION_LAST_FIRED`, `AUTOMATION_ENABLED`
- `SYSTEM_FIELDS.COMPUTED_FIELD_DEFINITION`, `COMPUTED_FIELD_VALUE`, `COMPUTED_FIELD_UPDATED_AT`

However, `supertag:automation` and `supertag:computed_field` are **not** in the entity supertags array in bootstrap.ts — they need to be added:

```typescript
// Add to entitySupertags in bootstrap.ts:
{ systemId: SYSTEM_SUPERTAGS.AUTOMATION, content: '#Automation', extends: null },
{ systemId: SYSTEM_SUPERTAGS.COMPUTED_FIELD, content: '#ComputedField', extends: null },
```

Also add the automation/computed field system fields to bootstrap `commonFields` if not already there:
- `AUTOMATION_DEFINITION`: `automationDefinition`, `json`
- `AUTOMATION_STATE`: `automationState`, `json`
- `AUTOMATION_LAST_FIRED`: `automationLastFired`, `text`
- `AUTOMATION_ENABLED`: `automationEnabled`, `boolean`
- `COMPUTED_FIELD_DEFINITION`: `computedFieldDefinition`, `json`
- `COMPUTED_FIELD_VALUE`: `computedFieldValue`, `number`
- `COMPUTED_FIELD_UPDATED_AT`: `computedFieldUpdatedAt`, `text`

**Need to verify**: Check if these fields are already bootstrapped. If the reactive services (`computedFieldService.create`, `automationService.create`) already handle field resolution without bootstrap, then bootstrap additions may not be strictly required — but having them ensures the system is consistent.

---

## API / Interface Changes

### New Server Functions (`inbox-reactive.server.ts`)

All server functions follow the existing pattern: `createServerFn` with Zod input validation, dynamic `import('@nxus/db/server')` inside handlers.

#### `initInboxReactiveServerFn` (GET)
- Initialize reactive services (idempotent)
- Ensure inbox computed fields exist (create if missing)
- Return computed field IDs and current values

#### `getInboxMetricsServerFn` (GET)
- Return current values of all 4 inbox computed fields
- Lightweight polling endpoint

#### `getInboxAutomationsServerFn` (GET)
- List all automations that have inbox-related triggers
- Return id, name, enabled, trigger type, action type, lastTriggered

#### `createInboxAutomationServerFn` (POST)
- Input: `{ template: 'auto_archive' | 'backlog_overflow' | 'auto_tag', config: {...} }`
- Expand template into full `AutomationDefinition`
- Create via `automationService.create(db, definition)`
- Return automation ID

#### `toggleInboxAutomationServerFn` (POST)
- Input: `{ automationId: string, enabled: boolean }`
- Delegate to `automationService.setEnabled(db, id, enabled)`

#### `deleteInboxAutomationServerFn` (POST)
- Input: `{ automationId: string }`
- Delegate to `automationService.delete(db, id)`

#### `triggerInboxAutomationServerFn` (POST)
- Input: `{ automationId: string }`
- Delegate to `automationService.trigger(db, id, {})`
- For testing/manual trigger purposes

### Template Expansion

Templates resolve into full `AutomationDefinition` objects:

1. **`auto_archive`**: Query membership `onEnter` for inbox items with `status = 'done'` → `set_property` `ARCHIVED_AT` to `{ $now: true }`
2. **`backlog_overflow`**: Threshold trigger on pending count computed field `> N` → webhook POST
3. **`auto_tag`**: Query membership `onEnter` for inbox items with content containing keyword → `add_supertag`

---

## UI Components

### InboxMetricsBar
- Compact bar above inbox sections showing 4 stat cards
- Uses React Query to poll `getInboxMetricsServerFn` (staleTime: 10s, refetchInterval: 30s)
- Links to `/inbox/automations` page
- Components: `Card`, `Badge` from `@nxus/ui`

### InboxAutomationsPage (route: `/inbox/automations`)
- Metrics section at top (reuses metrics query)
- List of active automations with toggle switch, name, last triggered info, delete button
- "Add Automation" button opens `CreateAutomationModal`
- Back link to `/inbox`

### CreateAutomationModal
- Template selector dropdown
- Dynamic config form based on selected template
- Uses `AlertDialog` pattern from `@nxus/ui`
- Zustand store for modal open/close state

### Refresh Strategy
1. Metrics refresh on page load (route loader)
2. Metrics refresh after inbox CRUD operations (invalidate React Query cache)
3. Poll `getInboxMetricsServerFn` every 30s while page active
4. Automation list refreshes on page load and after create/delete/toggle

---

## Verification Approach

### Unit Tests (`apps/nxus-core/src/services/inbox/__tests__/inbox-reactive.test.ts`)
- Template expansion: each template produces correct `AutomationDefinition` structure
- Computed field definitions: verify correct query definitions for each metric
- Idempotent initialization: calling init multiple times is safe

### Integration Verification (manual)
- Navigate to `/inbox` → verify metrics bar shows correct counts
- Create inbox item → verify metrics update
- Change status to done → verify auto-archive automation fires (archivedAt set)
- Navigate to `/inbox/automations` → verify automation list, toggle, create, delete work
- Build passes: `nx run @nxus/core-app:build`

### Existing Test Suite
- Run `pnpm test:libs` to ensure no regressions in reactive system
- Run `pnpm e2e` to ensure no inbox E2E regressions

### Lint/Build
- `nx run @nxus/core-app:build` — verify no TypeScript errors
- Verify TanStack Router generates route tree correctly with new route
