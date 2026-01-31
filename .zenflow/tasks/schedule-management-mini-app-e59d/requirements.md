# Product Requirements Document: Schedule Management Mini App

## Overview

A Tana-inspired calendar mini app for viewing and managing Tasks and Events from the node-based system. The app displays nodes with date/time fields on a calendar interface, supports task completion, and provides one-way sync to Google Calendar.

## Problem Statement

Users need a dedicated calendar view to:
1. Visualize their Tasks and Events in a time-based format (day/week/month)
2. Quickly complete tasks directly from the calendar
3. Create new events and tasks by interacting with the calendar
4. Sync their schedule to Google Calendar for external visibility

Currently, the workbench provides list/graph views but lacks a temporal, calendar-based visualization.

## Target Users

Users of the Nxus system who:
- Have nodes tagged with `supertag:task` or `supertag:event`
- Want to visualize their schedule temporally
- Need to sync schedules to Google Calendar

## Core Features

### 1. Calendar Views

**Day View**
- Single day display with hourly time slots (similar to Tana screenshot)
- All-day section at top for events without specific times
- Events/tasks displayed as blocks spanning their duration
- Visual distinction between Tasks (with checkbox) and Events

**Week View**
- 7-day grid with hourly rows
- Same event block rendering as day view
- Horizontal scrolling for narrow screens

**Month View**
- Traditional calendar grid
- Events shown as compact pills/chips
- Click to expand day or navigate to day view

**View Navigation**
- Toggle buttons: Day | Week | Month (like Tana)
- Date navigation: Previous/Next arrows + calendar picker
- "Today" button for quick return to current date

### 2. Event & Task Display

**Data Source**
- Queries are constructed dynamically based on the current view's date range
- Queries filter for nodes with:
  - `supertag:task` OR `supertag:event` (or user-configured supertags)
  - Date field within the visible date range

**Task Rendering**
- Checkbox displayed alongside task title
- Bell/reminder icon for tasks with reminders (like Tana)
- Time range displayed (e.g., "08:15 AM → 10:30 AM")
- Background color indicates category/status

**Event Rendering**
- Similar to tasks but without checkbox
- Title and time range displayed
- Color coding by category or type

**Completed Tasks**
- Configurable behavior:
  - Option A: Visually distinct (strikethrough, muted colors) but visible
  - Option B: Hidden from view
- User preference stored in app settings

### 3. Task Completion

**Checkbox Interaction**
- Click checkbox to mark task complete
- Updates the configured status field (e.g., `field:status`)
- If multiple statuses exist, cycles through them in order
- Completion state determined by user-configured "done" status value

**Configuration**
- User configures which supertags are treated as "tasks"
- User selects which field represents status
- User defines which status value(s) mean "done"

### 4. Event/Task Creation

**Click to Create**
- Click on empty time slot to create new event/task
- Opens creation modal with pre-filled date/time
- User selects type (Task or Event) and fills details

**Drag to Create**
- Drag across time slots to create event spanning that duration
- Opens same creation modal with start/end time pre-filled

**Quick Create**
- Minimal required fields: title, type, date/time
- Optional: description, status, tags, reminder

### 5. Event/Task Editing

**Inline Editing**
- Click event block to open detail panel/modal
- Edit title, time, description, and properties
- Changes saved to underlying node

**Drag to Reschedule**
- Drag event block to different time slot
- Updates start/end time automatically

**Resize Duration**
- Drag event edges to change duration
- Updates end time automatically

### 6. Google Calendar Sync

**Sync Direction**
- One-way push: App → Google Calendar
- App is the source of truth

**Sync Scope**
- "Sync to Google Calendar" button syncs all visible events
- Each synced event tagged with app-generated ID for tracking

**Event Tracking**
- Store Google Calendar event ID in node property (e.g., `field:gcal_event_id`)
- On subsequent syncs:
  - If `gcal_event_id` exists: Update the Google Calendar event
  - If `gcal_event_id` is empty: Create new Google Calendar event

