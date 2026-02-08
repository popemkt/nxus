# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 97c5cf60-6a10-4626-adc6-6feaf02a1049 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 35deeeff-80df-4532-82f8-09829d367c97 -->

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
<!-- chat-id: 67a4c172-e9ed-48be-864c-96970436c489 -->

Verified all 67 issues against the actual codebase. Key findings during verification:
- `install.server.ts` is at `services/apps/` not `services/shell/` as stated in requirements
- `type Database = any` only exists in `query-subscription.service.ts`; the other two reactive services (`automation.service.ts`, `computed-field.service.ts`) already use `ReturnType<typeof getDatabase>`
- No existing Drizzle transaction patterns in the codebase; `better-sqlite3` synchronous transactions should be used directly
- 25 existing unit test files across libs must continue to pass
- All 4 root routes confirmed missing `errorComponent`

### [x] Step: Fix command injection vulnerabilities (A1, A2)
<!-- chat-id: a0e55779-9c69-44e2-b6a5-0c4aca799d2f -->

Fix shell command injection in git clone and platform commands.

**Files to modify:**
- `apps/nxus-core/src/services/apps/install.server.ts:54` — Replace `execAsync(\`git clone ${url} ${appDir}\`)` with `child_process.spawn('git', ['clone', url, appDir])` wrapped in a promise. Add URL protocol validation (allow only `https://` and `git://`).
- `apps/nxus-core/src/lib/platform-commands.ts:48-51,83-86,99-102` — Rewrite to use `child_process.spawn` with array args instead of string interpolation. For platform terminal launchers (Windows cmd, macOS osascript, Linux gnome-terminal), pass command components as separate arguments rather than building shell strings.

**Verification:** Run `pnpm test:libs` to ensure no regressions. Manually verify git clone still works.

### [ ] Step: Fix path traversal and gateway security (A3, A4, A5)

Fix path traversal in script resolver and proxy security issues in gateway.

**Files to modify:**
- `apps/nxus-core/src/services/shell/script-resolver.server.ts:72-75` — After `path.join(instancePath, scriptPath)`, validate that `path.resolve(result)` starts with `path.resolve(instancePath)`. Reject paths containing `..` segments.
- `apps/nxus-gateway/vite.config.ts:27-31` — Change route matching from `url.startsWith(prefix)` to `url === prefix || url.startsWith(prefix + '/')`.
- `apps/nxus-gateway/vite.config.ts:34-46` — Sanitize `url` by stripping `\r` and `\n` characters. Filter `req.headers` to a whitelist (accept, content-type, authorization, cookie, user-agent, etc.). Add `X-Forwarded-For`.
- `apps/nxus-gateway/vite.config.ts:66-72` — Sanitize header values in WebSocket upgrade: strip `\r\n` from header values before writing raw HTTP.
- `apps/nxus-gateway/vite.config.ts:48-51` — Return `res.writeHead(502); res.end('Bad Gateway')` instead of calling `next()`. Add 30s timeout with 504 response.
- `apps/nxus-gateway/vite.config.ts:16-20` — Read ports from `process.env.NXUS_CORE_PORT` etc. with current values as defaults.

**Verification:** Run existing E2E tests. Manually test gateway proxy routing.

### [ ] Step: Fix OAuth callback issues (A6, A7, C10)

Fix CSRF validation, "Try Again" behavior, and useEffect cleanup in OAuth callback.

**Files to modify:**
- `apps/nxus-calendar/src/routes/oauth-callback.tsx:22-26` — The `state` parameter is extracted but never validated. Since this is a local-first tool (no shared server sessions), the pragmatic fix is: validate `state` against a value stored in `localStorage` before the OAuth redirect. If state doesn't match, show an error.
- `apps/nxus-calendar/src/routes/oauth-callback.tsx:148-154` — Change "Try Again" button to navigate to the OAuth initiation URL (e.g., `/` or wherever the OAuth flow starts) instead of calling `window.location.reload()`.
- `apps/nxus-calendar/src/routes/oauth-callback.tsx:40-84` — Add cleanup function to `useEffect`: track `aborted` flag and `timeoutId`, return cleanup that sets `aborted = true` and calls `clearTimeout(timeoutId)`. Check `aborted` before `setState` calls.

**Verification:** Run calendar E2E tests.

### [ ] Step: Add database transactions for multi-step operations (B1, B3, B8)

Wrap multi-step database operations in transactions using `better-sqlite3` synchronous transaction support.

