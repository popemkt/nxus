# PRD: Playwright E2E Tests for Critical Paths

## 1. Problem Statement

The nXus project — a monorepo with 4 mini apps (Gateway, Core, Workbench, Calendar) — has no end-to-end tests. Unit tests exist (Vitest, ~34 test files), but regressions frequently slip through because there is no automated validation of critical user flows across the UI. This PRD defines the requirements for a Playwright E2E test suite covering the most important paths first, with a structure that supports incremental expansion.

## 2. Goals

- **Prevent regressions** in critical user flows across all 4 mini apps.
- **Establish E2E infrastructure** (Playwright config, helpers, CI-ready setup) that is easy to extend.
- **Phase 1: Critical flows** — cover the paths that, if broken, block users or cause data loss.
- **Phase 2 (future):** Broader coverage of secondary flows and edge cases.

## 3. Non-Goals

- Visual regression / screenshot comparison testing (can be added later).
- Performance / load testing.
- Mobile/responsive testing (desktop-first, can add viewports later).
- Testing Google Calendar OAuth end-to-end (requires real Google credentials; mock-based validation only).
- Testing the terminal/PTY functionality in Core (requires real shell; smoke-test only).

## 4. Architecture Context

| Item | Detail |
|------|--------|
| Framework | React 19, TanStack Router, TanStack Query |
| Build | Vite 7, Nx monorepo, pnpm 10 |
| Apps | Gateway (:3001), Core (:3000 → /core), Workbench (:3002 → /workbench), Calendar (:3003 → /calendar) |
| Routing | Gateway proxies to other apps; each app has its own basepath |
| Data | SQLite + Drizzle ORM (local-first), server functions via TanStack Start + Nitro |
| Existing tests | Vitest unit tests (~34 files) |
| E2E tests | None |

## 5. Test Infrastructure Requirements

### 5.1 Playwright Setup

- **Location:** `e2e/` directory at the repo root.
- **Config:** `playwright.config.ts` at repo root.
- **Browser:** Chromium only (for speed; add Firefox/WebKit later if needed).
- **Base URL:** `http://localhost:3001` (Gateway, which proxies to all apps).
- **Web server:** Playwright config should start the dev servers (`pnpm dev`) automatically via `webServer` option, waiting for the gateway to be ready on port 3001.
- **Timeouts:** 30s per test, 60s for navigation actions.
- **Retries:** 1 retry on CI, 0 locally.
- **Reporter:** HTML reporter for local debugging; line reporter for CI.
- **Artifacts:** Screenshots on failure, traces on first retry.

### 5.2 Test Organization

```
e2e/
├── playwright.config.ts          # (or at repo root)
├── fixtures/
│   └── base.fixture.ts           # Custom fixtures (page helpers, etc.)
├── helpers/
│   └── navigation.ts             # Shared navigation helpers
├── gateway/
│   └── gateway.spec.ts           # Gateway tests
├── core/
│   ├── gallery.spec.ts           # App gallery/index tests
│   ├── app-detail.spec.ts        # App detail page tests
│   ├── inbox.spec.ts             # Inbox CRUD tests
│   ├── settings.spec.ts          # Settings tests
│   └── command-palette.spec.ts   # Command palette tests
├── workbench/
│   ├── node-browser.spec.ts      # List view / node browsing
│   ├── node-inspector.spec.ts    # Node inspector panel
│   ├── graph-view.spec.ts        # Graph visualization
│   └── query-builder.spec.ts     # Query builder
└── calendar/
    ├── calendar-view.spec.ts     # Calendar display & navigation
    ├── event-crud.spec.ts        # Create/read/update/delete events
    └── task-management.spec.ts   # Task completion flows
```

### 5.3 Scripts & CI

- `pnpm e2e` — run all E2E tests.
- `pnpm e2e:ui` — open Playwright UI mode for debugging.
- `pnpm e2e:headed` — run tests in headed browser.
- Tests should be runnable in CI (GitHub Actions or equivalent). The PRD does not require creating a CI pipeline file, but the config should be CI-compatible.

### 5.4 Gitignore Updates

Add to `.gitignore`:
- `test-results/`
- `playwright-report/`
- `blob-report/`
- `playwright/.cache/`

## 6. Critical Flows — Phase 1 Scope

### 6.1 Gateway

| # | Flow | What to verify |
|---|------|----------------|
| G1 | Landing page loads | Page title, heading "nXus", 3 mini app cards visible with correct names |
| G2 | Navigation to each mini app | Click each card → URL changes to `/core`, `/workbench`, `/calendar` and target page loads |

### 6.2 Core

