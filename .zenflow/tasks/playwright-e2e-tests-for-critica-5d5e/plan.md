# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 1b0b4f1d-5962-4ef3-bc2a-05850459344a -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 059594a1-bcac-4ffb-8a2d-9dcfaf51a8b1 -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: 7e543e5e-dadb-441a-8208-02ed439b3280 -->

Broke down the spec into 7 concrete implementation steps below. Each step is a self-contained unit of work that can be verified independently.

### [x] Step: Infrastructure & Playwright Setup
<!-- chat-id: 5478cc45-132e-4955-b38d-757f1d23c027 -->

Set up Playwright, project scaffolding, scripts, and shared test utilities.

**Tasks:**
- [ ] Install `@playwright/test` as root devDependency: `pnpm add -Dw @playwright/test`
- [ ] Install Chromium browser: `npx playwright install chromium`
- [ ] Create `playwright.config.ts` at repo root per spec §4.1:
  - `testDir: './e2e'`, `baseURL: 'http://localhost:3001'`
  - `webServer.command: 'pnpm dev'`, `webServer.url: 'http://localhost:3001'`, `webServer.reuseExistingServer: !process.env.CI`, `webServer.timeout: 120_000`
  - Chromium-only project, HTML reporter locally / line for CI
  - `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`
  - `timeout: 30_000`, `expect.timeout: 10_000`, `actionTimeout: 15_000`
  - `retries: process.env.CI ? 1 : 0`, `workers: process.env.CI ? 1 : undefined`
  - `forbidOnly: !!process.env.CI`
- [ ] Create directory structure: `e2e/fixtures/`, `e2e/helpers/`, `e2e/gateway/`, `e2e/core/`, `e2e/workbench/`, `e2e/calendar/`
- [ ] Create `e2e/fixtures/base.fixture.ts` per spec §4.2 — extended `test` with `navigateToApp` helper
- [ ] Create `e2e/helpers/navigation.ts` per spec §4.3 — `APP_URLS` and `APP_NAMES` constants
- [ ] Add scripts to root `package.json`:
  - `"e2e": "playwright test"`
  - `"e2e:ui": "playwright test --ui"`
  - `"e2e:headed": "playwright test --headed"`
- [ ] Update `.gitignore` with: `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`
- [ ] Create `e2e/tsconfig.json` extending the base config

**Verification:**
- `npx playwright --version` succeeds
- Directory structure exists
- `pnpm e2e --help` resolves correctly

### [x] Step: Gateway E2E Tests (G1-G2)
<!-- chat-id: 937782b0-b2f8-4ef7-b6eb-38dafd7fbfa7 -->

Implement Gateway landing page and navigation tests.

**File:** `e2e/gateway/gateway.spec.ts`

**Tests to implement:**
- [ ] **G1 — Landing page loads:** Navigate to `/`. Verify page title, `h1` heading contains "nXus", subtitle "Select an application to get started", 3 mini app cards visible with names "nXus Core", "nXus Workbench", "nXus Calendar"
- [ ] **G2 — Navigation to each mini app:** Click each card → verify URL changes to `/core`, `/workbench`, `/calendar` respectively and target page loads (wait for content, not just URL)

**Key locators:**
- `page.getByRole('heading', { name: 'nXus' })` — main heading
- `page.getByText('nXus Core')`, `page.getByText('nXus Workbench')`, `page.getByText('nXus Calendar')` — card titles
- `page.locator('a[href="/core"]')`, `a[href="/workbench"]`, `a[href="/calendar"]` — navigation links

**Verification:** `pnpm e2e e2e/gateway/` passes

### [x] Step: Core App E2E Tests (C1-C12)
<!-- chat-id: 7337abe3-acf6-493a-b34b-0b8d2f263ccd -->

Implement all Core app tests across 5 spec files.

**File:** `e2e/core/gallery.spec.ts` — C1, C2, C3
- [ ] **C1 — Gallery page loads:** Navigate to `/core`. Verify search input with placeholder (e.g. "Search" text), app cards or empty state render
- [ ] **C2 — Search filtering:** Type in search input → cards filter in real time; clear search → all cards return
- [ ] **C3 — View mode switching:** Click Gallery/Table/Graph toggle buttons → content area changes to matching view. Graph view: verify canvas/ReactFlow element renders

