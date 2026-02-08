# Technical Specification: Playwright E2E Tests for Critical Paths

## 1. Technical Context

### 1.1 Language & Runtime

| Item | Value |
|------|-------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js (for Playwright test runner) |
| Package manager | pnpm 10.15.0 |
| Monorepo tool | Nx 22.3.3 |

### 1.2 Key Dependencies (Existing)

| Dependency | Version | Relevance |
|------------|---------|-----------|
| React | 19.2.0 | UI framework — all apps |
| TanStack Router | 1.132.0 | File-based routing in all apps |
| TanStack Start | 1.132.0 | SSR framework with Nitro |
| TanStack Query | 5.90.12 | Server-state management |
| Vite | 7.x | Build/dev tool |
| Vitest | 3.0.5 | Existing unit test framework |
| Tailwind CSS | 4.0.6 | Styling |
| shadcn/ui | 3.6.2 | Component library |
| react-big-calendar | 1.15.0 | Calendar component (Calendar app) |
| @xyflow/react | 12.10.0 | Graph visualization (Core, Workbench) |
| zustand | 5.0.9 | Client state management |
| better-sqlite3 | 12.6.0 | SQLite database (server-side) |
| drizzle-orm | 0.45.1 | ORM layer |

### 1.3 New Dependency

| Dependency | Version | Purpose |
|------------|---------|---------|
| @playwright/test | ^1.50.0 | E2E test framework (latest stable) |

Installed as a root-level devDependency. Playwright browsers are installed via `npx playwright install chromium` post-install.

### 1.4 Application Topology

```
┌─────────────────────────────────────────────────┐
│  Gateway (:3001)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ /core/*  │→ │Core:3000 │  │ index.tsx    │  │
│  │ /workbenc│→ │WB:3002   │  │ (landing)    │  │
│  │ /calenda │→ │Cal:3003  │  └──────────────┘  │
│  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────┘
```

All E2E tests run against `http://localhost:3001` (Gateway), which proxies requests to the individual apps. This matches the real user experience.

## 2. Implementation Approach

### 2.1 Design Principles

1. **Test through the Gateway** — All tests navigate via `http://localhost:3001`. This validates both the proxy layer and the individual apps.
2. **Use accessible locators** — Prefer `getByRole`, `getByText`, `getByPlaceholder`, and `getByLabel` over CSS selectors. The codebase has zero `data-testid` attributes; we avoid adding them to keep test changes isolated to the `e2e/` directory.
3. **No external dependencies** — Tests run against dev servers with the existing SQLite dev database. No Docker, no separate test database, no seeding scripts.
4. **Playwright conventions** — Follow Playwright best practices: fixtures for shared setup, `test.describe` for grouping, `test.describe.serial` for ordered CRUD flows, `expect` for assertions.
5. **Minimal footprint** — All E2E code lives under `e2e/` (plus config at root). No changes to app source code.

### 2.2 Test Identification Strategy

Since the codebase has no `data-testid` attributes, tests locate elements using:

| Priority | Locator | Example |
|----------|---------|---------|
| 1 | `getByRole` | `page.getByRole('heading', { name: 'nXus' })` |
| 2 | `getByText` | `page.getByText('nXus Core')` |
| 3 | `getByPlaceholder` | `page.getByPlaceholder('Search apps...')` |
| 4 | `getByLabel` | `page.getByLabel('Toggle theme')` |
| 5 | `locator` with semantic selectors | `page.locator('a[href="/core"]')` |

This aligns with Playwright's recommended testing-library-style approach and avoids coupling to implementation details.

## 3. Source Code Structure Changes

### 3.1 New Files

```
(repo root)
├── playwright.config.ts              # Playwright configuration
├── e2e/
│   ├── fixtures/
│   │   └── base.fixture.ts           # Custom test fixtures (extended page helpers)
│   ├── helpers/
│   │   └── navigation.ts             # Shared navigation utilities
│   ├── gateway/
│   │   └── gateway.spec.ts           # G1-G2: Landing page, navigation
│   ├── core/
│   │   ├── gallery.spec.ts           # C1-C3: Gallery page, search, view modes
│   │   ├── app-detail.spec.ts        # C4-C5: App detail page
│   │   ├── inbox.spec.ts             # C6-C8: Inbox CRUD
│   │   ├── settings.spec.ts          # C9-C10: Settings, theme toggle
│   │   └── command-palette.spec.ts   # C11-C12: Command palette
│   ├── workbench/
│   │   ├── node-browser.spec.ts      # W1-W3, W5: Node list, search, supertag filter
│   │   ├── node-inspector.spec.ts    # W4, W8: Node selection, inline edit
│   │   ├── graph-view.spec.ts        # W6: Graph visualization
│   │   └── query-builder.spec.ts     # W7: Query view
│   └── calendar/
│       ├── calendar-view.spec.ts     # CA1-CA3: Calendar display, navigation, views
│       ├── event-crud.spec.ts        # CA4-CA7: Event create/read/update/delete
│       └── task-management.spec.ts   # CA8-CA10: Task creation, completion, recurrence
```

