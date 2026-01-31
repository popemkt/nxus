# Technical Specification: Schedule Management Mini App

## 1. Technical Context

### 1.1 Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | TanStack Start (React + SSR) | v1.132+ |
| UI Components | shadcn/ui + Tailwind CSS v4 | Latest |
| State Management | Zustand | v5.0.9 |
| Data Fetching | TanStack Query | v5.90+ |
| Database | SQLite + Drizzle ORM | v0.45.1 |
| Routing | TanStack Router (file-based) | v1.132+ |
| Calendar Library | react-big-calendar | v1.x |
| Calendar Styling | Custom shadcn CSS theme | Custom |
| Date Utilities | date-fns | Latest |
| Recurrence | rrule | v2.x |
| Google API | googleapis | v144+ |
| TypeScript | v5.7.2 | - |

### 1.2 Existing Codebase Patterns

The codebase follows a **pure functions + hooks composition** pattern:

```
lib/          → Pure utility functions (zero React deps)
hooks/        → React hooks composing lib + state management
services/     → Zustand stores + Server functions (*.server.ts)
components/   → React UI components
routes/       → TanStack Router file-based routes
types/        → TypeScript/Zod schemas
```

**Key patterns to follow:**
- Server functions via `createServerFn` with Zod input validation
- Feature toggles for gradual migrations (`feature-flags.ts`)
- Zustand stores with selectors for client state
- Node-based architecture with `nodes` + `nodeProperties` tables
- System fields and supertags for entity classification

### 1.3 Existing Infrastructure to Leverage

| Component | Location | Usage |
|-----------|----------|-------|
| Query evaluator | `nxus-db/src/services/query-evaluator.service.ts` | Evaluate calendar event queries |
| Query types | `nxus-db/src/types/query.ts` | Filter definitions for date ranges |
| Node service | `nxus-db/src/services/node.service.ts` | CRUD operations on nodes |
| System fields | `nxus-db/src/schemas/node-schema.ts` | Define new calendar fields |
| Theme system | `nxus-core/src/stores/theme.store.ts` | Dark/light mode support |
| UI components | `nxus-ui/src/components/` | Buttons, modals, inputs |

---

## 2. Implementation Approach

### 2.1 Package Structure

Create a new package `@nxus/calendar` for encapsulation:

```
packages/nxus-calendar/
├── src/
│   ├── index.ts                    # Public exports
│   ├── route.tsx                   # CalendarRoute component
│   ├── components/
│   │   ├── calendar-container.tsx  # Main calendar wrapper
│   │   ├── calendar-toolbar.tsx    # View switcher, navigation, sync button
│   │   ├── event-block.tsx         # Event/task rendering in calendar
│   │   ├── task-checkbox.tsx       # Inline task completion
│   │   ├── event-modal.tsx         # View/edit event modal
│   │   ├── create-event-modal.tsx  # Create new event modal
│   │   └── sync-status-badge.tsx   # Google sync status indicator
│   ├── hooks/
│   │   ├── use-calendar-events.ts  # Fetch events via query system
│   │   ├── use-calendar-navigation.ts # Date navigation state
│   │   ├── use-event-mutations.ts  # Create/update/delete events
│   │   └── use-google-sync.ts      # Google Calendar sync hook
│   ├── stores/
│   │   └── calendar-settings.store.ts # User preferences
│   ├── server/
│   │   ├── index.ts                # Server function exports
│   │   ├── calendar.server.ts      # Event CRUD server functions
│   │   └── google-sync.server.ts   # Google OAuth + sync functions
│   ├── lib/
│   │   ├── date-utils.ts           # Date manipulation helpers
│   │   ├── rrule-utils.ts          # Recurrence pattern handling
│   │   ├── query-builder.ts        # Build calendar queries
│   │   └── google-calendar.ts      # Google API client wrapper
│   ├── types/
│   │   ├── calendar-event.ts       # Event/task type definitions
│   │   └── google-sync.ts          # Google sync types
│   └── styles/
│       └── calendar.css            # react-big-calendar theming
├── package.json
└── tsconfig.json
```

### 2.2 Integration with nxus-core