**Files to modify:**
- `libs/nxus-db/src/services/node.service.ts:933-992` — Wrap `setNodeSupertags` body in a transaction. The `db` parameter is a Drizzle instance backed by `better-sqlite3`. Use the underlying `better-sqlite3` `db.transaction()` method or Drizzle's transaction API. Steps inside: verify node exists → clear old supertags → add new ones → update timestamp. Event emission stays outside the transaction.
- `libs/nxus-db/src/services/node.service.ts:1287-1317` — Wrap `syncNodeSupertagsToItemTypes` delete-then-insert loop in a transaction.
- `libs/nxus-calendar/src/server/calendar.server.ts:343-423` — Wrap `completeTaskServerFn` handler's DB operations (status update + next instance creation + property sets) in a transaction.

**Note:** Since no Drizzle transaction pattern exists in the codebase yet, check how `getDatabase()` returns the db instance and use the appropriate transaction API. For Drizzle with `better-sqlite3`, use `db.transaction(tx => { ... })`.

**Verification:** Run `pnpm test:libs`. Unit tests for node.service.ts already exist.

### [ ] Step: Fix optimistic updates and soft-delete cleanup (B2, B7)

Add rollback logic for optimistic updates and handle orphaned properties from soft-deleted nodes.

**Files to modify:**
- `apps/nxus-core/src/stores/tag-data.store.ts:130-153` — In `updateTag`, capture previous state before optimistic update. In the catch block, restore the previous tag value in the store.
- `apps/nxus-core/src/stores/tag-data.store.ts:156-188` — In `deleteTag`, capture previous state (tag + children). In the catch block, restore all deleted/modified entries.
- `apps/nxus-core/src/stores/tag-data.store.ts:48-49` — Only set `isInitialized = true` after successful initialization. If init fails, leave it `false` so retry is possible.
- `libs/nxus-db/src/services/node.service.ts:543-561` — In `deleteNode`, also soft-delete (set `deletedAt`) on `nodeProperties` rows for the deleted node, OR filter out deleted-node properties in read queries. Prefer filtering in queries since it's less invasive.

**Verification:** Run `pnpm test:libs`.

### [ ] Step: Fix Google Calendar sync issues (B4, B5, G1, G2, G3)

Fix token refresh race condition, duplicate event creation, and date handling issues.

**Files to modify:**
- `libs/nxus-calendar/src/lib/google-calendar.ts:189-206` — Add a module-level `refreshPromise: Promise | null` variable. In `ensureValidTokens`, if `refreshPromise` is set, await it. Otherwise, set `refreshPromise = refreshTokens(tokens)`, await it, then clear. This ensures concurrent callers share one refresh.
- `libs/nxus-calendar/src/lib/google-calendar.ts:403-427` — On 404, log a warning instead of auto-creating. Only create if the local event was recently created (check `createdAt` timestamp). Add a comment explaining the rationale.
- `libs/nxus-calendar/src/lib/google-calendar.ts:273-288` — Add a comment documenting that internal model uses inclusive end dates and Google uses exclusive end dates. The +1 day adjustment is correct for this convention. Add a code comment to prevent future confusion.
- `libs/nxus-calendar/src/components/event-modal.tsx:110-118` — After `dateStr.split('-').map(Number)`, validate: month 1-12, day 1-31. Return `null` or throw if invalid.
- `libs/nxus-calendar/src/lib/date-utils.ts:137-150` — Add JSDoc comment documenting the UTC convention used throughout the codebase.

**Verification:** Run `pnpm test:libs` (calendar lib has 5 test files including `date-utils.test.ts`).

### [ ] Step: Add foreign key constraints and missing index (B6, E4)

Add FK constraints to junction tables and missing index on `deletedAt`.

**Files to modify:**
- `libs/nxus-db/src/schemas/item-schema.ts:58-68` — Add `.references()` to `itemTags.appId` → `items.id` (onDelete: cascade), `itemTags.tagId` → `tags.id` (onDelete: cascade). Same for `itemTagConfigs`. Add FK to `itemCommands.appId` → `items.id`.
- `libs/nxus-db/src/schemas/node-schema.ts:29` — Add `index('idx_nodes_deleted_at').on(t.deletedAt)` to the table's index list.
- `libs/nxus-db/src/client/master-client.ts` — Add `CREATE INDEX IF NOT EXISTS idx_nodes_deleted_at ON nodes(deleted_at)` to the initialization SQL. Note: SQLite cannot add FKs via ALTER TABLE, so the Drizzle schema FKs only apply to new databases. For existing databases, add `PRAGMA foreign_keys = ON` to enable enforcement going forward.