### 3.2 Modified Files

| File | Change |
|------|--------|
| `package.json` (root) | Add `@playwright/test` devDependency; add `e2e`, `e2e:ui`, `e2e:headed` scripts |
| `.gitignore` | Add `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/` |

### 3.3 Unchanged

No changes to any app source code (`apps/`, `libs/`). Tests are purely additive.

## 4. Configuration Design

### 4.1 `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? 'line'
    : 'html',

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,   // 2 min — all 4 servers need to start
  },

  timeout: 30_000,       // 30s per test
  expect: {
    timeout: 10_000,     // 10s for expect assertions
  },
})
```

Key decisions:
- `reuseExistingServer: !process.env.CI` — In local dev, reuse already-running servers; in CI, start fresh.
- `workers: 1` in CI to avoid resource contention; unlimited locally for speed.
- Single `webServer` entry — `pnpm dev` starts all 4 apps concurrently.

### 4.2 Custom Fixture: `e2e/fixtures/base.fixture.ts`

Extends the base `test` with helpers for common operations:

```typescript
import { test as base, expect } from '@playwright/test'

type CustomFixtures = {
  /** Navigate to an app and wait for it to load */
  navigateToApp: (app: 'core' | 'workbench' | 'calendar') => Promise<void>
}

export const test = base.extend<CustomFixtures>({
  navigateToApp: async ({ page }, use) => {
    const navigate = async (app: 'core' | 'workbench' | 'calendar') => {
      await page.goto(`/${app}`)
      await page.waitForLoadState('networkidle')
    }
    await use(navigate)
  },
})

export { expect }
```

This keeps test files clean and avoids duplicating navigation boilerplate.

### 4.3 Helper: `e2e/helpers/navigation.ts`

Shared constants and utility functions:

```typescript
export const APP_URLS = {
  gateway: '/',
  core: '/core',
  workbench: '/workbench',
  calendar: '/calendar',
} as const

export const APP_NAMES = {
  core: 'nXus Core',
  workbench: 'nXus Workbench',
  calendar: 'nXus Calendar',
} as const
```

## 5. Test Design Patterns

### 5.1 Test Structure Convention

Each spec file follows this pattern:

```typescript
import { test, expect } from '../fixtures/base.fixture'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the page under test
    await page.goto('/core')
    await page.waitForLoadState('networkidle')
  })

  test('descriptive test name matching requirement ID', async ({ page }) => {
    // Arrange (if needed beyond beforeEach)
    // Act
    // Assert
  })
})
```

### 5.2 CRUD Sequences

For flows that depend on prior state (e.g., create event → edit it → delete it):

```typescript
test.describe.serial('Event CRUD', () => {
  test('CA4: create event', async ({ page }) => { ... })
  test('CA5: view event details', async ({ page }) => { ... })
  test('CA6: edit event', async ({ page }) => { ... })
  test('CA7: delete event', async ({ page }) => { ... })
})
```

`test.describe.serial` ensures tests run in order and share browser context, so state created in one test is visible in the next.

### 5.3 Resilient Waiting

Prefer Playwright's auto-waiting over manual waits:

```typescript
// Good — auto-waits for element
await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()

// Good — waits for navigation
await page.waitForURL('**/core')