Add a new route in `nxus-core`:

```typescript
// packages/nxus-core/src/routes/calendar.tsx
import { createFileRoute } from '@tanstack/react-router'
import { CalendarRoute } from '@nxus/calendar'

export const Route = createFileRoute('/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  return <CalendarRoute />
}
```

### 2.3 Calendar Library Choice

**Selected: react-big-calendar with custom shadcn CSS theme**

Rationale:
- Mature, battle-tested library with 7k+ GitHub stars
- Native support for Day/Week/Month views
- Built-in drag-and-drop for event rescheduling
- Supports custom event rendering (for task checkboxes)
- Works with date-fns localizer
- Can be styled with CSS variables to match shadcn theme

**Custom styling approach:**
- Create `calendar.css` based on shadcn-ui-big-calendar patterns
- Map to Tailwind CSS variables (`--background`, `--foreground`, etc.)
- Support dark/light mode via CSS variables

---

## 3. Source Code Structure Changes

### 3.1 New Files to Create

| File | Purpose |
|------|---------|
| `packages/nxus-calendar/package.json` | Package manifest |
| `packages/nxus-calendar/tsconfig.json` | TypeScript config extending root |
| `packages/nxus-calendar/src/index.ts` | Public exports |
| `packages/nxus-calendar/src/route.tsx` | Main calendar page component |
| `packages/nxus-calendar/src/components/*.tsx` | UI components (7 files) |
| `packages/nxus-calendar/src/hooks/*.ts` | React hooks (4 files) |
| `packages/nxus-calendar/src/stores/calendar-settings.store.ts` | Zustand store |
| `packages/nxus-calendar/src/server/*.ts` | Server functions (3 files) |
| `packages/nxus-calendar/src/lib/*.ts` | Pure utility functions (4 files) |
| `packages/nxus-calendar/src/types/*.ts` | TypeScript types (2 files) |
| `packages/nxus-calendar/src/styles/calendar.css` | Calendar theme |
| `packages/nxus-core/src/routes/calendar.tsx` | Route definition |

### 3.2 Files to Modify

| File | Changes |
|------|---------|
| `packages/nxus-db/src/schemas/node-schema.ts` | Add new SYSTEM_FIELDS for calendar |
| `packages/nxus-core/package.json` | Add `@nxus/calendar` dependency |
| `pnpm-workspace.yaml` | Add `packages/nxus-calendar` |
| `.gitignore` | Ensure `node_modules/`, `dist/` covered |

---

## 4. Data Model / API / Interface Changes

### 4.1 New System Fields

Add to `SYSTEM_FIELDS` in `nxus-db/src/schemas/node-schema.ts`:

```typescript
// Calendar-specific fields
START_DATE: 'field:start_date',         // ISO datetime or date string
END_DATE: 'field:end_date',             // ISO datetime or date string (optional)
ALL_DAY: 'field:all_day',               // Boolean for all-day events
RRULE: 'field:rrule',                   // RFC 5545 recurrence rule string
GCAL_EVENT_ID: 'field:gcal_event_id',   // Google Calendar event ID
GCAL_SYNCED_AT: 'field:gcal_synced_at', // Last sync timestamp
REMINDER: 'field:reminder',             // Reminder offset in minutes
```

### 4.2 New System Supertags

Add to `SYSTEM_SUPERTAGS`:

```typescript
TASK: 'supertag:task',     // Nodes that are tasks (existing or new)
EVENT: 'supertag:event',   // Nodes that are calendar events
```

### 4.3 Calendar Event Type

```typescript
// packages/nxus-calendar/src/types/calendar-event.ts
export interface CalendarEvent {
  id: string                    // Node ID
  title: string                 // Node content
  start: Date                   // Start datetime
  end: Date                     // End datetime
  allDay: boolean               // All-day flag
  isTask: boolean               // Task vs Event
  isCompleted: boolean          // Task completion status
  rrule?: string                // Recurrence pattern
  hasReminder: boolean          // Has reminder set
  gcalEventId?: string          // Google Calendar ID (if synced)
  gcalSyncedAt?: Date           // Last sync time
  nodeId: string                // Reference to source node
  color?: string                // Display color
}

// For react-big-calendar
export interface BigCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay?: boolean
  resource: CalendarEvent       // Full event data
}
```

