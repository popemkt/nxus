# Spec: Inbox Auto-Triage Mini App

## Purpose

A mini app that adds reactive automation and live metrics to the existing Inbox feature (`/inbox`). This is the first consumer of the reactive query system, exercising **every layer**: event bus, query subscriptions, computed fields, automations (both query membership and threshold triggers), and webhooks.

The goal is twofold:
1. Make the inbox smarter with auto-tagging, status transitions, and alerts
2. Prove out the reactive system end-to-end through a real UI

---

## Scope

### In Scope
- New `/inbox/automations` page (or section within `/inbox`) for managing inbox automations and viewing live metrics
- Pre-built automation templates specific to inbox workflows
- Computed field dashboard showing live inbox stats
- Integration with existing inbox CRUD operations (they already emit events via `node.service.ts`)
- Initialization of reactive services on server startup

### Out of Scope
- Real-time push to client (WebSocket/SSE) — use polling or manual refresh for now
- Changes to the core reactive system (`packages/nxus-db/src/reactive/`)
- Modifying the existing inbox item cards or CRUD flow (additive only)

---

## Architecture

```
Existing Inbox CRUD (inbox.server.ts)
  ↓ createNode / setProperty / deleteNode
  ↓ (already emits MutationEvents via node.service.ts)
  ↓
EventBus
  ↓
QuerySubscriptionService          ComputedFieldService
  ↓                                  ↓
AutomationService ←── threshold ── onValueChange()
  ↓
Actions: set_property, add_supertag, webhook
```

The key insight: **no changes to existing inbox code are needed**. The inbox already uses `createNode`, `setProperty`, `deleteNode` from `node.service.ts`, which already emits events to the event bus. The reactive system just needs to be initialized and subscribed.

---

## Features

### Feature 1: Inbox Metrics Dashboard

Live computed fields displayed at the top of the inbox page (or in a dedicated section).

**Computed Fields:**

| Metric | Aggregation | Query | Field |
|--------|-------------|-------|-------|
| Total Items | COUNT | `supertag:inbox` (not deleted) | — |
| Pending Count | COUNT | `supertag:inbox` AND `status = 'pending'` | — |
| Processing Count | COUNT | `supertag:inbox` AND `status = 'processing'` | — |
| Done Count | COUNT | `supertag:inbox` AND `status = 'done'` | — |

**UI:** A row of stat cards above the inbox sections showing these live counts. Each card shows the metric name, current value, and a subtle "last updated" timestamp.

**Reactive behavior:** Values update automatically when inbox items are added, removed, or change status. The UI polls the server function (`getComputedFieldValueServerFn`) on an interval (e.g., 5s) or refreshes on user action.

### Feature 2: Automation Rules

Pre-built and user-configurable rules that fire when inbox items match conditions.

**Built-in Automation Templates:**

1. **Auto-archive old done items**
   - Trigger: Query membership `onEnter` — inbox items with `status = 'done'` (these already exist; the automation fires when an item transitions to done)
   - Action: `set_property` — set a `archivedAt` timestamp field (`$now` marker)
   - Purpose: Track when items were completed

2. **Backlog overflow alert**
   - Trigger: Threshold — pending count computed field `> N` (user-configurable, default 20)
   - Action: Webhook — POST to a user-configured URL with payload `{ "alert": "inbox_overflow", "pendingCount": {{ computedField.value }}, "timestamp": {{ timestamp }} }`
   - Purpose: Notify when inbox gets too full
   - `fireOnce: true` — only alert once per crossing, reset when count drops below

3. **Auto-tag by keyword** (user-configured)
   - Trigger: Query membership `onEnter` — inbox items whose content contains a keyword (e.g., "bug", "feature", "urgent")
   - Action: `add_supertag` — add a user-chosen supertag (e.g., `#Bug`, `#Feature`, `#Urgent`)
   - Purpose: Automatic categorization
   - Users can create multiple keyword→tag rules

### Feature 3: Automation Management UI

A page/panel where users can:
- View all active inbox automations with their status (enabled/disabled, last triggered)
- Enable/disable automations with a toggle
- Create new automations from templates (modal with configuration)
- Delete automations
- View the metrics dashboard
- Manually trigger an automation for testing

