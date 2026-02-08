# Technical Specification: Fix All Unsound Issues in Nxus

## Technical Context

### Language & Runtime
- **TypeScript 5.9** with strict mode enabled
- **Node.js 20.19+** runtime (server-side)
- **React 19** (client-side)

### Key Dependencies
- **Vite 7.1+** — build tool and dev server
- **TanStack Start** — React meta-framework (SSR + server functions)
- **TanStack Router 1.132+** — file-based routing with `errorComponent` support
- **TanStack Query 5.90+** — data fetching with `QueryClient` config
- **Zustand 5.0+** — client state management with `persist` middleware
- **Drizzle ORM 0.45+** — SQLite database abstraction
- **better-sqlite3 12.6** — synchronous SQLite driver (supports transactions natively)
- **Zod 4.2+** — runtime schema validation
- **Playwright 1.58+** — E2E testing
- **Vitest 3.0+** — unit testing
- **Nx 22.3** — monorepo orchestration with pnpm workspaces

### Architecture
- **Monorepo**: 4 apps (`nxus-gateway`, `nxus-core`, `nxus-workbench`, `nxus-calendar`) + 4 libs (`nxus-db`, `nxus-ui`, `nxus-workbench`, `nxus-calendar`)
- **Gateway proxy**: Custom Vite plugin on port 3001 forwards to mini-apps on ports 3000/3002/3003
- **Database**: SQLite with WAL mode, Drizzle ORM, raw SQL for table creation and migrations
- **Reactive system**: Server-side event bus with subscriptions for real-time updates
- **Server functions**: TanStack Start server functions with `.server.ts` convention; external lib server imports use dynamic `import()` wrappers

### Constraints
- SQLite is single-writer (serializes writes), but multi-step operations still need transactions for atomicity
- better-sqlite3 is synchronous — transactions use `db.transaction()` (Drizzle) which is straightforward
- This is a local-first dev tool — security fixes are defense-in-depth, not production hardening
- All existing tests must continue to pass

---

## Implementation Approach

The 67 issues are grouped into 8 categories. Each category maps to a delivery phase with independent, testable changes. Within each phase, fixes follow existing code patterns and conventions.

### Guiding Principles

1. **Minimal changes** — Fix only what's broken. No refactoring, no new features, no style changes beyond the fix.
2. **Use existing patterns** — If the codebase already has a pattern for something (e.g., Drizzle transactions elsewhere), use it.
3. **Additive over destructive** — Prefer adding validation/guards over restructuring code. Add error boundaries, not new error systems.
4. **Test what matters** — Security fixes and data integrity fixes get unit tests. UI/config fixes are verified by existing E2E tests.

---

## Source Code Structure Changes

### New Files
| File | Purpose |
|------|---------|
| `libs/nxus-db/src/lib/shell-utils.ts` | Safe shell command execution helpers (array-based `spawn`) |
| `apps/nxus-core/src/components/shared/RootErrorBoundary.tsx` | Shared root error boundary component |
| `apps/nxus-workbench/src/components/shared/RootErrorBoundary.tsx` | Root error boundary (workbench) |
| `apps/nxus-calendar/src/components/shared/RootErrorBoundary.tsx` | Root error boundary (calendar) |
| `apps/nxus-gateway/src/components/shared/RootErrorBoundary.tsx` | Root error boundary (gateway) |

### Modified Files (by category)

**Category A: Security (7 issues, 6 files)**
- `apps/nxus-core/src/services/shell/install.server.ts` — Replace `execAsync(\`git clone ...\`)` with `spawn('git', ['clone', url, appDir])`
- `apps/nxus-core/src/lib/platform-commands.ts` — Rewrite command execution to use `child_process.spawn` with array args
- `apps/nxus-core/src/services/shell/script-resolver.server.ts` — Add path traversal validation (resolved path must be within base dir)
- `apps/nxus-gateway/vite.config.ts` — Sanitize proxy URLs (strip CRLF), filter forwarded headers, fix WebSocket header construction, add route prefix matching with `/`, add request timeout, return 502 on upstream error
- `apps/nxus-calendar/src/routes/oauth-callback.tsx` — Validate `state` parameter, fix "Try Again" to navigate to OAuth init URL, add `useEffect` cleanup