### 4.4 Query Extension for Date Range

Extend `PropertyFilter` to support date comparisons:

```typescript
// Example query for calendar events
const calendarQuery: QueryDefinition = {
  filters: [
    // Match Task OR Event supertags
    {
      type: 'or',
      filters: [
        { type: 'supertag', supertagId: 'supertag:task' },
        { type: 'supertag', supertagId: 'supertag:event' },
      ],
    },
    // Has start_date field
    { type: 'hasField', fieldId: 'field:start_date' },
    // Start date within range (handled in query-builder.ts)
    {
      type: 'property',
      fieldId: 'field:start_date',
      op: 'gte',
      value: '2026-02-01T00:00:00Z',
    },
    {
      type: 'property',
      fieldId: 'field:start_date',
      op: 'lte',
      value: '2026-02-28T23:59:59Z',
    },
  ],
  sort: { field: 'field:start_date', direction: 'asc' },
  limit: 1000,
}
```

### 4.5 Calendar Settings Store

```typescript
// packages/nxus-calendar/src/stores/calendar-settings.store.ts
interface CalendarSettingsState {
  // View preferences
  defaultView: 'day' | 'week' | 'month'
  weekStartsOn: 0 | 1 | 6  // Sunday, Monday, Saturday
  timeFormat: '12h' | '24h'
  workingHoursStart: number // 0-23
  workingHoursEnd: number   // 0-23

  // Task configuration
  taskSupertags: string[]      // Supertag systemIds to treat as tasks
  eventSupertags: string[]     // Supertag systemIds to treat as events
  statusField: string          // Field for task status
  doneStatuses: string[]       // Values that mean "completed"

  // Display options
  showCompletedTasks: boolean
  completedTaskStyle: 'muted' | 'strikethrough' | 'hidden'

  // Google Calendar
  googleCalendarId: string | null
  syncEnabled: boolean
}
```

### 4.6 Server Functions API

```typescript
// packages/nxus-calendar/src/server/calendar.server.ts

// Get events for date range
export const getCalendarEventsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    startDate: z.string(), // ISO date
    endDate: z.string(),   // ISO date
    includeCompleted: z.boolean().optional(),
  }))
  .handler(async (ctx) => { /* ... */ })

// Create event/task
export const createCalendarEventServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    title: z.string().min(1),
    startDate: z.string(),
    endDate: z.string().optional(),
    allDay: z.boolean().default(false),
    isTask: z.boolean().default(false),
    rrule: z.string().optional(),
    reminder: z.number().optional(),
  }))
  .handler(async (ctx) => { /* ... */ })

// Update event
export const updateCalendarEventServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    nodeId: z.string(),
    title: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    allDay: z.boolean().optional(),
    rrule: z.string().optional(),
  }))
  .handler(async (ctx) => { /* ... */ })

// Complete task
export const completeTaskServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    nodeId: z.string(),
    completed: z.boolean(),
  }))
  .handler(async (ctx) => { /* ... */ })

// Delete event
export const deleteCalendarEventServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => { /* ... */ })
```

### 4.7 Google Sync Server Functions

```typescript
// packages/nxus-calendar/src/server/google-sync.server.ts

// Get OAuth URL
export const getGoogleAuthUrlServerFn = createServerFn({ method: 'GET' })
  .handler(async () => { /* ... */ })

// Handle OAuth callback
export const handleGoogleCallbackServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ code: z.string() }))
  .handler(async (ctx) => { /* ... */ })

// Sync events to Google Calendar
export const syncToGoogleCalendarServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    eventIds: z.array(z.string()),
    calendarId: z.string().optional(), // Default to primary
  }))
  .handler(async (ctx) => { /* ... */ })

// Get sync status
export const getGoogleSyncStatusServerFn = createServerFn({ method: 'GET' })
  .handler(async () => { /* ... */ })
```

---

## 5. Delivery Phases