---

## Data Model

### New System Fields (in `node-schema.ts`)

```typescript
// Add to SYSTEM_FIELDS:
ARCHIVED_AT: 'field:archived_at'  // Timestamp when item was archived/completed
```

Bootstrap content name: `'archivedAt'`, fieldType: `'text'`

### New User-Created Supertags

Users may create custom supertags for auto-tagging (e.g., `#Bug`, `#Feature`, `#Urgent`). These are regular nodes with `supertag:supertag`, not system supertags. The automation UI lets users pick from existing supertags or create new ones.

### Automation Nodes

Automations are stored as nodes (already supported by `automation.service.ts`):
- Supertag: `supertag:automation`
- Properties: `field:automation_definition` (JSON), `field:automation_state` (JSON), `field:automation_enabled` (boolean), `field:automation_last_fired` (timestamp)

### Computed Field Nodes

Computed fields are stored as nodes (already supported by `computed-field.service.ts`):
- Supertag: `supertag:computed_field`
- Properties: `field:computed_field_definition` (JSON), `field:computed_field_value` (number), `field:computed_field_updated_at` (timestamp)

---

## Server Layer

### Initialization

A new initialization function that runs on server startup (or lazily on first inbox load):

```typescript
// packages/nxus-core/src/services/inbox/inbox-reactive.server.ts

initializeInboxReactive(db):
  1. Ensure computed fields exist (create if missing):
     - "Inbox: Total Items"
     - "Inbox: Pending Count"
     - "Inbox: Processing Count"
     - "Inbox: Done Count"
  2. Call computedFieldService.initialize(db)
  3. Call automationService.initialize(db)
  4. Return computed field IDs for the UI to reference
```

This is idempotent — safe to call multiple times. It creates the computed fields as nodes if they don't exist yet, and loads any existing automations.

### Server Functions

New server functions in `packages/nxus-core/src/services/inbox/inbox-reactive.server.ts`:

```typescript
// Initialize reactive system and return computed field IDs + current values
initInboxReactiveServerFn() → {
  success: true,
  metrics: {
    totalItems: { id: string, value: number | null },
    pendingCount: { id: string, value: number | null },
    processingCount: { id: string, value: number | null },
    doneCount: { id: string, value: number | null },
  }
}

// Get current metrics (polling endpoint)
getInboxMetricsServerFn() → {
  success: true,
  metrics: { totalItems: number, pendingCount: number, processingCount: number, doneCount: number },
  updatedAt: Date
}

// List inbox automations
getInboxAutomationsServerFn() → {
  success: true,
  automations: Array<{
    id: string, name: string, enabled: boolean,
    trigger: AutomationTrigger, action: AutomationAction,
    lastTriggered: Date | null
  }>
}

// Create automation from template
createInboxAutomationServerFn(input: {
  template: 'auto_archive' | 'backlog_overflow' | 'auto_tag'
  config: {
    // For backlog_overflow:
    threshold?: number
    webhookUrl?: string
    // For auto_tag:
    keyword?: string
    supertagId?: string
  }
}) → { success: true, automationId: string }

// Toggle automation
toggleInboxAutomationServerFn(input: {
  automationId: string, enabled: boolean
}) → { success: true }

// Delete automation
deleteInboxAutomationServerFn(input: {
  automationId: string
}) → { success: true }

// Manual trigger (for testing)
triggerInboxAutomationServerFn(input: {
  automationId: string
}) → { success: true }
```

These wrap the generic reactive server functions with inbox-specific logic (template expansion, computed field ID management, etc.).

### Template Expansion

When a user creates an automation from a template, the server function resolves it into a full `AutomationDefinition`:

**`auto_archive` template:**
```typescript
{
  name: "Auto-archive done items",
  trigger: {
    type: 'query_membership',
    queryDefinition: {
      filters: [
        { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
        { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, operator: 'eq', value: 'done' }
      ]
    },
    event: 'onEnter'
  },
  action: {
    type: 'set_property',
    fieldId: SYSTEM_FIELDS.ARCHIVED_AT,  // resolved to UUID at creation time
    value: { $now: true }
  },
  enabled: true
}
```