**Sync Metadata**
- Store sync timestamp in node property (e.g., `field:gcal_synced_at`)
- Visual indicator on events showing sync status

**Authentication**
- OAuth 2.0 flow for Google Calendar API
- Store tokens securely
- Re-auth prompt if tokens expire

### 7. Recurring Events

**RRULE Support**
- Events can have `field:rrule` property with recurrence pattern
- Examples: `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,WE,FR`

**Display**
- Recurring events show recurrence icon
- Tooltip/detail shows recurrence pattern in human-readable form

**Completion Behavior**
- "Complete this instance" action:
  1. Marks current instance as done
  2. Creates next instance based on RRULE
  3. New instance starts from current date (not past)

**Editing Recurring Events**
- Edit affects only the series pattern
- Individual instance changes not supported in MVP

### 8. Saved Queries

**Dynamic vs Saved**
- Navigation creates temporary (non-persisted) queries
- User can explicitly "Save this view" to create a persisted query node
- Saved queries appear in a sidebar/dropdown for quick access

**Query Structure**
- Base filter: Supertag filter (Task OR Event)
- Date filter: Temporal filter for visible date range
- Optional: Status filter, tag filter, etc.

## User Interface

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [≡]  Schedule    [Day] [Week] [Month]    < Jan 31 2026 >  │
│       ──────────                          [Today] [Sync]   │
├─────────────────────────────────────────────────────────────┤
│ all-day │                                                   │
├─────────┼───────────────────────────────────────────────────┤
│ 06:00   │                                                   │
├─────────┼───────────────────────────────────────────────────┤
│ 07:00   │                                                   │
├─────────┼───────────────────────────────────────────────────┤
│ 08:00   │ ┌─────────────────────────────────────────────┐   │
│         │ │ ☐ 🔔 Clean up PC                            │   │
│ 09:00   │ │    08:15 AM → 10:30 AM                      │   │
│         │ │                                              │   │
│ 10:00   │ └─────────────────────────────────────────────┘   │
│         │ ┌─────────────────────────────────────────────┐   │
│ 11:00   │ │ ☐ 🔔 M4 mac order                           │   │
│         │ │    10:30 AM → 11:30 AM                      │   │
│         │ └─────────────────────────────────────────────┘   │
└─────────┴───────────────────────────────────────────────────┘
```

### Color Scheme
- Follow existing Nxus theming (CSS variables)
- Tasks: Yellow/amber background (like Tana reference)
- Events: Blue/teal background
- Completed: Muted/grayed out

### Responsive Behavior
- Desktop: Full calendar grid
- Tablet: Compressed week view or default to day view
- Mobile: Day view with swipe navigation

## Technical Architecture

### Package Structure

```
packages/nxus-calendar/
├── src/
│   ├── index.ts              # Public exports
│   ├── route.tsx             # CalendarRoute component
│   ├── components/
│   │   ├── calendar-views/
│   │   │   ├── day-view.tsx
│   │   │   ├── week-view.tsx
│   │   │   └── month-view.tsx
│   │   ├── event-block.tsx
│   │   ├── task-checkbox.tsx
│   │   ├── event-modal.tsx
│   │   ├── create-event-modal.tsx
│   │   └── time-grid.tsx
│   ├── hooks/
│   │   ├── use-calendar-events.ts
│   │   ├── use-calendar-navigation.ts
│   │   └── use-google-sync.ts
│   ├── stores/
│   │   └── calendar-settings.store.ts
│   ├── server/
│   │   ├── index.ts
│   │   ├── calendar.server.ts
│   │   └── google-sync.server.ts
│   └── lib/
│       ├── date-utils.ts
│       ├── rrule-utils.ts
│       └── query-builder.ts
├── package.json
└── tsconfig.json
```

### Integration with nxus-core

```typescript
// packages/nxus-core/src/routes/calendar.tsx
import { createFileRoute } from '@tanstack/react-router'
import { CalendarRoute } from '@nxus/calendar'