**Category B: Data Integrity (8 issues, 5 files)**
- `libs/nxus-db/src/services/node.service.ts` — Wrap `setNodeSupertags` (lines 933-992), `deleteNode` property cleanup (lines 543-561), and `syncNodeSupertagsToItemTypes` (lines 1287-1317) in Drizzle transactions
- `libs/nxus-db/src/schemas/item-schema.ts` — Add foreign key constraints to `itemTags`, `itemTagConfigs`, `itemTypes` using Drizzle's `.references()`
- `libs/nxus-db/src/schemas/node-schema.ts` — Add index on `deletedAt`
- `apps/nxus-core/src/stores/tag-data.store.ts` — Add rollback logic to `updateTag`/`deleteTag` catch blocks
- `libs/nxus-calendar/src/lib/google-calendar.ts` — Add token refresh mutex, fix 404-creates-duplicate logic, document all-day end date convention
- `libs/nxus-calendar/src/server/calendar.server.ts` — Wrap `completeTask` in transaction

**Category C: Error Handling (11 issues, 12 files)**
- `apps/nxus-core/src/routes/__root.tsx` — Add `errorComponent`
- `apps/nxus-gateway/src/routes/__root.tsx` — Add `errorComponent`
- `apps/nxus-workbench/src/routes/__root.tsx` — Add `errorComponent`
- `apps/nxus-calendar/src/routes/__root.tsx` — Add `errorComponent`
- `apps/nxus-gateway/vite.config.ts` — Return 502 instead of `next()` on proxy error; add 30s timeout with 504
- `libs/nxus-db/src/client/master-client.ts` — Check error message for "duplicate column" in catch blocks; re-throw others
- `libs/nxus-db/src/services/query-evaluator.service.ts` — Log JSON parse failures at error level with node ID
- `libs/nxus-db/src/reactive/automation.service.ts` — Add failure counter for webhook processing
- `apps/nxus-core/src/stores/tag-data.store.ts` — Reset `isInitialized` on init failure
- `apps/nxus-core/src/services/shell/pty-session-manager.server.ts` — Add `SIGTERM`/`exit` handler to kill PTY sessions
- `apps/nxus-core/src/lib/query-client.ts`, `apps/nxus-workbench/src/lib/query-client.ts`, `apps/nxus-calendar/src/lib/query-client.ts` — Add `retry: 2`, `gcTime` defaults

**Category D: Type Safety (6 issues, 6 files)**
- `libs/nxus-db/src/types/node.ts` — Replace `value: any` with `string | number | boolean | null | Record<string, unknown>`
- `libs/nxus-db/src/reactive/query-subscription.service.ts` — Import proper Drizzle database type
- `libs/nxus-db/src/reactive/automation.service.ts` — Replace `type Database = any`
- `libs/nxus-db/src/reactive/computed-field.service.ts` — Replace `type Database = any`
- `libs/nxus-workbench/src/server/reactive.server.ts` — Replace `z.any()` with proper filter schema
- `libs/nxus-db/src/reactive/automation.service.ts` — Validate parsed automation definitions with `AutomationDefinitionSchema`

**Category E: Architecture/Config (7 issues, 7 files)**
- `apps/nxus-gateway/vite.config.ts` — Read ports from env vars; fix prefix matching to require `/` after prefix
- `apps/nxus-workbench/src/router.tsx` + `apps/nxus-workbench/vite.config.ts` — Standardize trailing slash
- `apps/nxus-calendar/src/router.tsx` + `apps/nxus-calendar/vite.config.ts` — Standardize trailing slash
- `libs/nxus-db/src/schemas/node-schema.ts` — Add index on `deletedAt` (also listed under B)
- `apps/nxus-core/src/stores/terminal.store.ts` — Cap log array at 10,000 entries
- `libs/nxus-workbench/src/features/graph/store/graph.store.ts` — Add `migrate` function to Zustand persist config
- `libs/nxus-ui/src/components/field.tsx` — Change `==` to `===`