**`backlog_overflow` template:**
```typescript
{
  name: `Alert when pending > ${threshold}`,
  trigger: {
    type: 'threshold',
    computedFieldId: pendingCountComputedFieldId,  // resolved at creation time
    condition: { operator: 'gt', value: threshold },
    fireOnce: true
  },
  action: {
    type: 'webhook',
    url: webhookUrl,
    method: 'POST',
    body: {
      alert: 'inbox_overflow',
      pendingCount: '{{ computedField.value }}',
      timestamp: '{{ timestamp }}'
    }
  },
  enabled: true
}
```

**`auto_tag` template:**
```typescript
{
  name: `Auto-tag "${keyword}" → #${supertagName}`,
  trigger: {
    type: 'query_membership',
    queryDefinition: {
      filters: [
        { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
        { type: 'content', operator: 'contains', value: keyword }
      ]
    },
    event: 'onEnter'
  },
  action: {
    type: 'add_supertag',
    supertagId: supertagId  // UUID of the target supertag
  },
  enabled: true
}
```

---

## UI Layer

### Location

New route: `/inbox/automations` (or a tab/panel within the existing `/inbox` page — implementer's choice based on what feels natural).

### Components

#### 1. InboxMetricsBar

A compact metrics bar that can be placed at the top of `/inbox`:

```
┌──────────────────────────────────────────────────────────┐
│  📥 Total: 52    ⏳ Pending: 47    ⚙ Processing: 2    ✅ Done: 3  │
│                                          [Automations →] │
└──────────────────────────────────────────────────────────┘
```

- Displays computed field values
- Refreshes on page load and after any inbox mutation
- "Automations" link navigates to the management page

#### 2. InboxAutomationsPage

The main automation management view:

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Inbox                                     │
│                                                       │
│  Inbox Automations                                    │
│                                                       │
│  ┌─ Metrics ────────────────────────────────────┐    │
│  │  Total: 52  Pending: 47  Processing: 2  Done: 3│   │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  ┌─ Active Rules ───────────────────────────────┐    │
│  │                                               │    │
│  │  [Toggle] Auto-archive done items             │    │
│  │           Last triggered: 2 min ago     [🗑]  │    │
│  │                                               │    │
│  │  [Toggle] Alert when pending > 20             │    │
│  │           Never triggered              [🗑]  │    │
│  │                                               │    │
│  │  [Toggle] Auto-tag "bug" → #Bug              │    │
│  │           Last triggered: 1 hour ago   [🗑]  │    │
│  │                                               │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  [+ Add Automation]                                   │
│                                                       │
└─────────────────────────────────────────────────────┘
```

#### 3. CreateAutomationModal

A modal for creating automations from templates:

```
┌─────────────────────────────────────────────┐
│  New Inbox Automation                        │
│                                              │
│  Template: [▼ Select template...]            │
│    • Auto-archive done items                 │
│    • Backlog overflow alert                  │
│    • Auto-tag by keyword                     │
│                                              │
│  ── Template-specific config ──              │
│                                              │
│  (for "Backlog overflow alert"):             │
│  Threshold:  [20]                            │
│  Webhook URL: [https://...]                  │
│                                              │
│  (for "Auto-tag by keyword"):                │
│  Keyword:  [bug]                             │
│  Tag:      [▼ Select supertag...]            │
│                                              │
│           [Cancel]  [Create Automation]       │
└─────────────────────────────────────────────┘
```

### UI Patterns

Follow existing app patterns:
- **Zustand store** for local UI state (modal open/close, selected template)
- **TanStack React Query** (`useMutation`) for server function calls with optimistic updates
- **Card/Badge/Button** from `@nxus/ui`
- **AlertDialog** pattern for modals (matching InboxEditModal)
- **Switch** component for enable/disable toggles

### Refresh Strategy