**Verification:** Run `pnpm test:libs`. Verify database initialization still works.

### [ ] Step: Add root error boundaries to all apps (C1)

Add `errorComponent` to all 4 root routes.

**Files to modify:**
- `apps/nxus-core/src/routes/__root.tsx` — Add `errorComponent` property to `createRootRoute()`. The error component should show a user-friendly error message with a "Reload" button that calls `window.location.reload()`. Use inline component (no separate file needed). Display error message in dev mode only.
- `apps/nxus-gateway/src/routes/__root.tsx` — Same pattern.
- `apps/nxus-workbench/src/routes/__root.tsx` — Same pattern.
- `apps/nxus-calendar/src/routes/__root.tsx` — Same pattern.

**Verification:** Run existing E2E tests.

### [ ] Step: Fix error handling gaps (C2, C3, C4, C5, C6, C8, C9)

Fix silent errors, empty catch blocks, and missing cleanup handlers.

**Files to modify:**
- `apps/nxus-gateway/vite.config.ts` — Already addressed in Step 2 (502 response, timeout). Skip here.
- `libs/nxus-db/src/client/master-client.ts:142-150` — In catch blocks around ALTER TABLE statements, check if error message contains "duplicate column" or "already exists". Re-throw all other errors.
- `libs/nxus-db/src/services/query-evaluator.service.ts:221-226,635-640,689-693` — Change `console.warn` to `console.error` for JSON parse failures. Include the node ID in the error message. These are already logging, just at wrong severity.
- `libs/nxus-db/src/reactive/automation.service.ts:291-297` — Add a `consecutiveFailures` counter. After 3 consecutive failures, emit an error event or log at error level with a prominent message. Reset counter on success.
- `apps/nxus-core/src/stores/tag-data.store.ts:48-49` — Already addressed in Step 5 (isInitialized fix). Skip here.
- `apps/nxus-core/src/services/shell/pty-session-manager.server.ts` — Add `process.on('SIGTERM', cleanup)` and `process.on('exit', cleanup)` handlers that iterate all active sessions and call `kill()` on each PTY process.

**Verification:** Run `pnpm test:libs`.

### [ ] Step: Add QueryClient defaults and calendar sync feedback (C7, C11)

Configure QueryClient retry/gcTime and surface calendar sync errors.

**Files to modify:**
- `apps/nxus-core/src/lib/query-client.ts` — Add `retry: 2` and `gcTime: 5 * 60 * 1000` to default query options.
- `apps/nxus-workbench/src/lib/query-client.ts` — Same defaults.
- `apps/nxus-calendar/src/lib/query-client.ts` — Same defaults.
- `apps/nxus-calendar/src/routes/index.tsx:22-24` — Surface sync errors via a state variable that renders an error banner/toast in the UI instead of only logging to console.

**Verification:** Run existing E2E tests.

### [ ] Step: Fix type safety issues (D1, D2, D3, D4, D5, D6)

Remove `any` types from core data paths and add proper validation.