**Category F: Reactive System (4 issues, 4 files)**
- `libs/nxus-db/src/reactive/event-bus.ts` — Add max subscriber warning (default 50)
- `libs/nxus-db/src/reactive/query-subscription.service.ts` — Use getter function for DB reference instead of captured instance; add `cleared` flag to debounce timer
- `libs/nxus-db/src/reactive/webhook-queue.ts` — Replace boolean `isCurrentlyProcessing` with promise-based lock

**Category G: Calendar (3 issues, 3 files)**
- `libs/nxus-calendar/src/lib/google-calendar.ts` — Document all-day end date convention with comment
- `libs/nxus-calendar/src/components/event-modal.tsx` — Add month/day range validation after date parsing
- `libs/nxus-calendar/src/lib/date-utils.ts` — Document UTC convention with comments

**Category H: Testing (3 issues, 3 files)**
- `e2e/fixtures/base.fixture.ts` — Replace `networkidle` with app-ready element wait
- `e2e/calendar/event-crud.spec.ts` — Add `beforeEach` setup instead of serial test dependencies; remove "Try Again" retry workaround

---

## Data Model / Schema Changes

### Schema Additions (Drizzle)

**1. Foreign key constraints on junction tables** (`libs/nxus-db/src/schemas/item-schema.ts`):

```typescript
// itemTags - add FK references
export const itemTags = sqliteTable(
  'item_tags',
  {
    appId: text('app_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.appId, table.tagId] })],
)

// itemTagConfigs - add FK references
// itemTypes - add FK reference to items.id
```

**2. Index on `nodes.deletedAt`** (`libs/nxus-db/src/schemas/node-schema.ts`):

```typescript
(t) => [
  index('idx_nodes_system_id').on(t.systemId),
  index('idx_nodes_owner_id').on(t.ownerId),
  index('idx_nodes_content_plain').on(t.contentPlain),
  index('idx_nodes_deleted_at').on(t.deletedAt),  // NEW
],
```

**3. `isPrimary` column on `itemTypes`** (already partially implied by requirement B8):

The `isPrimary` column is referenced in `syncNodeSupertagsToItemTypes` but not present in the schema. Add it:

```typescript
isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
```

### Migration Strategy

Since the project uses raw SQL `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` in `master-client.ts` (not Drizzle Kit migrations), the migration approach is:

1. **FK constraints**: SQLite does not support adding FKs via `ALTER TABLE`. The Drizzle schema definitions will add `.references()` for new databases. For existing databases, add a migration step in `master-client.ts` that:
   - Enables `PRAGMA foreign_keys = ON`
   - Creates new tables with FKs, copies data, drops old tables, renames new ones (standard SQLite FK migration)
   - Or: just enable FK enforcement going forward without retroactive migration (pragmatic for local-first tool)

2. **New indexes**: Added via `CREATE INDEX IF NOT EXISTS` in `master-client.ts`

3. **`isPrimary` column**: Added via `ALTER TABLE item_types ADD COLUMN is_primary INTEGER DEFAULT 0` with catch block

### Type Changes

**`PropertyValue.value`** (`libs/nxus-db/src/types/node.ts`):

```typescript
// Before
export interface PropertyValue {
  value: any
  ...
}

// After
export type PropertyValueType = string | number | boolean | null | Record<string, unknown>

export interface PropertyValue {
  value: PropertyValueType
  ...
}
```

This change may require updating callers that pass arbitrary types. The impact is limited since most callers already pass strings (JSON-encoded values in the `value` column).

---

## API / Interface Changes

No public API changes. All fixes are internal implementation changes. The reactive system's `EventBus.subscribe()` signature remains the same but gains a max-subscriber warning. `QueryClient` defaults change (retry, gcTime) but these are non-breaking.

---

## Delivery Phases

### Phase 1: Security Fixes (Category A)
**Goal**: Eliminate all injection vulnerabilities and CSRF issues.

