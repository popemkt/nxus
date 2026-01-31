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

### [x] Step: Event Creation Modal
<!-- chat-id: c916ce01-0c35-4a45-9c45-dd99cde20e29 -->

Implement the modal for creating new events and tasks.

**Tasks:**
- [x] Create `src/components/create-event-modal.tsx`:
  - Modal using @base-ui/react Dialog component
  - Form fields: title, type (task/event), start date/time, end date/time, all-day toggle
  - Optional: description, reminder
  - Pre-fill date/time from clicked slot
  - Submit calls createCalendarEventServerFn via useCreateEvent hook
  - Close on success, show error on failure
- [x] Add drag-to-create handler in calendar-container
  - onSelectSlot callback from react-big-calendar (already implemented)
  - Open modal with pre-filled time range
- [x] Add click-to-create handler
  - onSelectSlot for single click (already implemented)
  - Open modal with clicked time
- [x] Integrate modal in route.tsx:
  - Added `useBuiltInModal` prop to CalendarRoute
  - Modal opens automatically when selecting slots
  - Modal state managed internally with option for external handling

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Click on empty slot, verify modal opens with correct time
# Manual: Create event, verify it appears on calendar
```

**Completed:** Event Creation Modal implemented:
- Created `packages/nxus-calendar/src/components/create-event-modal.tsx` with:
  - Dialog using @base-ui/react Dialog primitive
  - Type toggle between Event and Task
  - Form fields: title, start/end date and time, all-day toggle
  - Description field (optional)
  - Reminder dropdown (5min, 10min, 15min, 30min, 1hr, 1day)
  - Pre-fills date/time from slot selection
  - Smart all-day detection from calendar selection
  - Loading state during creation
  - Error display and validation
- Updated `route.tsx`:
  - Added `useBuiltInModal` prop (defaults to true if no external handler)
  - Internal state management for modal open/close
  - Slot selection opens modal automatically
  - Modal closes and clears state on success
- Updated `components/index.ts` to export CreateEventModal
- Added required dependencies to package.json (@base-ui/react, @phosphor-icons/react, @tanstack/react-query, zustand)

TypeScript verification passed. Dev server starts without errors.

### [x] Step: Event Detail Modal
<!-- chat-id: c1260725-2bf3-44ab-8f62-ce9da64c56e7 -->

Implement the modal for viewing and editing existing events.

**Tasks:**
- [x] Create `src/components/event-modal.tsx`:
  - View mode: display all event details
  - Edit mode: form to modify event properties
  - Delete button with confirmation
  - Show sync status if synced to Google
  - For tasks: show completion checkbox
- [x] Add event click handler in calendar-container
  - onSelectEvent callback
  - Open event modal with event data
- [x] Integrate mutations for update/delete

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Click event, verify modal shows details
# Manual: Edit event, verify changes persist
# Manual: Delete event, verify removal
```

**Completed:** Event Detail Modal implemented:
- Created `packages/nxus-calendar/src/components/event-modal.tsx` with:
  - View mode: displays event title, date/time range, description, reminder, recurring indicator, Google sync status
  - For tasks: interactive completion checkbox in view mode
  - Edit mode: full form to modify title, dates, times, all-day toggle, description, reminder
  - Delete button with confirmation overlay dialog
  - Loading states for all mutations (update, delete, complete)
  - Error display and validation
- Updated `route.tsx`:
  - Added `useBuiltInEventModal` prop (defaults to true if no external handler)
  - State management for selected event and modal visibility
  - Event click opens modal automatically
  - Modal closes and clears state on delete success
- Updated `components/index.ts` to export EventModal and EventModalProps

TypeScript verification passed. Dev server starts without errors.

### [x] Step: Drag and Drop Rescheduling
<!-- chat-id: bdb7d01a-d604-49eb-b4e3-638f455460aa -->

Enable drag-and-drop to reschedule and resize events.

**Tasks:**
- [x] Enable drag-and-drop in calendar-container:
  - Import `withDragAndDrop` HOC from react-big-calendar/lib/addons/dragAndDrop
  - Import drag-and-drop CSS
  - Configure draggableAccessor, resizableAccessor
- [x] Add `onEventDrop` handler:
  - Calculate new start/end from drop info
  - Call updateCalendarEventServerFn
  - Optimistic update in UI
- [x] Add `onEventResize` handler:
  - Calculate new duration from resize info
  - Call updateCalendarEventServerFn
  - Optimistic update in UI