**Files to modify:**
- `libs/nxus-db/src/types/node.ts:26-28` — Replace `value: any` with `value: string | number | boolean | null | Record<string, unknown>`. Export a `PropertyValueType` type alias.
- `libs/nxus-db/src/reactive/query-subscription.service.ts:45-46` — Replace `type Database = any` with `type Database = ReturnType<typeof getDatabase>` (matching the pattern already used in `automation.service.ts` and `computed-field.service.ts`).
- `libs/nxus-workbench/src/server/reactive.server.ts:36-40` — Replace `z.any()` with a proper filter schema. Examine what filter shapes are actually passed and define a Zod schema matching those shapes.
- `apps/nxus-core/src/routes/apps.$appId.tsx:690` — Replace `(app as any).checkCommand` with a proper type guard or discriminated union check.
- `apps/nxus-core/src/services/apps/apps.server.ts:90-92` — Remove `as any` casts. Fix the return type of `ensureArray` or use proper type assertion.
- `libs/nxus-db/src/reactive/automation.service.ts:716-728` — After `JSON.parse`, validate the result with a Zod schema (create `AutomationDefinitionSchema` if it doesn't exist, or import it). Reject invalid definitions with an error log.
- `libs/nxus-workbench/src/features/graph/renderers/graph-3d/Graph3D.tsx:104-106` — Replace `ForceGraph3D: any` with `ForceGraph3D: React.ComponentType<any>` or a more specific type if available. At minimum, use `@ts-expect-error` on specific usages with explanation.

**Verification:** Run `npx tsc --noEmit` (or equivalent Nx typecheck target) across affected projects. Run `pnpm test:libs`.

### [ ] Step: Fix architecture and configuration issues (E1, E2, E3, E5, E6, E7)

Fix hardcoded values, trailing slash inconsistencies, unbounded growth, and other config issues.

**Files to modify:**
- `apps/nxus-gateway/vite.config.ts:16-20` — Already addressed in Step 2 (env var ports). Skip here.
- `apps/nxus-gateway/vite.config.ts:27-31` — Already addressed in Step 2 (strict prefix matching). Skip here.
- `apps/nxus-workbench/src/router.tsx:29` + `apps/nxus-workbench/vite.config.ts:9` — Standardize: remove trailing slash from Vite `base` config (use `/workbench` not `/workbench/`), OR add trailing slash to router basepath. Pick one convention and apply consistently.
- `apps/nxus-calendar/src/router.tsx` + `apps/nxus-calendar/vite.config.ts` — Same trailing slash standardization as workbench.
- `apps/nxus-core/src/stores/terminal.store.ts:98-104` — In `addLog`, cap the logs array at 10,000 entries by slicing from the end: `logs: [...t.logs, log].slice(-10000)`.
- `libs/nxus-workbench/src/features/graph/store/graph.store.ts:63` — Add a `migrate` function to the Zustand `persist` config that handles version upgrades. For version 1→2 transition, return the state as-is (identity migration) as a template for future changes.
- `libs/nxus-ui/src/components/field.tsx:196` — Change `==` to `===`.

**Verification:** Run existing E2E tests. Verify workbench and calendar asset loading.

### [ ] Step: Fix reactive system reliability (F1, F2, F3, F4)

Fix subscription leak detection, stale DB references, and concurrency guards.

**Files to modify:**
- `libs/nxus-db/src/reactive/event-bus.ts:67-74` — Add a `MAX_SUBSCRIBERS` constant (default 50). In `subscribe()`, after adding the subscriber, check if subscriber count for that event type exceeds the threshold. If so, `console.warn` with the event type and count (similar to Node.js EventEmitter `maxListeners`).
- `libs/nxus-db/src/reactive/query-subscription.service.ts:444-454` — Change the `InternalSubscription` interface to store a `getDb: () => Database` getter function instead of a `db: Database` instance. Update `subscribe()` to accept a getter. Update all usages to call `subscription.getDb()` instead of `subscription.db`.
- `libs/nxus-db/src/reactive/query-subscription.service.ts:524-535` — Add a `cleared` boolean flag. Set it to `true` in `clear()`. Check it at the start of `processBatchedMutations` — if cleared, return immediately without processing.
- `libs/nxus-db/src/reactive/webhook-queue.ts:401-434` — Replace the `isCurrentlyProcessing` boolean with a `processingPromise: Promise<number> | null`. In `processQueue()`: if `processingPromise` is set, return it. Otherwise, set `processingPromise = doProcessQueue()`, await it, then clear. This ensures concurrent calls share the same processing run.

**Verification:** Run `pnpm test:libs` — the reactive system has 11 test files that must pass. Pay special attention to `event-bus.test.ts`, `query-subscription.test.ts`, and `webhook-queue.test.ts`.

### [ ] Step: Fix E2E test reliability (H1, H2, H3)

Make E2E tests independent and less flaky.

**Files to modify:**
- `e2e/fixtures/base.fixture.ts:12` — Replace `waitForLoadState('networkidle')` with waiting for a specific app-ready element or `waitForLoadState('domcontentloaded')`. Check what selector would indicate the app is ready (e.g., a root container with data-ready attribute).
- `e2e/calendar/event-crud.spec.ts` — Review serial test dependencies. Add `beforeEach` hooks for data setup so each test can run independently. Investigate why the "Try Again" retry workaround was needed (likely related to the OAuth callback issue fixed in Step 3) and remove it.

**Verification:** Run `pnpm e2e` and verify all tests pass. Run with `--repeat-each=3` to check for flakiness.

### [ ] Step: Final verification

Run the full test suite and type checker to verify no regressions.

- Run `pnpm test:libs` — all 25 unit test files pass
- Run `npx nx run-many --target=typecheck --all` or equivalent — no type errors
- Run `pnpm e2e` — all E2E tests pass
- Review git diff for unintended changes
- Record results in this plan