| # | Flow | What to verify |
|---|------|----------------|
| C1 | Gallery page loads | HUD bar visible, app cards render (or empty state), search input present |
| C2 | Search filtering | Type in search → cards filter in real time; clear search → all cards return |
| C3 | View mode switching | Toggle Gallery/Table/Graph → content changes to matching view |
| C4 | Navigate to app detail | Click an app card → detail page loads with title, metadata, back button |
| C5 | App detail content | Verify sections render: thumbnail area, quick actions card, information sidebar |
| C6 | Navigate to Inbox | Click Inbox link in HUD → Inbox page loads with title |
| C7 | Inbox — add item | Click "Add Item" → modal opens → fill title → submit → item appears in pending list |
| C8 | Inbox — delete item | Delete an inbox item → item disappears from list |
| C9 | Navigate to Settings | Click Settings link → settings page loads with sidebar navigation |
| C10 | Settings — theme toggle | Toggle between light/dark mode → body class changes |
| C11 | Command palette open/close | Press Cmd+K → palette opens; press Escape → palette closes |
| C12 | Command palette search | Open palette → type query → results filter in real time |

### 6.3 Workbench

| # | Flow | What to verify |
|---|------|----------------|
| W1 | Workbench page loads | Sidebar, node browser panel, and inspector panel render |
| W2 | Node list renders | Nodes grouped by supertag appear; groups have headers with counts |
| W3 | Search nodes | Type in search input → node list filters |
| W4 | Select node | Click a node → inspector panel shows node details (title, properties, metadata) |
| W5 | Supertag filter | Click a supertag in sidebar → node list filters to that supertag |
| W6 | Switch to Graph view | Click graph icon in sidebar → graph canvas renders (2D force layout visible) |
| W7 | Switch to Query view | Click query icon in sidebar → query builder panel visible |
| W8 | Inline node edit | Double-click node title in inspector → edit mode activates; type new title → save |

### 6.4 Calendar

| # | Flow | What to verify |
|---|------|----------------|
| CA1 | Calendar page loads | Calendar grid visible, toolbar with navigation and view switcher present |
| CA2 | Calendar navigation | Click next/previous → period label updates; click "Today" → returns to current date |
| CA3 | View switching | Switch between day/week/month/agenda → calendar layout changes |
| CA4 | Create event | Click time slot → create modal opens → fill title, dates → submit → event appears on calendar |
| CA5 | View event details | Click existing event → event modal opens with title, time, description |
| CA6 | Edit event | Open event modal → click Edit → modify title → save → change reflected |
| CA7 | Delete event | Open event modal → click Delete → confirm → event removed from calendar |
| CA8 | Create task | Create event with "Task" type selected → task appears with checkbox |
| CA9 | Complete task | Click task checkbox → task marked as completed (strikethrough or style change) |
| CA10 | Recurring event | Create event with recurrence (e.g., daily) → multiple instances visible across dates |

## 7. Test Data Strategy

- **Seed data:** Tests that need pre-existing data (e.g., app detail, node browsing) should rely on the development database that ships with the project (`nxus.db`). If the database is empty, tests should create necessary data through the UI as setup steps.
- **Isolation:** Each test file should be independent. Tests within a file may share state if they run in order (use `test.describe.serial` for CRUD sequences like create → edit → delete).
- **Cleanup:** For create/delete flows (inbox items, calendar events), tests should clean up after themselves when possible, or rely on the dev database being in a known state.

## 8. Assumptions & Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Browser | Chromium only | Speed; cross-browser can be added later |
| Test against | Dev servers | Avoids build step; tests run against same servers developers use |
| Google OAuth | Not tested E2E | Requires real credentials; mock/stub if needed later |
| Terminal/PTY | Smoke-test only (palette opens) | Full PTY testing is fragile and environment-dependent |
| Database | Use existing dev DB | Avoids complex seeding; tests should handle empty-state gracefully |
| Parallel execution | Per-file parallelism | Default Playwright behavior; sufficient for this scale |

## 9. Success Criteria

- All Phase 1 tests pass against a fresh `pnpm dev` startup.
- Tests complete in under 3 minutes total (Chromium only).
- Zero flaky tests on merge (1 retry allowed).
- New contributors can run `pnpm e2e` with no additional setup beyond `pnpm install`.

## 10. Future Phases (Out of Scope)

- **Phase 2:** Drag-and-drop interactions (calendar reschedule, graph node dragging), tag management, instance installation flow, graph controls panel, query builder filters.
- **Phase 3:** Multi-browser testing (Firefox, WebKit), accessibility audits, visual regression snapshots, mobile viewports.
- **Phase 4:** CI pipeline integration, performance budgets, coverage reporting.