// Avoid — arbitrary timeouts
// await page.waitForTimeout(2000)
```

### 5.4 Empty-State Handling

Some tests depend on existing data (e.g., nodes in Workbench, apps in Core gallery). The tests should:
1. First check if data exists.
2. If the page shows an empty state, skip gracefully or create data via UI as a setup step.

This avoids hard dependency on a specific dev database state.

## 6. Data Model / API / Interface Changes

**None.** This feature is purely additive test infrastructure. No changes to:
- Database schemas
- API endpoints / server functions
- TypeScript interfaces
- Component props or exports

## 7. Delivery Phases

### Phase 1: Infrastructure + Gateway (Foundation)

**Scope:**
- Install Playwright, configure `playwright.config.ts`
- Create fixtures, helpers, directory structure
- Update `package.json` scripts and `.gitignore`
- Implement Gateway tests (G1-G2)

**Verification:** `pnpm e2e e2e/gateway/` passes.

### Phase 2: Core App Tests

**Scope:**
- `gallery.spec.ts` — C1 (page loads), C2 (search), C3 (view modes)
- `app-detail.spec.ts` — C4 (navigate to detail), C5 (detail content)
- `inbox.spec.ts` — C6 (navigate to inbox), C7 (add item), C8 (delete item)
- `settings.spec.ts` — C9 (navigate to settings), C10 (theme toggle)
- `command-palette.spec.ts` — C11 (open/close), C12 (search)

**Verification:** `pnpm e2e e2e/core/` passes.

### Phase 3: Workbench App Tests

**Scope:**
- `node-browser.spec.ts` — W1 (page loads), W2 (node list), W3 (search), W5 (supertag filter)
- `node-inspector.spec.ts` — W4 (select node), W8 (inline edit)
- `graph-view.spec.ts` — W6 (graph renders)
- `query-builder.spec.ts` — W7 (query view renders)

**Verification:** `pnpm e2e e2e/workbench/` passes.

### Phase 4: Calendar App Tests

**Scope:**
- `calendar-view.spec.ts` — CA1 (page loads), CA2 (navigation), CA3 (view switching)
- `event-crud.spec.ts` — CA4-CA7 (create, view, edit, delete events)
- `task-management.spec.ts` — CA8 (create task), CA9 (complete task), CA10 (recurring event)

**Verification:** `pnpm e2e e2e/calendar/` passes.

### Phase 5: Full Suite Validation

**Scope:**
- Run complete suite: `pnpm e2e`
- Fix any cross-test interference or flakiness
- Verify all tests pass with `retries: 0`

**Verification:** `pnpm e2e` passes with 0 failures, completes under 3 minutes.

## 8. Verification Approach

### 8.1 Running Tests

| Command | Purpose |
|---------|---------|
| `pnpm e2e` | Run full E2E suite (headless Chromium) |
| `pnpm e2e:ui` | Open Playwright UI mode for interactive debugging |
| `pnpm e2e:headed` | Run in headed browser (visible) |
| `npx playwright test --grep "G1"` | Run specific test by name pattern |
| `npx playwright test e2e/core/` | Run tests for a specific app |

### 8.2 Per-Phase Verification

After each delivery phase:
1. Run the phase's tests: `npx playwright test e2e/<app>/`
2. Confirm all tests pass with 0 retries
3. Run the full suite to check for regressions: `pnpm e2e`

### 8.3 CI Compatibility

The config is CI-ready. In CI:
- `retries: 1` (tolerates one transient failure)
- `workers: 1` (sequential execution for stability)
- `forbidOnly: true` (prevents accidental `.only` commits)
- `reuseExistingServer: false` (starts fresh dev servers)
- Line reporter for clean CI logs
- Traces captured on first retry for debugging

### 8.4 Existing Tests Unaffected

Vitest unit tests continue to work unchanged:
- `pnpm test` runs Vitest (via Nx), not Playwright
- Playwright tests are in `e2e/` which is outside Vitest's `include` patterns
- No shared config between Vitest and Playwright

### 8.5 Lint Compatibility

The new TypeScript files follow the existing project conventions:
- Strict TypeScript (from `tsconfig.base.json`)
- Prettier formatting (from `.prettierrc`)
- No ESLint config changes needed — `e2e/` directory uses its own tsconfig

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Dev servers slow to start (4 concurrent servers) | `webServer.timeout: 120_000` (2 min); `reuseExistingServer` for local dev |
| Tests depend on dev DB state | Tests handle empty state gracefully; CRUD tests create their own data |
| No `data-testid` — locators may break on text changes | Use role-based locators where possible; text locators are still stable for headings/labels |
| Port conflicts in CI | Single `pnpm dev` starts all servers on fixed ports; CI runs with `workers: 1` |
| Graph/canvas elements hard to test | Graph view tests verify canvas renders (element exists) rather than pixel-level content |
| `react-big-calendar` third-party rendering | Use calendar's own class names and aria attributes for event interaction |