### Phase 1: Core Calendar Views (MVP)

**Goal:** Basic calendar display with day/week/month views

**Deliverables:**
- [ ] Package setup (`@nxus/calendar`)
- [ ] New system fields in nxus-db
- [ ] Calendar route in nxus-core
- [ ] CalendarContainer with react-big-calendar
- [ ] Day/Week/Month view switching
- [ ] Date navigation (prev/next/today)
- [ ] Event display from existing nodes with date fields
- [ ] Custom event rendering (visual distinction for tasks)
- [ ] Basic shadcn-themed calendar CSS

**Verification:**
- `pnpm lint` passes
- `pnpm build` succeeds
- Navigate to `/calendar` shows calendar
- Events with `field:start_date` appear on calendar
- Views switch correctly

### Phase 2: Task Completion & Event Creation

**Goal:** Interactive calendar with task management

**Deliverables:**
- [ ] Task checkbox in event block
- [ ] Task completion updates status field
- [ ] Click to create event/task modal
- [ ] Drag to create (time range selection)
- [ ] Event detail modal (view/edit)
- [ ] Calendar settings store (view preferences)

**Verification:**
- Click checkbox marks task complete
- Node status field updates in database
- Click on empty slot opens create modal
- New events appear immediately after creation
- Events can be edited via modal

### Phase 3: Drag & Drop + Recurring Events

**Goal:** Full event manipulation and recurrence

**Deliverables:**
- [ ] Drag to reschedule events
- [ ] Resize events to change duration
- [ ] RRULE support (parsing, display)
- [ ] Recurring event rendering (icon, tooltip)
- [ ] "Complete this instance" for recurring tasks
- [ ] Recurrence pattern editor in modal

**Verification:**
- Events can be dragged to new times
- Events can be resized
- Recurring events show recurrence icon
- Completing recurring task creates next instance
- RRULE patterns display in human-readable form

### Phase 4: Google Calendar Sync

**Goal:** One-way sync to Google Calendar

**Deliverables:**
- [ ] Google OAuth flow (server-side)
- [ ] Token storage (secure, in db or file)
- [ ] "Sync to Google Calendar" button
- [ ] Sync visible events to Google
- [ ] Store `gcal_event_id` in node properties
- [ ] Update existing Google events on re-sync
- [ ] Sync status indicators on events
- [ ] Error handling and retry logic

**Verification:**
- OAuth flow completes successfully
- Events appear in Google Calendar
- Re-sync updates existing events (not duplicates)
- Sync status badge shows last sync time
- Errors displayed to user with retry option

### Phase 5: Polish & Settings

**Goal:** Production-ready calendar experience

**Deliverables:**
- [ ] Calendar settings UI (preferences page)
- [ ] Configurable task/event supertags
- [ ] Configurable status field and done values
- [ ] Completed task display options
- [ ] Time format preference (12h/24h)
- [ ] Week start preference
- [ ] Working hours configuration
- [ ] Mobile responsive layout
- [ ] Keyboard shortcuts

**Verification:**
- Settings persist across sessions
- All preferences affect calendar behavior
- Calendar usable on mobile devices
- Standard keyboard shortcuts work (n=new, t=today)

---

## 6. Verification Approach

### 6.1 Lint & Type Checking

```bash
# Run from repository root
pnpm lint           # ESLint across all packages
pnpm typecheck      # TypeScript compilation check
```

### 6.2 Build Verification

```bash
pnpm build          # Build all packages
# Verify no errors in @nxus/calendar package
```

### 6.3 Manual Testing Checklist

**Phase 1:**
- [ ] `/calendar` route loads without errors
- [ ] Calendar displays current month
- [ ] Day/Week/Month view buttons work
- [ ] Prev/Next navigation changes dates
- [ ] Today button returns to current date
- [ ] Events with dates appear in correct positions
- [ ] Tasks show checkbox icon
- [ ] Events show without checkbox
- [ ] Dark/light mode styling correct

**Phase 2:**
- [ ] Clicking task checkbox updates UI immediately
- [ ] Task status persists after page reload
- [ ] Clicking empty time slot opens create modal
- [ ] Dragging across time creates event with duration
- [ ] Created events appear without refresh
- [ ] Event modal shows all details
- [ ] Edits in modal save correctly