export const Route = createFileRoute('/calendar')({ component: Calendar })

function Calendar() {
  return <CalendarRoute />
}
```

### Data Model Extensions

**New Fields**
```typescript
// System fields to add in nxus-db
'field:start_date'      // Date/datetime for event start
'field:end_date'        // Date/datetime for event end (optional, for duration)
'field:all_day'         // Boolean for all-day events
'field:rrule'           // String for recurrence pattern
'field:gcal_event_id'   // Google Calendar event ID
'field:gcal_synced_at'  // Last sync timestamp
```

**Existing Fields Used**
```typescript
'field:status'          // Task status (existing)
'field:supertag'        // Node type identifier (existing)
```

### Calendar Settings Store

```typescript
interface CalendarSettings {
  // View preferences
  defaultView: 'day' | 'week' | 'month'
  weekStartsOn: 0 | 1 | 6  // Sunday, Monday, Saturday
  timeFormat: '12h' | '24h'

  // Task configuration
  taskSupertags: string[]     // Which supertags to treat as tasks (default: ['supertag:task'])
  statusField: string         // Which field holds status (default: 'field:status')
  doneStatuses: string[]      // Which values mean "done" (default: ['done', 'completed'])

  // Completed task display
  showCompletedTasks: boolean
  completedTaskStyle: 'muted' | 'strikethrough' | 'hidden'

  // Google Calendar
  googleCalendarId: string | null  // Which calendar to sync to
  syncEnabled: boolean
}
```

### Recommended Libraries

**Calendar UI**
- **react-big-calendar** with [shadcn-ui-big-calendar](https://github.com/list-jonas/shadcn-ui-big-calendar) CSS theme
  - Mature, well-tested
  - Supports day/week/month views out of the box
  - Drag-and-drop support
  - Integrates with existing Tailwind/shadcn theming

**Date Handling**
- **date-fns** - Already standard in the ecosystem, lightweight

**Recurrence**
- **rrule** npm package - Parse and generate RRULE patterns

**Google Calendar**
- **googleapis** npm package - Official Google API client

## Out of Scope (MVP)

1. Two-way Google Calendar sync
2. Multiple calendar support (different colors/categories)
3. Recurring event instance editing (edit single occurrence)
4. Calendar sharing/collaboration
5. Reminders/notifications (system-level)
6. Agenda/list view
7. Drag events between days in month view
8. Week number display
9. Time zone handling (uses local time)
10. Import from external calendars (ICS)

## Success Metrics

1. Users can view their tasks/events in Day, Week, and Month views
2. Task completion works with single click
3. Events can be created by clicking/dragging on the calendar
4. Events can be rescheduled via drag-and-drop
5. Google Calendar sync successfully pushes events
6. Recurring events display and complete correctly

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Sync direction? | One-way push (app → Google Calendar) |
| Query persistence? | Dynamic queries for navigation; explicit save for persistence |
| Package structure? | New `@nxus/calendar` package imported by nxus-core |
| Task status handling? | User-configurable field and "done" values |
| Recurring event completion? | Creates next instance from current date |

## References

- [Tana Calendar View](/.zenflow-images/81119e10-9ab9-4b79-8822-8a46c1ed5ec8.png) - Visual reference for day view
- [Square UI Calendar](https://square-ui-calendar.vercel.app/) - Modern calendar UI reference
- [shadcn-ui-big-calendar](https://github.com/list-jonas/shadcn-ui-big-calendar) - Shadcn-styled react-big-calendar
- [yassir-jeraidi/full-calendar](https://github.com/yassir-jeraidi/full-calendar) - Feature-rich shadcn calendar
- [Google Calendar Sync Best Practices](https://developers.google.com/workspace/calendar/api/guides/sync) - Sync strategy guidance