- [x] Disable drag for completed tasks (optional)

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Drag event to new time, verify update
# Manual: Resize event, verify duration change
```

**Completed:** Drag and drop rescheduling implemented:
- Updated `calendar-container.tsx`:
  - Imported `withDragAndDrop` HOC and `EventInteractionArgs` type
  - Imported drag-and-drop CSS from `react-big-calendar/lib/addons/dragAndDrop/styles.css`
  - Created `DragAndDropCalendar` component using `withDragAndDrop` HOC
  - Added `onEventDrop` and `onEventResize` props to CalendarContainerProps
  - Added `draggable` and `resizable` boolean props (default: true)
  - Implemented `handleEventDrop` and `handleEventResize` callbacks
  - Implemented `draggableAccessor` and `resizableAccessor` to disable drag/resize for completed tasks
  - Updated `eventPropGetter` to use CSS class names instead of data attributes
- Updated `route.tsx`:
  - Added `useUpdateEvent` hook import
  - Added `handleEventDrop` and `handleEventResize` handlers that call `updateEvent` mutation
  - Passed handlers to CalendarContainer with `draggable` and `resizable` props
  - Included `isUpdating` in the `isFetching` state for loading indicator
- TypeScript verification passed. Dev server starts without errors.

### [x] Step: Recurring Events Support
<!-- chat-id: 06b6e74a-1a02-4ed5-a218-6df83be4611b -->

Implement recurrence pattern handling for events.

**Tasks:**
- [x] Update event creation modal:
  - Add recurrence pattern selector
  - Options: None, Daily, Weekly, Monthly, Custom
  - Custom opens RRULE editor (weekdays, interval, until/count)
  - Store as RRULE string in field:rrule
- [x] Update use-calendar-events hook:
  - Expand recurring events within visible date range
  - Use rrule-utils expandRecurrence function
  - Add recurrence icon to expanded instances
- [x] Update event-block component:
  - Show recurrence icon if event has rrule
  - Tooltip shows human-readable recurrence
- [x] Update completeTaskServerFn for recurring tasks:
  - Mark current instance complete
  - Create next instance using getNextInstance
  - New instance starts from completion date

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Create recurring event, verify instances appear
# Manual: Complete recurring task, verify next instance created
```

**Completed:** Recurring Events Support implemented:
- Created `packages/nxus-calendar/src/components/recurrence-selector.tsx`:
  - RecurrenceSelector component with preset dropdown (None, Daily, Weekdays, Weekly, Biweekly, Monthly, Yearly)
  - Custom recurrence editor with interval, frequency, weekday selection (for weekly), and end condition (never, after N occurrences, on date)
  - Uses existing rrule-utils functions (buildRRule, parseToPattern, formatPatternHumanReadable)
- Updated `create-event-modal.tsx`:
  - Added RecurrenceSelector component to the form
  - Passes rrule to createCalendarEventServerFn
  - Computes startDateForRecurrence for the selector
- Updated `event-modal.tsx`:
  - Added RecurrenceSelector to edit mode
  - View mode shows human-readable recurrence description using formatRRuleHumanReadable
  - Passes rrule to updateCalendarEventServerFn
- Updated `completeTaskServerFn` in `calendar.server.ts`:
  - Detects if task is recurring (has rrule field)
  - When completing a recurring task: creates next instance with same properties and rrule, advances start date to next occurrence, clears rrule from completed instance
  - Uses getNextInstance from rrule-utils
- Note: use-calendar-events hook already had recurrence expansion implemented
- Note: event-block component already showed recurring icon

TypeScript verification passed. Build successful.

### [x] Step: Google Calendar Sync Server Functions
<!-- chat-id: 6eab1495-4ac4-4cc7-8434-2f42c555a9c9 -->

Implement server-side Google Calendar integration.

**Tasks:**
- [x] Create `src/server/google-sync.server.ts`:
  - `getGoogleAuthUrlServerFn` - generate OAuth URL
  - `handleGoogleCallbackServerFn` - exchange code for tokens, store securely
  - `syncToGoogleCalendarServerFn` - push events to Google Calendar
  - `getGoogleSyncStatusServerFn` - check connection status
  - `disconnectGoogleCalendarServerFn` - clear stored tokens
  - `getGoogleCalendarsServerFn` - list user's writable calendars
  - `setGoogleCalendarIdServerFn` - configure target calendar
- [x] Create `src/lib/google-calendar.ts`:
  - Initialize Google Calendar API client with OAuth2
  - `createGoogleEvent(event)` - create event in Google Calendar
  - `updateGoogleEvent(event)` - update existing Google event
  - `deleteGoogleEvent(eventId)` - remove from Google Calendar
  - `syncEventsToGoogle(events)` - batch sync multiple events
  - Token refresh and validation utilities
  - Error handling helpers (isAuthError, isRateLimitError)
