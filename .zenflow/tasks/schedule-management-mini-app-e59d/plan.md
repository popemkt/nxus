# Schedule Management Mini App - Implementation Plan

## Configuration
- **Artifacts Path**: `.zenflow/tasks/schedule-management-mini-app-e59d`
- **Requirements**: `requirements.md`
- **Technical Spec**: `spec.md`

---

## Completed Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 833bd3fa-23f8-4305-8eb5-7840d580d1f5 -->
PRD saved to `requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 862d7109-0a38-43eb-9070-3ff4a022ffd5 -->
Technical specification saved to `spec.md`.

### [x] Step: Planning
<!-- chat-id: 78ff9a44-2960-45b1-be15-3ed595736c2b -->
Implementation plan created (this document).

---

## Implementation Steps

### [x] Step: Package Setup and System Fields
<!-- chat-id: c8e63604-b442-46e2-8558-57f08a710682 -->

Set up the `@nxus/calendar` package infrastructure and add calendar-related system fields to nxus-db.

**Tasks:**
- [x] Create `packages/nxus-calendar/` directory structure
- [x] Create `package.json` with dependencies (react-big-calendar, date-fns, rrule, googleapis)
- [x] Create `tsconfig.json` extending root config
- [x] Create `src/index.ts` (client exports - types only)
- [x] Create `src/server.ts` (server exports)
- [x] Add calendar system fields to `packages/nxus-db/src/schemas/node-schema.ts`:
  - `START_DATE: 'field:start_date'`
  - `END_DATE: 'field:end_date'`
  - `ALL_DAY: 'field:all_day'`
  - `RRULE: 'field:rrule'`
  - `GCAL_EVENT_ID: 'field:gcal_event_id'`
  - `GCAL_SYNCED_AT: 'field:gcal_synced_at'`
  - `REMINDER: 'field:reminder'`
- [x] Add system supertags if not present: `TASK`, `EVENT`
- [x] Update `pnpm-workspace.yaml` to include calendar package (already uses `packages/*` glob)
- [x] Update `packages/nxus-core/package.json` to depend on `@nxus/calendar`
- [x] Run `pnpm install` to link packages

**Verification:**
```bash
pnpm install && pnpm build
```

**Completed:** Package structure created, system fields and supertags added, build successful.

### [x] Step: Type Definitions and Utilities
<!-- chat-id: 41a3e350-957f-45fb-963e-dcaaaef1bcef -->

Create TypeScript types, Zod schemas, and date utility functions for calendar operations.

**Tasks:**
- [x] Create `src/types/calendar-event.ts`:
  - `CalendarEvent` interface (id, title, start, end, allDay, isTask, isCompleted, rrule, etc.)
  - `BigCalendarEvent` interface (wrapper for react-big-calendar)
  - Zod schemas for input validation
- [x] Create `src/types/google-sync.ts`:
  - `GoogleSyncStatus` type
  - `GoogleAuthState` type
  - Zod schemas for sync operations
- [x] Create `src/types/index.ts` exporting all types
- [x] Create `src/lib/date-utils.ts`:
  - `toUTC()`, `fromUTC()` - timezone conversion
  - `getDateRange(view, date)` - calculate visible date range for view
  - `formatTimeRange()` - display time ranges
- [x] Create `src/lib/rrule-utils.ts`:
  - `parseRRule()` - parse RRULE string
  - `expandRecurrence(rrule, range)` - expand instances within range
  - `formatRRuleHumanReadable()` - display recurrence pattern
  - `getNextInstance(rrule, fromDate)` - calculate next occurrence
- [x] Create `src/lib/query-builder.ts`:
  - `buildCalendarQuery(dateRange, options)` - build query for events in range
- [x] Create `src/lib/index.ts` exporting all utilities

**Verification:**
```bash
pnpm typecheck
```

**Completed:** All type definitions and utility functions created. TypeScript verification passed.

### [x] Step: Server Functions for Event CRUD
<!-- chat-id: ed3bb33a-7594-4265-b54b-89035a999e34 -->

Implement server functions for calendar event operations using the existing query evaluator.

**Tasks:**
- [x] Create `src/server/calendar.server.ts`:
  - `getCalendarEventsServerFn` - fetch events for date range using query evaluator
  - `createCalendarEventServerFn` - create new event/task node
  - `updateCalendarEventServerFn` - update event properties
  - `deleteCalendarEventServerFn` - delete event node
  - `completeTaskServerFn` - toggle task completion status
  - `getCalendarEventServerFn` - fetch single event by ID
- [x] Create `src/server/index.ts` exporting all server functions
- [x] Update `src/server.ts` to re-export from server/index.ts

**Key patterns to follow:**
- Use `createServerFn` from `@tanstack/react-start`
- Use Zod for input validation (via `.validator()`)
- Return `{ success: boolean, data?, error? }` pattern

**Verification:**
```bash
pnpm typecheck && pnpm build
```

**Completed:** All server functions created and verified with successful build.

### [x] Step: Zustand Store and React Hooks
<!-- chat-id: 107b36d0-9d43-4a0e-b40e-3d9530662b07 -->

Create the calendar settings store and React hooks for data fetching.

**Tasks:**
- [x] Create `src/stores/calendar-settings.store.ts`:
  - State: defaultView, weekStartsOn, timeFormat, taskSupertags, eventSupertags, statusField, doneStatuses, showCompletedTasks, completedTaskStyle, googleCalendarId, syncEnabled
  - Actions: setView, setTimeFormat, setTaskConfig, setGoogleConfig
  - Persist with zustand/persist middleware
- [x] Create `src/stores/index.ts`
- [x] Create `src/hooks/use-calendar-events.ts`:
  - Use TanStack Query to fetch events via server function
  - Accept dateRange parameter
  - Handle recurrence expansion client-side
- [x] Create `src/hooks/use-calendar-navigation.ts`:
  - State: currentDate, currentView
  - Actions: goToDate, goToToday, nextPeriod, prevPeriod, setView
- [x] Create `src/hooks/use-event-mutations.ts`:
  - Mutations for create, update, delete, complete
  - Optimistic updates with query invalidation
- [x] Create `src/hooks/index.ts`

**Verification:**
```bash
pnpm typecheck && pnpm lint
```

**Completed:** Created Zustand store (calendar-settings.store.ts) with persist middleware and React hooks (use-calendar-events, use-calendar-navigation, use-event-mutations). All files export through index.ts. TypeScript verification passed.

### [x] Step: Calendar CSS Theme
<!-- chat-id: f40be5fe-6848-44e5-94ab-aef05d95440b -->

Create shadcn-styled CSS for react-big-calendar that matches the Nxus design system.

**Tasks:**
- [x] Create `src/styles/calendar.css`:
  - Base react-big-calendar overrides
  - Map to Tailwind CSS variables (--background, --foreground, --primary, etc.)
  - Day/Week/Month view specific styles
  - Event block styles (task vs event distinction)
  - Time grid styling
  - All-day section styling
  - Toolbar styling
  - Dark mode support via CSS variables
- [x] Scope all styles under `.nxus-calendar` class to prevent conflicts
- [x] Style completed tasks (muted, strikethrough options)
- [x] Add responsive breakpoints for mobile
- [x] Update nxus-core styles.css to include calendar package as @source

**Reference:** shadcn-ui-big-calendar patterns from spec

**Verification:**
Visual inspection after component implementation

**Completed:** Created comprehensive calendar.css with:
- Full react-big-calendar override scoped under `.nxus-calendar` class
- All views styled (Day, Week, Month, Agenda)
- Event blocks with task vs event distinction using data attributes
- Completed task styles (muted + strikethrough options)
- Recurring event and reminder indicators
- Google sync status indicator
- Current time indicator
- Drag-and-drop styles
- Selection/slot highlighting
- Responsive breakpoints (tablet: 1024px, mobile: 640px)
- Loading/empty/skeleton states
- Accessibility: focus-visible, reduced-motion, print styles
- Dark mode inherits from Nxus theme CSS variables automatically

### [x] Step: Core Calendar Components
<!-- chat-id: 60f1c715-b73e-431e-a0c4-53fbc65c12f0 -->

Build the main calendar container and view components using react-big-calendar.

**Tasks:**
- [x] Create `src/components/calendar-container.tsx`:
  - Wrapper component integrating react-big-calendar
  - Configure date-fns localizer
  - Pass events, views, navigation handlers
  - Import calendar.css
- [x] Create `src/components/calendar-toolbar.tsx`:
  - View switcher (Day | Week | Month buttons)
  - Date navigation (< Today >)
  - Date picker for jumping to specific date
  - Sync to Google button (placeholder)
- [x] Create `src/components/event-block.tsx`:
  - Custom event component for react-big-calendar
  - Render checkbox for tasks
  - Show reminder icon if set
  - Display time range
  - Handle click for event details
- [x] Create `src/components/task-checkbox.tsx`:
  - Inline checkbox component
  - Handle click without propagation
  - Call completeTask mutation
  - Show loading state during update
- [x] Create `src/components/index.ts`

**Verification:**
```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Completed:** Created all core calendar components:
- `calendar-container.tsx`: Main calendar wrapper integrating react-big-calendar with date-fns localizer, custom components, slot selection, event handlers, loading states, and empty/skeleton states
- `calendar-toolbar.tsx`: Custom toolbar with view switcher (Day/Week/Month/Agenda), navigation controls, period label, Google sync button placeholder, settings button, and mobile-responsive dropdown
- `event-block.tsx`: Custom event component with task checkbox, reminder/recurring/sync indicators, completion styling, and agenda view variant
- `task-checkbox.tsx`: Inline checkbox with click propagation handling, loading state, and keyboard accessibility
- `index.ts`: Exports all components and types
- Updated `src/index.ts` to export components

TypeScript verification and build passed successfully.

### [x] Step: Route Integration
<!-- chat-id: 2dfa5174-58f3-4f70-91e3-baa3bd63e7f8 -->

Add the calendar route to nxus-core and create the main route component.

**Tasks:**
- [x] Create `src/route.tsx` in nxus-calendar:
  - Main CalendarRoute component
  - Compose calendar container, toolbar, hooks
  - Initialize calendar settings store
  - Handle empty state (no events)
- [x] Create `packages/nxus-core/src/routes/calendar.tsx`:
  - TanStack Router file-based route
  - Import and render CalendarRoute from @nxus/calendar
- [x] Add calendar link to navigation (in floating-hud.tsx)
- [x] Update exports in `src/index.ts`

**Verification:**
```bash
pnpm dev
# Vite dev server starts without errors
# Manual: Navigate to /calendar, verify page loads
```

**Completed:** Route integration implemented:
- Created `packages/nxus-calendar/src/route.tsx` with CalendarRoute component that:
  - Composes CalendarContainer, CalendarToolbar, hooks (useCalendarNavigation, useCalendarEvents, useCompleteTask)
  - Handles loading, error, and empty states
  - Supports props for create/edit event callbacks (for modal integration in later steps)
  - Includes back button navigation and header
- Created `packages/nxus-core/src/routes/calendar.tsx` with TanStack Router file-based route
- Added calendar icon link to navigation in `floating-hud.tsx`
- Updated `src/index.ts` exports to include CalendarRoute

Dev server starts without errors.

### [ ] Step: Event Creation Modal

Implement the modal for creating new events and tasks.

**Tasks:**
- [ ] Create `src/components/create-event-modal.tsx`:
  - Modal using @nxus/ui AlertDialog or custom dialog
  - Form fields: title, type (task/event), start date/time, end date/time, all-day toggle
  - Optional: description, reminder, recurrence pattern
  - Pre-fill date/time from clicked slot
  - Submit calls createCalendarEventServerFn
  - Close on success, show error on failure
- [ ] Add drag-to-create handler in calendar-container
  - onSelectSlot callback from react-big-calendar
  - Open modal with pre-filled time range
- [ ] Add click-to-create handler
  - onSelectSlot for single click
  - Open modal with clicked time

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Click on empty slot, verify modal opens with correct time
# Manual: Create event, verify it appears on calendar
```

### [ ] Step: Event Detail Modal

Implement the modal for viewing and editing existing events.

**Tasks:**
- [ ] Create `src/components/event-modal.tsx`:
  - View mode: display all event details
  - Edit mode: form to modify event properties
  - Delete button with confirmation
  - Show sync status if synced to Google
  - For tasks: show completion checkbox
- [ ] Add event click handler in calendar-container
  - onSelectEvent callback
  - Open event modal with event data
- [ ] Integrate mutations for update/delete

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Click event, verify modal shows details
# Manual: Edit event, verify changes persist
# Manual: Delete event, verify removal
```

### [ ] Step: Drag and Drop Rescheduling

Enable drag-and-drop to reschedule and resize events.

**Tasks:**
- [ ] Enable drag-and-drop in calendar-container:
  - Import `withDragAndDrop` HOC from react-big-calendar/lib/addons/dragAndDrop
  - Import drag-and-drop CSS
  - Configure draggableAccessor, resizableAccessor
- [ ] Add `onEventDrop` handler:
  - Calculate new start/end from drop info
  - Call updateCalendarEventServerFn
  - Optimistic update in UI
- [ ] Add `onEventResize` handler:
  - Calculate new duration from resize info
  - Call updateCalendarEventServerFn
  - Optimistic update in UI
- [ ] Disable drag for completed tasks (optional)

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Drag event to new time, verify update
# Manual: Resize event, verify duration change
```

### [ ] Step: Recurring Events Support

Implement recurrence pattern handling for events.

**Tasks:**
- [ ] Update event creation modal:
  - Add recurrence pattern selector
  - Options: None, Daily, Weekly, Monthly, Custom
  - Custom opens RRULE editor (weekdays, interval, until/count)
  - Store as RRULE string in field:rrule
- [ ] Update use-calendar-events hook:
  - Expand recurring events within visible date range
  - Use rrule-utils expandRecurrence function
  - Add recurrence icon to expanded instances
- [ ] Update event-block component:
  - Show recurrence icon if event has rrule
  - Tooltip shows human-readable recurrence
- [ ] Update completeTaskServerFn for recurring tasks:
  - Mark current instance complete
  - Create next instance using getNextInstance
  - New instance starts from completion date

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Create recurring event, verify instances appear
# Manual: Complete recurring task, verify next instance created
```

### [ ] Step: Google Calendar Sync Server Functions

Implement server-side Google Calendar integration.

**Tasks:**
- [ ] Create `src/server/google-sync.server.ts`:
  - `getGoogleAuthUrlServerFn` - generate OAuth URL
  - `handleGoogleCallbackServerFn` - exchange code for tokens, store securely
  - `syncToGoogleCalendarServerFn` - push events to Google Calendar
  - `getGoogleSyncStatusServerFn` - check connection status
- [ ] Create `src/lib/google-calendar.ts`:
  - Initialize Google Calendar API client
  - `createGoogleEvent(event)` - create event in Google Calendar
  - `updateGoogleEvent(event)` - update existing Google event
  - `deleteGoogleEvent(eventId)` - remove from Google Calendar
- [ ] Token storage:
  - Store encrypted in node properties or separate config
  - Handle token refresh automatically
- [ ] Update exports

**Verification:**
```bash
pnpm typecheck && pnpm lint
```

### [ ] Step: Google Sync UI Components

Add UI components for Google Calendar sync.

**Tasks:**
- [ ] Create `src/hooks/use-google-sync.ts`:
  - State: isConnected, isSyncing, lastSyncAt, error
  - Actions: connect, disconnect, sync
  - Use TanStack Query for status polling
- [ ] Create `src/components/sync-status-badge.tsx`:
  - Show sync status on individual events
  - Icons: synced, pending, error
  - Tooltip with last sync time
- [ ] Update calendar-toolbar.tsx:
  - "Connect Google Calendar" button if not connected
  - "Sync" button if connected
  - Show loading state during sync
  - Show sync error toast on failure
- [ ] Add Google OAuth callback route:
  - Handle redirect from Google
  - Exchange code and store tokens
  - Redirect back to calendar

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Connect Google account, verify OAuth flow
# Manual: Sync events, verify they appear in Google Calendar
```

### [ ] Step: Calendar Settings UI

Build the settings interface for calendar preferences.

**Tasks:**
- [ ] Create `src/components/calendar-settings.tsx`:
  - Default view selector (Day/Week/Month)
  - Week starts on (Sunday/Monday/Saturday)
  - Time format (12h/24h)
  - Working hours (start/end)
  - Task supertag configuration
  - Status field configuration
  - "Done" status values configuration
  - Completed task display (show/hide, strikethrough/muted)
- [ ] Add settings button to toolbar or as route
- [ ] Persist settings via calendar-settings.store

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Change settings, verify they persist and affect calendar
```

### [ ] Step: Mobile Responsiveness and Polish

Optimize the calendar for mobile devices and add final polish.

**Tasks:**
- [ ] Update calendar.css for responsive breakpoints:
  - Mobile: default to day view, larger touch targets
  - Tablet: compressed week view
  - Desktop: full grid
- [ ] Add touch gesture support:
  - Swipe left/right for day navigation
  - Long press to create event
- [ ] Add keyboard shortcuts:
  - `n` - new event
  - `t` - go to today
  - `d/w/m` - switch views
  - Arrow keys for navigation
- [ ] Add loading skeletons for event fetching
- [ ] Add empty state component when no events
- [ ] Error boundary for graceful error handling

**Verification:**
```bash
pnpm typecheck && pnpm lint && pnpm build
# Manual: Test on mobile viewport
# Manual: Test keyboard shortcuts
```

### [ ] Step: Final Integration Testing

Comprehensive testing of all calendar features.

**Tasks:**
- [ ] Verify all views work (day, week, month)
- [ ] Verify event CRUD operations
- [ ] Verify task completion workflow
- [ ] Verify recurring events
- [ ] Verify Google Calendar sync (if credentials available)
- [ ] Verify settings persistence
- [ ] Verify dark/light mode
- [ ] Verify mobile responsiveness
- [ ] Document any known issues or limitations

**Verification:**
```bash
pnpm lint && pnpm build
# Full manual testing checklist from spec.md section 6.3
```

---

## Verification Commands

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Build all packages
pnpm build

# Start development server
pnpm dev
```

---

## Notes

- Each step should be completable in a single session
- Run verification commands after each step before proceeding
- The Google Calendar sync steps can be deferred if OAuth setup is complex
- Refer to `spec.md` for detailed API contracts and type definitions
- Follow existing codebase patterns from nxus-core, nxus-db, nxus-ui