- Fix command injection in `install.server.ts` (spawn with array args)
- Fix command injection in `platform-commands.ts` (spawn with array args)
- Fix path traversal in `script-resolver.server.ts` (path validation)
- Fix gateway proxy (URL sanitization, header filtering, route prefix matching)
- Fix WebSocket header injection in gateway
- Fix OAuth callback (CSRF state validation, cleanup, "Try Again" navigation)

**Verification**: Unit tests for shell-utils helpers. Manual test of git clone, script execution. Existing E2E tests pass.

### Phase 2: Data Integrity & Transactions (Category B)
**Goal**: Ensure multi-step DB operations are atomic.

- Wrap `setNodeSupertags` in transaction
- Wrap `syncNodeSupertagsToItemTypes` in transaction
- Wrap `completeTask` in transaction
- Add optimistic update rollback in tag store
- Add token refresh mutex in google-calendar
- Fix 404-creates-duplicate in google-calendar
- Add FK constraints to schemas + migration SQL
- Add `deletedAt` index
- Filter deleted-node properties in queries

**Verification**: Unit tests for transaction rollback scenarios. Existing tests pass. Manual test of supertag operations.

### Phase 3: Error Handling (Category C)
**Goal**: No silent failures, no white-screen crashes.

- Add `errorComponent` to all 4 root routes
- Gateway: return 502/504 instead of silent fallthrough
- Fix empty catch blocks in master-client.ts
- Improve JSON parse error logging in query-evaluator
- Add webhook failure counter in automation service
- Fix tag store init failure (allow retry)
- Add PTY cleanup on server shutdown
- Add QueryClient retry/gcTime defaults
- Add useEffect cleanup in OAuth callback

**Verification**: Unit test for error boundary rendering. Manual test of gateway with upstream down. Existing tests pass.

### Phase 4: Type Safety (Category D)
**Goal**: Remove `any` types from core data paths.

- Replace `PropertyValue.value: any` with union type
- Replace `type Database = any` in reactive services (3 files)
- Replace `z.any()` in reactive server validation
- Validate automation definitions with Zod schema
- Fix `as any` casts in core app (add proper type guards)
- Add `ForceGraph3D` type declaration or `@ts-expect-error`

**Verification**: `tsc --noEmit` passes. Existing tests pass.

### Phase 5: Architecture, Config & Misc (Categories E, F, G)
**Goal**: Fix configuration inconsistencies, reactive system reliability, and calendar edge cases.

- Gateway: env var ports, strict prefix matching
- Standardize trailing slash in workbench and calendar
- Cap terminal logs at 10,000 entries
- Add Zustand persist migration function
- Fix loose equality in field.tsx
- Add max subscriber warning to event bus
- Use DB getter in query subscriptions
- Add `cleared` flag to debounce timer
- Replace boolean lock with promise-based lock in webhook queue
- Document all-day end date convention
- Add date validation in event-modal
- Document UTC convention in date-utils

**Verification**: Existing tests pass. Manual verification of gateway routing, terminal log cap.

### Phase 6: Test Reliability (Category H)
**Goal**: Make E2E tests independent and less flaky.

- Replace `networkidle` with element-based waits
- Add `beforeEach` data setup to serial tests
- Remove "Try Again" retry workaround (investigate root cause)

**Verification**: E2E test suite passes with `--repeat-each=3`.

---

## Verification Approach

### Automated
- `pnpm test:libs` — All library unit tests pass
- `tsc --noEmit` (per-project via Nx) — No type errors
- `pnpm e2e` — All E2E tests pass
- ESLint — No new warnings

### Manual Verification
- Gateway proxy with one upstream app stopped → expect 502 response (not landing page)
- OAuth callback with invalid `state` → expect rejection
- Kill server mid-supertag-update → data remains consistent (transaction rollback)
- Navigate to non-existent route → error boundary renders (not white screen)

### New Tests
- Unit tests for `shell-utils.ts` (safe spawn helpers)
- Unit tests for path traversal validation in script resolver
- Unit tests for transaction rollback in `setNodeSupertags`
- Unit test verifying error boundary renders for thrown error
- Unit test for token refresh mutex (concurrent calls share one refresh)