Since there's no real-time push yet:
1. Metrics refresh on page load (`loader` function)
2. Metrics refresh after any inbox CRUD operation (invalidate React Query cache)
3. Optional: poll `getInboxMetricsServerFn` every 5-10s while the page is active
4. Automation list refreshes on page load and after create/delete/toggle

---

## Implementation Notes

### Reactive Service Initialization

The reactive services (`computedFieldService`, `automationService`) need to be initialized once with the database. This should happen:
- Lazily on first call to any inbox reactive server function
- Or on server startup if a general init hook exists

Use a module-level flag to ensure idempotent initialization:

```typescript
let initialized = false

async function ensureReactiveInit() {
  if (initialized) return
  const { initDatabaseWithBootstrap, computedFieldService, automationService } = await import('@nxus/db/server')
  const db = await initDatabaseWithBootstrap()
  computedFieldService.initialize(db)
  automationService.initialize(db)
  // Create default computed fields if they don't exist
  ensureInboxComputedFields(db)
  initialized = true
}
```

### Query Definitions for Inbox

The queries used for computed fields and automation triggers:

```typescript
// All inbox items (not deleted)
const allInboxQuery = {
  filters: [{ type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX }]
}

// Pending inbox items
const pendingQuery = {
  filters: [
    { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
    { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, operator: 'eq', value: 'pending' }
  ]
}

// Done inbox items
const doneQuery = {
  filters: [
    { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
    { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, operator: 'eq', value: 'done' }
  ]
}
```

Note: `supertagId` and `fieldId` in query filters need to be resolved to UUIDs at runtime (using `getSystemNode`), since the reactive query evaluator works with node UUIDs, not systemIds. The server functions handle this resolution.

### Existing Event Emission

The inbox server functions already use `node.service.ts` functions that emit events:
- `createNode` → emits `node:created` + `supertag:added`
- `setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'done')` → emits `property:set` with `fieldSystemId`
- `deleteNode` → emits `node:deleted`

This means **the reactive system will start working immediately** once initialized — no changes to inbox CRUD code needed.

### Error Handling

- If reactive initialization fails, inbox CRUD should still work (degrade gracefully)
- Webhook failures are handled by the webhook queue's retry logic (3 attempts, exponential backoff)
- Automation errors are caught per-automation and don't affect other automations (already implemented in `automation.service.ts`)

---

## Testing Strategy

### Unit Tests

- Test template expansion (each template produces correct `AutomationDefinition`)
- Test computed field creation and value retrieval
- Test automation enable/disable/delete server functions

### Integration Tests

- Create inbox item → computed field updates → verify count incremented
- Change inbox item status to 'done' → auto-archive automation fires → verify `archivedAt` is set
- Add items until pending count crosses threshold → webhook fires → verify webhook called once
- Add inbox item with keyword → auto-tag fires → verify supertag added
- Disable automation → perform triggering action → verify automation does NOT fire

### Manual Testing

- Navigate to `/inbox/automations`
- Verify metrics match actual inbox counts
- Create each automation template
- Perform inbox operations and verify automations fire
- Toggle automations and verify they stop/start

---

## File Structure

```
packages/nxus-core/src/
  routes/
    inbox.automations.tsx            # New route (or inbox.tsx modification)
  services/inbox/
    inbox-reactive.server.ts         # Reactive server functions
  components/features/inbox/
    inbox-metrics-bar.tsx            # Metrics display component
    inbox-automations-page.tsx       # Automation management
    create-automation-modal.tsx      # Template-based creation modal
  stores/
    inbox-automations.store.ts       # Zustand store for automation UI state

packages/nxus-db/src/
  schemas/node-schema.ts             # Add ARCHIVED_AT field
  services/bootstrap.ts              # Add archivedAt field bootstrap
```

---

## Success Criteria

1. Computed fields show correct counts that update when inbox items change
2. Auto-archive automation sets `archivedAt` when items transition to done
3. Backlog overflow webhook fires exactly once when threshold is crossed, resets when count drops
4. Auto-tag by keyword adds the correct supertag to new matching items
5. All automations can be enabled/disabled/deleted from the UI
6. Existing inbox functionality is unaffected (no regressions)
7. Reactive system initializes cleanly and handles errors gracefully