- [x] Token storage:
  - Store in system node (item:google-calendar-settings)
  - Added new SYSTEM_FIELDS for token storage:
    - `GCAL_ACCESS_TOKEN`
    - `GCAL_REFRESH_TOKEN`
    - `GCAL_TOKEN_EXPIRY`
    - `GCAL_USER_EMAIL`
    - `GCAL_CALENDAR_ID`
  - Automatic token refresh when expired
- [x] Update exports in server/index.ts and lib/index.ts

**Verification:**
```bash
npx tsc --noEmit -p packages/nxus-calendar/tsconfig.json
# Passes without errors
```

**Completed:** Google Calendar Sync Server Functions implemented:
- Created `packages/nxus-calendar/src/lib/google-calendar.ts`:
  - OAuth2 client factory (createOAuth2Client, createAuthenticatedClient)
  - Auth URL generation and code exchange
  - Token refresh and expiration checking
  - Calendar list operations (listCalendars, getPrimaryCalendarId)
  - Event conversion (toGoogleCalendarEvent, fromGoogleCalendarEvent)
  - Event CRUD (createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, getGoogleEvent)
  - Batch sync (syncEventsToGoogle)
  - Error handling utilities
- Created `packages/nxus-calendar/src/server/google-sync.server.ts`:
  - All server functions for OAuth flow and sync operations
  - Settings node management for storing tokens
  - Token storage/retrieval/refresh
- Added SYSTEM_FIELDS for Google OAuth in nxus-db/src/schemas/node-schema.ts
- Updated exports in server/index.ts and lib/index.ts

TypeScript verification passed.

### [x] Step: Google Sync UI Components
<!-- chat-id: b7a16c3c-16bb-45ff-8721-74ab52321c48 -->

Add UI components for Google Calendar sync.

**Tasks:**
- [x] Create `src/hooks/use-google-sync.ts`:
  - State: isConnected, isSyncing, lastSyncAt, error
  - Actions: connect, disconnect, sync
  - Use TanStack Query for status polling
- [x] Create `src/components/sync-status-badge.tsx`:
  - Show sync status on individual events
  - Icons: synced, pending, error
  - Tooltip with last sync time
- [x] Update calendar-toolbar.tsx:
  - "Connect Google Calendar" button if not connected
  - "Sync" button if connected
  - Show loading state during sync
  - Show sync error toast on failure
- [x] Add Google OAuth callback route:
  - Handle redirect from Google
  - Exchange code and store tokens
  - Redirect back to calendar

**Verification:**
```bash
pnpm typecheck && pnpm lint
# Manual: Connect Google account, verify OAuth flow
# Manual: Sync events, verify they appear in Google Calendar
```

**Completed:** Google Sync UI Components implemented:
- Created `packages/nxus-calendar/src/hooks/use-google-sync.ts`:
  - `useGoogleSyncStatus` - TanStack Query hook for monitoring sync status with optional polling
  - `useGoogleSync` - Mutation hook for syncing events to Google Calendar
  - `useGoogleConnect` - Hook for OAuth flow (getAuthUrl, completeAuth, disconnect)
  - `useGoogleCalendars` - Hook for listing and selecting target calendars
  - `useGoogleCalendarSync` - Combined convenience hook with all sync functionality
  - Query keys export for cache management
- Created `packages/nxus-calendar/src/components/sync-status-badge.tsx`:
  - `SyncStatusBadge` - Shows sync status for individual events (synced, pending, syncing, error, not_synced)
  - `SyncIndicator` - Minimal Google icon indicator for synced events
  - `ConnectionStatus` - Display component showing connection state and email
  - `SyncButton` - Button component for triggering sync with status indicators
- Updated `packages/nxus-calendar/src/components/calendar-toolbar.tsx`:
  - Added `GoogleSyncToolbarButton` internal component with state-based rendering
  - Added new props: pendingCount, connectedEmail, syncError, onConnectClick
  - Shows different button states: not connected, syncing, connected with pending count, error
  - Added GoogleIcon, CloudOffIcon, AlertCircleIcon SVG components
- Created `packages/nxus-core/src/routes/calendar.oauth-callback.tsx`:
  - TanStack Router route at `/calendar/oauth-callback`
  - Handles OAuth code exchange from Google redirect
  - Shows processing, success, and error states
  - Auto-redirects to calendar on success
- Updated `packages/nxus-core/src/routes/calendar.tsx`:
  - Integrated `useGoogleCalendarSync` hook
  - Passes Google sync props to CalendarRoute
- Updated exports in hooks/index.ts and components/index.ts

TypeScript verification passed for nxus-calendar package.

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
