# Requirements: Fix All Unsound Issues in Nxus

## Overview

A comprehensive audit of the Nxus monorepo has identified **67 distinct issues** across all applications and libraries. These range from critical security vulnerabilities to architectural concerns, data integrity bugs, and missing error handling. This document categorizes every issue found and defines the fix requirements.

---

## Scope

**In scope:**
- All 4 apps: `nxus-gateway`, `nxus-core`, `nxus-workbench`, `nxus-calendar`
- All 4 libs: `nxus-db`, `nxus-ui`, `nxus-workbench`, `nxus-calendar`
- Build/config/dependency issues
- E2E test reliability

**Out of scope:**
- New features
- Performance optimization beyond what's needed to fix bugs
- Documentation updates (unless directly related to a fix)

---

## Issue Categories

### Category A: Security Vulnerabilities (Priority: Critical)

These issues could allow attackers to execute arbitrary code, access unauthorized data, or compromise the system.

#### A1. Command Injection in `git clone`
- **File:** `apps/nxus-core/src/services/shell/install.server.ts:54`
- **Problem:** Direct string interpolation of `url` into shell command: `execAsync(\`git clone ${url} ${appDir}\`)`
- **Fix:** Use `spawn('git', ['clone', url, appDir])` with array arguments instead of string interpolation. Also whitelist allowed URL protocols (https://, git://) in the Zod schema — reject `file://`, `ssh://`, etc.

#### A2. Command Injection in Platform Commands
- **File:** `apps/nxus-core/src/lib/platform-commands.ts:48-51, 83-86, 99-102`
- **Problem:** User-provided commands are interpolated into shell strings with inadequate escaping. Only `"` and `'` are escaped; shell metacharacters (`;`, `|`, `&`, `$()`, `` ` ``) are not.
- **Fix:** Use `child_process.spawn` with array arguments. Avoid constructing shell command strings from user input entirely.

#### A3. Path Traversal in Script Resolver
- **File:** `apps/nxus-core/src/services/shell/script-resolver.server.ts:63-75`
- **Problem:** `scriptPath` is user-controlled and used in `path.join()` without validation. `../../../etc/passwd` would traverse out.
- **Fix:** Validate that resolved path stays within the expected base directory. Reject paths containing `..` or starting with `/`.

#### A4. Gateway Proxy — Request Smuggling / Header Injection
- **File:** `apps/nxus-gateway/vite.config.ts:34-46`
- **Problem:** Incoming `req.url` is forwarded to upstream without sanitization. All headers are blindly forwarded. CRLF injection possible.
- **Fix:** Sanitize URL (strip CRLF characters, normalize path). Filter forwarded headers to a whitelist. Add `X-Forwarded-For` properly.

#### A5. Gateway WebSocket — Header Injection
- **File:** `apps/nxus-gateway/vite.config.ts:66-72`
- **Problem:** Raw HTTP headers are manually constructed by string concatenation from `req.headers`. Header values could contain `\r\n`.
- **Fix:** Sanitize header values (strip CR/LF). Use a proper HTTP library for WebSocket upgrade forwarding.

#### A6. OAuth Callback — Missing CSRF Validation
- **File:** `apps/nxus-calendar/src/routes/oauth-callback.tsx:22-26`
- **Problem:** The `state` parameter is extracted from URL but never validated against a server-side stored value.
- **Fix:** Generate and store a random `state` token before redirecting to Google. Validate it matches in the callback.

#### A7. OAuth Callback — "Try Again" Reloads with Spent Code
- **File:** `apps/nxus-calendar/src/routes/oauth-callback.tsx:148-154`
- **Problem:** "Try Again" calls `window.location.reload()`, which replays the same (now invalid) OAuth code.
- **Fix:** Navigate to the OAuth initiation URL instead of reloading.

---

### Category B: Data Integrity & Race Conditions (Priority: High)

#### B1. Missing Transaction in `setNodeSupertags`
- **File:** `libs/nxus-db/src/services/node.service.ts:933-992`
- **Problem:** Multi-step operation (clear old supertags → add new ones → update timestamp → emit events) runs without a transaction. A crash between steps leaves the node with no supertags.
- **Fix:** Wrap in a Drizzle transaction.

#### B2. Optimistic Updates Without Rollback (Tag Store)
- **File:** `apps/nxus-core/src/stores/tag-data.store.ts:130-153, 156-188`
- **Problem:** `updateTag` and `deleteTag` update local state first, then sync to server. If server sync fails, local state is out of sync with the database — no rollback.
- **Fix:** Either: (a) pessimistic update (apply locally only after server confirms), or (b) add rollback logic in the catch block that restores previous state.

#### B3. Missing Transaction in `completeTask`
- **File:** `libs/nxus-calendar/src/server/calendar.server.ts:343-423`
- **Problem:** `completeTaskServerFn` marks a recurring task complete and creates the next instance as separate operations. If instance creation fails, the task is lost.
- **Fix:** Wrap both operations in a transaction.

#### B4. Google Calendar — Duplicate Event Creation on 404
- **File:** `libs/nxus-calendar/src/lib/google-calendar.ts:411-417`
- **Problem:** When `updateGoogleEvent` gets a 404, it creates a new event. If the event was intentionally deleted in Google Calendar, this creates an unwanted duplicate.
- **Fix:** Check local metadata for explicit deletion before creating. Log a warning instead of auto-creating.

#### B5. Token Refresh Race Condition
- **File:** `libs/nxus-calendar/src/lib/google-calendar.ts:189-206`
- **Problem:** Multiple concurrent API calls can all trigger token refresh simultaneously, causing rate limit issues.
- **Fix:** Implement a token refresh mutex/promise cache — if a refresh is in progress, subsequent calls should await the same promise.

#### B6. Missing Foreign Key Constraints
- **File:** `libs/nxus-db/src/client/master-client.ts:86-170`, `libs/nxus-db/src/schemas/item-schema.ts:58-68`
- **Problem:** Junction tables (`item_tags`, `item_commands`, `item_tag_configs`, `item_types`, `nodeProperties`) lack foreign key constraints. Orphaned records can accumulate.
- **Fix:** Add foreign key constraints with appropriate CASCADE rules in schema definitions. Create a migration to add them.

#### B7. Soft-Deleted Nodes Leave Orphaned Properties
- **File:** `libs/nxus-db/src/services/node.service.ts:543-561`
- **Problem:** `deleteNode` sets `deletedAt` but doesn't clean up `nodeProperties` for the deleted node.
- **Fix:** Either soft-delete properties too, or add a periodic cleanup job. At minimum, filter out properties of deleted nodes in queries.

#### B8. `syncNodeSupertagsToItemTypes` — No Locking
- **File:** `libs/nxus-db/src/services/node.service.ts:1287-1317`
- **Problem:** Concurrent sync operations for the same item can produce non-deterministic results (delete-all then insert race).
- **Fix:** Wrap in a transaction; consider using INSERT OR REPLACE instead of delete-then-insert.

---

### Category C: Missing Error Handling (Priority: High)

#### C1. No Root Error Boundary (All Apps)
- **Files:** `apps/nxus-gateway/src/routes/__root.tsx`, `apps/nxus-core/src/routes/__root.tsx`, `apps/nxus-workbench/src/routes/__root.tsx`, `apps/nxus-calendar/src/routes/__root.tsx`
- **Problem:** None of the four apps define an `errorComponent` on their root route. Any unhandled error crashes the entire app to a white screen.
- **Fix:** Add `errorComponent` to each root route that shows a user-friendly error page with a "Reload" button.

#### C2. Gateway Proxy — Silent Fallthrough on Upstream Error
- **File:** `apps/nxus-gateway/vite.config.ts:48-51`
- **Problem:** When a proxied app is down, `proxyReq.on('error', () => next())` silently falls through. Users see the gateway landing page instead of an error.
- **Fix:** Return a 502 Bad Gateway response with a message indicating the service is unavailable.

#### C3. Gateway Proxy — No Timeout
- **File:** `apps/nxus-gateway/vite.config.ts:34-46`
- **Problem:** No timeout on proxy requests. A hung upstream holds connections indefinitely.
- **Fix:** Add a timeout (e.g., 30s) to the proxy request. Return 504 Gateway Timeout on expiry.

#### C4. Schema Migration — Empty Catch Blocks
- **File:** `libs/nxus-db/src/client/master-client.ts:142-150`
- **Problem:** `ALTER TABLE` statements are wrapped in empty catch blocks that swallow all errors, not just "column already exists."
- **Fix:** Check the error message/code for "duplicate column" specifically; re-throw all other errors.

#### C5. JSON Parsing Errors Silently Swallowed in Query Evaluator
- **File:** `libs/nxus-db/src/services/query-evaluator.service.ts:221-226, 635-640, 689-693`
- **Problem:** Malformed JSON in property values is caught and logged as a warning. Queries return incomplete results without the caller knowing.
- **Fix:** Track parse failures and include them in query results metadata, or at minimum log at error level with the affected node ID.

#### C6. Webhook Queue — Fire-and-Forget Errors
- **File:** `libs/nxus-db/src/reactive/automation.service.ts:291-297`
- **Problem:** Webhook processing errors are logged but not propagated. Repeated failures go unnoticed.
- **Fix:** Implement a failure counter. After N consecutive failures, emit an error event or mark the automation as unhealthy.

#### C7. Calendar Sync Errors — No User Feedback
- **File:** `apps/nxus-calendar/src/routes/index.tsx:22-24`
- **Problem:** Sync failure is logged to console only. Users have no idea sync failed.
- **Fix:** Surface sync errors in the UI (toast notification or status indicator).

#### C8. Tag Store — Failed Initialization Blocks Forever
- **File:** `apps/nxus-core/src/stores/tag-data.store.ts:48-49`
- **Problem:** `if (get().isInitialized) return` prevents re-initialization even after failure. Once init fails, the store is permanently broken.
- **Fix:** Only set `isInitialized = true` on success. Reset on error to allow retry.

#### C9. Missing PTY Cleanup on Server Shutdown
- **File:** `apps/nxus-core/src/services/shell/pty-session-manager.server.ts`
- **Problem:** No `process.on('exit')` / `SIGTERM` handler to kill active PTY sessions. Server shutdown orphans shell processes.
- **Fix:** Register a shutdown handler that iterates all sessions and kills their PTY processes.

#### C10. OAuth Callback — Missing useEffect Cleanup
- **File:** `apps/nxus-calendar/src/routes/oauth-callback.tsx:40-84`
- **Problem:** `useEffect` doesn't return a cleanup function. If component unmounts during `completeAuth()`, state updates fire on unmounted component.
- **Fix:** Add an `aborted` flag in the cleanup function; check before setting state.

#### C11. QueryClient — No Error/Retry Configuration
- **Files:** `apps/nxus-gateway/src/lib/query-client.ts`, `apps/nxus-workbench/src/lib/query-client.ts`, `apps/nxus-calendar/src/lib/query-client.ts`
- **Problem:** QueryClient only sets `staleTime`. Missing retry, gcTime, and error handler configuration.
- **Fix:** Add `retry: 2`, `gcTime`, and consider a global `onError` handler or mutation error defaults.

---

### Category D: Type Safety (Priority: Medium)

#### D1. `PropertyValue.value` is `any`
- **File:** `libs/nxus-db/src/types/node.ts:26-28`
- **Problem:** Core data type uses `any`, defeating TypeScript's purpose.
- **Fix:** Define a union type: `string | number | boolean | null | Record<string, unknown>`.

#### D2. Database Type Aliased to `any`
- **Files:** `libs/nxus-db/src/reactive/query-subscription.service.ts:45-46`, `automation.service.ts:108`, `computed-field.service.ts:64`
- **Problem:** `type Database = any` used in multiple reactive services.
- **Fix:** Import and use the proper Drizzle database type.

#### D3. `z.any()` in Reactive Server Validation
- **File:** `libs/nxus-workbench/src/server/reactive.server.ts:36-40`
- **Problem:** Query filters bypass Zod validation with `z.any()`.
- **Fix:** Define proper Zod schema for filter objects.

#### D4. Unsafe `as any` Casts in Core App
- **Files:** `apps/nxus-core/src/routes/apps.$appId.tsx:690`, `apps/nxus-core/src/services/apps/apps.server.ts:90`
- **Problem:** `as any` casts bypass type checking.
- **Fix:** Use discriminated unions or proper type guards.

#### D5. Missing Automation Definition Validation
- **File:** `libs/nxus-db/src/reactive/automation.service.ts:716-728`
- **Problem:** Automation definitions parsed from JSON are used without Zod validation against `AutomationDefinitionSchema`.
- **Fix:** Validate with the existing schema after parsing.

#### D6. ForceGraph3D typed as `any`
- **File:** `libs/nxus-workbench/src/features/graph/renderers/graph-3d/Graph3D.tsx:104-106`
- **Problem:** `ForceGraph3D: any` bypasses all type checking for 3D graph rendering.
- **Fix:** Create proper type declarations or use `@ts-expect-error` on specific lines with explanation.

---

### Category E: Architectural / Configuration Issues (Priority: Medium)

#### E1. Hardcoded Ports in Gateway Proxy
- **File:** `apps/nxus-gateway/vite.config.ts:16-20`
- **Problem:** Ports 3000, 3002, 3003 are hardcoded in the proxy plugin.
- **Fix:** Read from environment variables with sensible defaults.

#### E2. Route Prefix Matching Too Loose
- **File:** `apps/nxus-gateway/vite.config.ts:27-31`
- **Problem:** `url.startsWith(prefix)` matches `/core-admin` for `/core`.
- **Fix:** Match `prefix + '/'` or exact `prefix`. Ensure routes use trailing-slash convention.

#### E3. Router basepath vs Vite base Trailing Slash Inconsistency
- **Files:** `apps/nxus-workbench/src/router.tsx:29` vs `apps/nxus-workbench/vite.config.ts:9`, same pattern in `nxus-calendar`
- **Problem:** Router uses `/workbench` (no trailing slash), Vite uses `/workbench/` (with trailing slash). Can cause asset loading failures.
- **Fix:** Standardize — either both use trailing slash or neither.

#### E4. Missing Index on `nodes.deletedAt`
- **File:** `libs/nxus-db/src/schemas/node-schema.ts:29`
- **Problem:** Every query filters on `deletedAt` (soft delete), but no index exists. This causes full table scans.
- **Fix:** Add an index on `deletedAt` in the schema.

#### E5. Unbounded Terminal Log Growth
- **File:** `apps/nxus-core/src/stores/terminal.store.ts:98-104`
- **Problem:** Terminal tab logs array grows without limit. Long-running commands cause memory bloat.
- **Fix:** Implement a max log size (e.g., 10,000 entries) with ring buffer or truncation.

#### E6. Graph Store — No State Migration
- **File:** `libs/nxus-workbench/src/features/graph/store/graph.store.ts:63`
- **Problem:** Zustand persist version=1 with no migration logic. Store shape changes will break saved preferences.
- **Fix:** Add a `migrate` function to the persist configuration.

#### E7. Loose Equality in Field Component
- **File:** `libs/nxus-ui/src/components/field.tsx:196`
- **Problem:** `uniqueErrors?.length == 1` uses loose equality.
- **Fix:** Change to `===`.

---

### Category F: Reactive System Reliability (Priority: Medium)

#### F1. Event Bus — No Subscription Leak Detection
- **File:** `libs/nxus-db/src/reactive/event-bus.ts:67-74`
- **Problem:** No mechanism to detect or warn about leaked subscriptions. Forgotten unsubscribe calls cause memory leaks and phantom listeners.
- **Fix:** Add a max subscriber warning (similar to Node.js EventEmitter). Log when subscriber count exceeds a threshold.

#### F2. Query Subscription Holds Stale DB Reference
- **File:** `libs/nxus-db/src/reactive/query-subscription.service.ts:444-454`
- **Problem:** Subscription captures DB instance at subscribe time. If DB is re-opened, subscription uses stale reference.
- **Fix:** Use a getter function for the DB reference instead of capturing the instance directly.

#### F3. Webhook Queue — Concurrent Processing Guard Not Atomic
- **File:** `libs/nxus-db/src/reactive/webhook-queue.ts:401-434`
- **Problem:** `isCurrentlyProcessing` flag check-and-set is not atomic. Two concurrent calls could both pass the check.
- **Fix:** Use a promise-based lock or queue mechanism instead of a boolean flag.

#### F4. Debounce Timer Cleanup Race
- **File:** `libs/nxus-db/src/reactive/query-subscription.service.ts:524-535`
- **Problem:** `clear()` cancels the timer, but if `processBatchedMutations` is already queued in the microtask queue, it still fires.
- **Fix:** Add a `cleared` flag that `processBatchedMutations` checks before executing.

---

### Category G: Date/Calendar Specific (Priority: Medium)

#### G1. All-Day Event End Date — Potential Double-Increment
- **File:** `libs/nxus-calendar/src/lib/google-calendar.ts:281-288`
- **Problem:** End date is incremented by 1 day for Google Calendar's exclusive end format. If the internal model already uses exclusive end dates, events are 1 day too long.
- **Fix:** Document whether the internal model uses inclusive or exclusive end dates. Add a comment and test to prevent regression.

#### G2. Date Parsing Without Validation
- **File:** `libs/nxus-calendar/src/components/event-modal.tsx:110-118`
- **Problem:** `dateStr.split('-').map(Number)` accepts invalid dates like "2026-13-45". JavaScript's Date constructor silently overflows.
- **Fix:** Validate month (1-12) and day (1-31) ranges after parsing.

#### G3. No Timezone Normalization
- **File:** `libs/nxus-calendar/src/lib/date-utils.ts:137-150`
- **Problem:** `toUTC` and `fromUTC` use `formatISO`/`parseISO` which preserve local timezone in ISO strings. Multi-timezone use would be inconsistent.
- **Fix:** Ensure all stored dates use consistent UTC representation. Document the convention.

---

### Category H: Testing Gaps (Priority: Low)

#### H1. E2E Tests — Serial Dependencies
- **File:** `e2e/calendar/event-crud.spec.ts` and others
- **Problem:** Tests use `test.describe.serial()` with later tests depending on state from earlier tests. If test N fails, tests N+1 through end all fail.
- **Fix:** Each test should set up its own preconditions. Use beforeEach hooks for data setup.

#### H2. `networkidle` Wait Strategy
- **File:** `e2e/fixtures/base.fixture.ts:12`
- **Problem:** `waitForLoadState('networkidle')` is flaky with HMR/polling in development.
- **Fix:** Wait for specific UI elements or app-ready signals instead.

#### H3. Calendar Test — Retry Masks Root Cause
- **File:** `e2e/calendar/event-crud.spec.ts:18-22`
- **Problem:** Tests click "Try Again" to handle error states instead of preventing them.
- **Fix:** Investigate and fix the root cause of loading failures. Remove the retry workaround.

---

## Assumptions

1. **This is a local-first development tool** — security fixes prioritize defense-in-depth rather than production hardening. The gateway proxy, for example, is a dev server proxy, so some security issues are lower risk than they'd be in production.
2. **SQLite is single-writer** — race conditions are mitigated by SQLite's write serialization, but we still need transactions for multi-step atomicity.
3. **The reactive system is server-side only** — subscriptions run in Node.js, so JavaScript's single-threaded event loop prevents true concurrent execution. However, async operations can still interleave.
4. **Existing tests should continue to pass** — fixes should not break existing behavior.
5. **Zod 4.x is correct** — the project uses `zod@^4.2.1` which is the latest major version (Zod Mini). This is not a bug.

## Success Criteria

- All identified security vulnerabilities (Category A) are fixed
- All data integrity issues (Category B) are fixed with transactions or proper guards
- All apps have root-level error boundaries (Category C)
- Critical error handling gaps are addressed
- Type safety improved for core data types
- All existing tests continue to pass
- No new regressions introduced