**File:** `e2e/core/app-detail.spec.ts` — C4, C5
- [ ] **C4 — Navigate to app detail:** Click an app card in gallery → detail page loads with app title heading, back button visible
- [ ] **C5 — App detail content:** Verify sections render: thumbnail area (16:9 image or placeholder), Quick Actions card with buttons (Open, Refresh Status, Generate Thumbnail), Information sidebar with metadata (author, version, dates)

**File:** `e2e/core/inbox.spec.ts` — C6, C7, C8 (serial)
- [ ] **C6 — Navigate to Inbox:** From gallery, navigate to Inbox page → heading "Inbox" visible, "Add Item" button present
- [ ] **C7 — Add inbox item:** Click "Add Item" → modal opens with title "Add to Inbox" → fill title input (`#inbox-title`) → submit → item appears in Pending section
- [ ] **C8 — Delete inbox item:** Locate the created item → click trash/delete button → item disappears from list

**File:** `e2e/core/settings.spec.ts` — C9, C10
- [ ] **C9 — Navigate to Settings:** Navigate to `/core/settings` → heading "Settings" visible, sidebar with section tabs present
- [ ] **C10 — Theme toggle:** Find theme toggle in General section → toggle it → verify `<html>` or `<body>` class changes between dark/light

**File:** `e2e/core/command-palette.spec.ts` — C11, C12
- [ ] **C11 — Open/close command palette:** Press `Meta+k` → palette overlay visible with search input placeholder "Search commands..."; press `Escape` → palette closes
- [ ] **C12 — Command palette search:** Open palette → type query → results filter (verify result count changes or specific result appears/disappears)

**Key locators:**
- Gallery search: `page.getByPlaceholder(...)` matching search placeholder
- View mode buttons: look for icon buttons or text buttons for Gallery/Table/Graph
- Inbox modal title input: `page.locator('#inbox-title')`
- Inbox modal notes: `page.locator('#inbox-notes')`
- Command palette input: `page.getByPlaceholder('Search commands...')`
- Settings navigation: look for sidebar tab buttons
- Theme: check `document.documentElement.classList` for dark/light

**Verification:** `pnpm e2e e2e/core/` passes

### [ ] Step: Workbench App E2E Tests (W1-W8)

Implement all Workbench tests across 4 spec files.

**File:** `e2e/workbench/node-browser.spec.ts` — W1, W2, W3, W5
- [ ] **W1 — Page loads:** Navigate to `/workbench`. Verify sidebar (icon nav on far left), node browser panel, and inspector panel ("Select a node to inspect" fallback text) render
- [ ] **W2 — Node list renders:** Verify nodes grouped by supertag appear — look for group headers with format "#SupertagName (count)". If empty, verify empty state. Handle gracefully if DB has no nodes
- [ ] **W3 — Search nodes:** Type in search input (placeholder "Search all nodes...") → node list filters; clear → full list returns
- [ ] **W5 — Supertag filter:** Click a supertag group header or supertag in sidebar → node list filters to that supertag only

**File:** `e2e/workbench/node-inspector.spec.ts` — W4, W8
- [ ] **W4 — Select node:** Click a node in the browser list → inspector panel shows node details (title, properties section, supertags section). Skip if no nodes available
- [ ] **W8 — Inline node edit:** With node selected in inspector, double-click node title → edit mode activates (input appears); type new title → press Enter to save; verify title updated. Skip if no nodes available

**File:** `e2e/workbench/graph-view.spec.ts` — W6
- [ ] **W6 — Switch to Graph view:** Click graph icon in sidebar (tooltip "Graph View") → graph canvas renders (look for ReactFlow container or SVG/canvas element)

**File:** `e2e/workbench/query-builder.spec.ts` — W7
- [ ] **W7 — Switch to Query view:** Click query/funnel icon in sidebar (tooltip "Query Builder") → query builder panel becomes visible

**Key locators:**
- Sidebar icons: look for List, Graph, Funnel icon buttons with tooltips
- Search: `page.getByPlaceholder('Search all nodes...')`
- Node items: `NodeBadge` components within the browser list
- Inspector fallback: `page.getByText('Select a node to inspect')`
- Graph canvas: `page.locator('.react-flow')` or similar ReactFlow container selector

