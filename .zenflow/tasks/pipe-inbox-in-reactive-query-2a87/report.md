# Implementation Report: Pipe Inbox in Reactive Query

## Summary

Integrated the inbox system with the reactive query infrastructure. Inbox CRUD operations now automatically feed into the reactive event bus, enabling computed metrics (Total Items, Pending Count, Processing Count, Done Count) and template-based automations (auto-archive, backlog overflow, auto-tag). A metrics bar was added to the inbox page and a full automations management page was created at `/inbox/automations`.

## Files Changed

### New Files (7)

| File | Purpose |
|------|---------|
| `apps/nxus-core/src/services/inbox/inbox-reactive.server.ts` | Server functions: init, metrics polling, automation CRUD, template expansion |
| `apps/nxus-core/src/routes/inbox_.automations.tsx` | File-based route for `/inbox/automations` |
| `apps/nxus-core/src/components/features/inbox/inbox-metrics-bar.tsx` | 4-stat metrics bar with React Query polling (30s interval) |
| `apps/nxus-core/src/components/features/inbox/inbox-automations-page.tsx` | Automation list with toggle, delete, and create actions |
| `apps/nxus-core/src/components/features/inbox/create-automation-modal.tsx` | Template-driven automation creation modal (3 templates) |
| `apps/nxus-core/src/stores/inbox-automations.store.ts` | Zustand store for modal state management |
| `apps/nxus-core/src/services/inbox/__tests__/inbox-reactive.test.ts` | Unit tests for template expansion, computed field definitions, queries |

### Modified Files (3)

| File | Change |
|------|--------|
| `libs/nxus-db/src/schemas/node-schema.ts` | Added `ARCHIVED_AT` to `SYSTEM_FIELDS` and `FIELD_NAMES` |
| `libs/nxus-db/src/services/bootstrap.ts` | Added `#Automation`, `#ComputedField` supertags; added automation/computed field/inbox system fields to bootstrap |
| `apps/nxus-core/src/routes/inbox.tsx` | Imported `InboxMetricsBar`, initialized reactive system in loader |

## Architecture

```
Existing Inbox CRUD (inbox.server.ts -> nodeFacade -> node.service.ts)
  | createNode / setProperty / deleteNode
  | (already emits MutationEvents via eventBus)
  v
EventBus (singleton in @nxus/db)
  |
  v                                  v
QuerySubscriptionService      ComputedFieldService (4 inbox metrics)
  |                                  |
  v                                  v
AutomationService <-- threshold -- onValueChange()
  |
  v
Actions: set_property, add_supertag, webhook
```

No changes to existing inbox CRUD code were needed. The reactive system subscribes to mutation events already emitted by the node service layer.

## Server Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `initInboxReactiveServerFn` | GET | Idempotent init of reactive services + computed fields |
| `getInboxMetricsServerFn` | GET | Lightweight polling for current metric values |
| `getInboxAutomationsServerFn` | GET | List inbox-related automations |
| `createInboxAutomationServerFn` | POST | Create automation from template + config |
| `toggleInboxAutomationServerFn` | POST | Enable/disable automation |
| `deleteInboxAutomationServerFn` | POST | Remove automation |
| `triggerInboxAutomationServerFn` | POST | Manual trigger for testing |

## Automation Templates

| Template | Trigger | Action |
|----------|---------|--------|
| `auto_archive` | Query membership: inbox items with status=done | Set `ARCHIVED_AT` to current timestamp |
| `backlog_overflow` | Threshold: pending count > N | Webhook POST to configured URL |
| `auto_tag` | Query membership: inbox items with content containing keyword | Add configured supertag |

## Verification Results

### Unit Tests (`pnpm test:libs`)
- **@nxus/db**: All tests passed (event-bus, webhook-queue, query-evaluator, sqlite-backend, surreal-backend, bootstrap, migration, node-service)
- **@nxus/workbench**: 6 test files, 144 tests passed
- **@nxus/calendar**: 5 test files, 209 tests passed
- **@nxus/ui**: 1 test file, 9 tests passed

### Build (`nx run @nxus/core-app:build`)
- Client build: 6702 modules transformed, built in ~10s
- SSR build: 323 modules transformed
- Both client and server chunks generated successfully
- New route chunk `inbox_.automations-CGjyhNFi.js` (8.19 kB) present in output
- Inbox chunk `inbox-DuO8z136.js` (12.46 kB) includes metrics bar integration
- Only pre-existing warnings (chunk size, dynamic/static import overlap) — no new warnings introduced

### File Verification
All 10 files (7 new, 3 modified) verified present with correct content:
- Server functions: full CRUD + template expansion + lazy init pattern
- UI components: metrics bar with polling, automations page with toggle/delete/create
- Bootstrap: all automation/computed field infrastructure bootstrapped
- Route: TanStack Router convention (`inbox_.automations.tsx`) generates correct `/inbox/automations` path
- Tests: 40+ assertions covering template expansion, computed field definitions, query structures