**Phase 3:**
- [ ] Dragging event changes its time
- [ ] Resizing event changes duration
- [ ] RRULE events show recurrence icon
- [ ] Hover shows recurrence description
- [ ] Completing recurring task shows next instance
- [ ] Event modal has recurrence editor

**Phase 4:**
- [ ] "Connect Google Calendar" initiates OAuth
- [ ] OAuth callback stores tokens
- [ ] "Sync" button creates Google events
- [ ] Re-sync updates, doesn't duplicate
- [ ] Sync status shows on events
- [ ] Expired tokens trigger re-auth

**Phase 5:**
- [ ] Settings page accessible
- [ ] All settings persist
- [ ] Settings affect calendar behavior
- [ ] Calendar works on mobile viewport
- [ ] Keyboard shortcuts functional

### 6.4 Database Verification

```sql
-- Verify system fields exist
SELECT * FROM nodes WHERE system_id LIKE 'field:start_date%';
SELECT * FROM nodes WHERE system_id LIKE 'field:gcal_%';

-- Verify events have calendar properties
SELECT n.content, np.value
FROM nodes n
JOIN node_properties np ON n.id = np.node_id
WHERE np.field_node_id = (SELECT id FROM nodes WHERE system_id = 'field:start_date');
```

---

## 7. Risk Mitigation

### 7.1 Technical Risks

| Risk | Mitigation |
|------|------------|
| react-big-calendar CSS conflicts | Scope all styles under `.nxus-calendar` class |
| Date timezone issues | Use UTC internally, convert for display |
| Query performance with many events | Add index on `field:start_date` value, implement pagination |
| Google OAuth token expiration | Implement refresh token flow, graceful re-auth |
| Large recurring event series | Limit expansion to visible date range |

### 7.2 UX Considerations

| Concern | Approach |
|---------|----------|
| Slow event loading | Show skeleton loading state, optimistic updates |
| Sync failures | Clear error messages, retry button, offline indicator |
| Mobile usability | Default to day view on mobile, larger touch targets |
| Accessibility | ARIA labels, keyboard navigation, screen reader support |

---

## 8. Dependencies

### 8.1 New npm Dependencies

```json
// packages/nxus-calendar/package.json
{
  "dependencies": {
    "react-big-calendar": "^1.15.0",
    "date-fns": "^4.1.0",
    "rrule": "^2.8.1",
    "googleapis": "^144.0.0",
    "@nxus/db": "workspace:*",
    "@nxus/ui": "workspace:*"
  },
  "devDependencies": {
    "@types/react-big-calendar": "^1.8.12"
  }
}
```

### 8.2 Peer Dependencies

- React 19.x (from workspace)
- TanStack Router (from nxus-core)
- TanStack Query (from nxus-core)
- Zustand (from workspace)

---

## 9. Open Technical Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Calendar library | react-big-calendar vs FullCalendar vs custom | react-big-calendar (free, mature, customizable) |
| Token storage | SQLite vs file vs env | SQLite (encrypted field) for consistency |
| Recurrence expansion | Pre-expand vs on-demand | On-demand for visible range (performance) |
| Event color scheme | Fixed colors vs user-configurable | Fixed MVP, user-configurable in Phase 5 |
| Offline support | None vs service worker cache | None for MVP, consider for future |

---

## 10. References

- [react-big-calendar Documentation](http://jquense.github.io/react-big-calendar/examples/)
- [shadcn-ui-big-calendar](https://github.com/list-jonas/shadcn-ui-big-calendar) - CSS theme reference
- [Google Calendar API Reference](https://developers.google.com/calendar/api/v3/reference)
- [RFC 5545 (iCalendar/RRULE)](https://datatracker.ietf.org/doc/html/rfc5545)
- [rrule.js Documentation](https://github.com/jakubroztocil/rrule)
- [Tana Calendar Screenshot](/.zenflow-images/81119e10-9ab9-4b79-8822-8a46c1ed5ec8.png) - Visual reference