**Verification:** `pnpm e2e e2e/workbench/` passes

### [ ] Step: Calendar App E2E Tests — Views & Navigation (CA1-CA3)

Implement calendar display, navigation, and view switching tests.

**File:** `e2e/calendar/calendar-view.spec.ts` — CA1, CA2, CA3
- [ ] **CA1 — Calendar page loads:** Navigate to `/calendar`. Verify calendar grid/container visible, toolbar with navigation buttons (Previous/Next/Today) and view switcher (Day/Week/Month/Agenda) present, "New Event" button visible
- [ ] **CA2 — Calendar navigation:** Click Next → period label text updates; click Previous → label reverts; click "Today" → returns to current date period
- [ ] **CA3 — View switching:** Click each view button (Day, Week, Month, Agenda) → verify calendar layout changes (different CSS classes or structural changes for each view)

**Key locators:**
- Navigation: `page.getByRole('button', { name: 'Today' })`, Previous/Next buttons via ChevronLeft/ChevronRight icons or aria labels
- View buttons: `page.getByRole('button', { name: 'Day' })`, `Week`, `Month`, `Agenda`
- New Event: button with "New Event" text or Plus icon
- Calendar container: `.rbc-calendar` (react-big-calendar class)
- Period label: toolbar center text element

**Verification:** `pnpm e2e e2e/calendar/calendar-view.spec.ts` passes

### [ ] Step: Calendar App E2E Tests — Event CRUD (CA4-CA7)

Implement event create, read, update, delete tests as a serial sequence.

**File:** `e2e/calendar/event-crud.spec.ts` — CA4, CA5, CA6, CA7 (serial)
- [ ] **CA4 — Create event:** Click "New Event" button → create modal opens with title "New Event" → fill title input (`#event-title`), set start date (`#event-start-date`), start time (`#event-start-time`), end time (`#event-end-time`) → click "Create Event" → modal closes, event appears on calendar
- [ ] **CA5 — View event details:** Click the created event on the calendar → event modal opens showing title, time range, and any description
- [ ] **CA6 — Edit event:** In event modal, click Edit → modify title → click Save → verify change reflected on calendar
- [ ] **CA7 — Delete event:** Click the event → in modal click Delete → confirm deletion → event removed from calendar

**Key locators:**
- Create modal: title input `#event-title`, date inputs `#event-start-date`, `#event-start-time`, `#event-end-date`, `#event-end-time`
- Type toggle: Event/Task buttons in modal header
- Submit: button with text "Create Event"
- Event on calendar: `.rbc-event` elements or event title text
- Edit/Delete buttons in event modal

**Verification:** `pnpm e2e e2e/calendar/event-crud.spec.ts` passes

### [ ] Step: Calendar App E2E Tests — Tasks & Recurrence (CA8-CA10)

Implement task management and recurring event tests.

**File:** `e2e/calendar/task-management.spec.ts` — CA8, CA9, CA10 (serial for CA8-CA9)
- [ ] **CA8 — Create task:** Click "New Event" → in modal, click Task type toggle (CheckSquare icon) → title placeholder changes to "Task title..." → fill title, set date/time → click "Create Task" → task appears on calendar with checkbox indicator
- [ ] **CA9 — Complete task:** Find the created task on calendar → click its checkbox → task visual changes (strikethrough or completed style class `calendar-event-completed`)
- [ ] **CA10 — Recurring event:** Click "New Event" → fill title and dates → configure recurrence (e.g., daily via RecurrenceSelector) → create → verify multiple instances visible across different dates on the calendar

**Key locators:**
- Task toggle: button with CheckSquare icon in create modal
- Task checkbox: checkbox within event block on calendar
- Completed style: `.calendar-event-completed` class
- Recurrence selector: RecurrenceSelector component in create modal
- Recurring indicator: `.calendar-event-recurring` class

**Verification:**
- `pnpm e2e e2e/calendar/task-management.spec.ts` passes
- Full suite: `pnpm e2e` — all tests pass with 0 failures
