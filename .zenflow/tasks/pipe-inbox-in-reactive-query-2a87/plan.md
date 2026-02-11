# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

Assessed difficulty as **hard** — multiple layers (data model, bootstrap, reactive services, server functions, UI components, routing).

Created spec at `.zenflow/tasks/pipe-inbox-in-reactive-query-2a87/spec.md` covering:
- Technical context and dependencies
- Implementation approach (reactive system piggybacking on existing inbox CRUD events)
- Source code structure changes (7 new files, 3 modified files)
- Data model changes (ARCHIVED_AT field, bootstrap additions for automation/computed field supertags and fields)
- API design (6 new server functions with template expansion)
- UI components (metrics bar, automations page, create modal)
- Verification approach (unit tests, manual integration, existing test suite)

---

### [ ] Step: Bootstrap & Data Model Updates

Add system fields and supertags required by the reactive services to the bootstrap and schema.

**Files to modify:**
- `libs/nxus-db/src/schemas/node-schema.ts` — Add `ARCHIVED_AT` to `SYSTEM_FIELDS` and `FIELD_NAMES`
- `libs/nxus-db/src/services/bootstrap.ts` — Add to `entitySupertags`: `#Automation`, `#ComputedField`; add to `commonFields`: `archivedAt`, `automationDefinition`, `automationState`, `automationLastFired`, `automationEnabled`, `computedFieldDefinition`, `computedFieldValue`, `computedFieldUpdatedAt`

**Verification:**
- `pnpm test:libs` — ensure reactive system tests still pass (they may create their own in-memory DBs, but confirm no regressions)
- Manually verify bootstrap adds the new nodes by inspecting DB or running bootstrap script

---

### [ ] Step: Inbox Reactive Server Functions

Create `apps/nxus-core/src/services/inbox/inbox-reactive.server.ts` with:

1. **Reactive initialization** — idempotent lazy init of `computedFieldService` and `automationService`, plus creating the 4 inbox computed fields (Total Items, Pending Count, Processing Count, Done Count) if they don't exist yet.
2. **`initInboxReactiveServerFn`** — Initialize and return computed field IDs + current values.
3. **`getInboxMetricsServerFn`** — Lightweight polling endpoint returning current metric values.
4. **`getInboxAutomationsServerFn`** — List inbox automations with definition/state.
5. **`createInboxAutomationServerFn`** — Create automation from template (`auto_archive`, `backlog_overflow`, `auto_tag`), expanding template into full `AutomationDefinition`.
6. **`toggleInboxAutomationServerFn`** — Enable/disable an automation.
7. **`deleteInboxAutomationServerFn`** — Delete an automation.
8. **`triggerInboxAutomationServerFn`** — Manual trigger for testing.

**Template expansion logic:**
- `auto_archive`: query_membership onEnter (inbox + status=done) → set_property ARCHIVED_AT { $now: true }
- `backlog_overflow`: threshold on pending count computed field > N → webhook POST
- `auto_tag`: query_membership onEnter (inbox + content contains keyword) → add_supertag

**Unit tests** in `apps/nxus-core/src/services/inbox/__tests__/inbox-reactive.test.ts`:
- Template expansion produces correct AutomationDefinition structure for each template
- Computed field definitions have correct queries
- Initialization is idempotent

**Verification:**
- `pnpm test:libs` — no regressions
- Unit tests pass

---

### [ ] Step: Inbox Metrics Bar UI

Create `apps/nxus-core/src/components/features/inbox/inbox-metrics-bar.tsx`:
- Displays 4 stat cards (Total, Pending, Processing, Done)
- Uses React Query to fetch metrics via `getInboxMetricsServerFn` with polling (staleTime: 10s, refetchInterval: 30s)
- Includes link to `/inbox/automations`
- Uses `Card`, `Badge`, `Button` from `@nxus/ui`

Modify `apps/nxus-core/src/routes/inbox.tsx`:
- Import and render `InboxMetricsBar` at top of page
- Initialize reactive system in the route loader (call `initInboxReactiveServerFn`)

**Verification:**
- App builds: `nx run @nxus/core-app:build`
- Manual: navigate to `/inbox`, metrics bar visible with correct counts

---

### [ ] Step: Automations Page & Management UI

Create the automations management experience:

1. **Zustand store** `apps/nxus-core/src/stores/inbox-automations.store.ts` — modal open/close, selected template state
2. **Create automation modal** `apps/nxus-core/src/components/features/inbox/create-automation-modal.tsx`:
   - Template selector (3 templates)
   - Dynamic config form per template (threshold/webhookUrl for backlog_overflow, keyword/supertagId for auto_tag, nothing for auto_archive)
   - Uses `AlertDialog` from `@nxus/ui`
3. **Automations page** `apps/nxus-core/src/components/features/inbox/inbox-automations-page.tsx`:
   - Metrics section at top
   - Automation list with toggle, name, last triggered, delete
   - "Add Automation" button opens modal
   - Uses React Query for data fetching and mutations
4. **Route** `apps/nxus-core/src/routes/inbox.automations.tsx`:
   - File-based route for `/inbox/automations`
   - Loader initializes reactive system and fetches automations + metrics
   - Back link to `/inbox`

**Verification:**
- App builds: `nx run @nxus/core-app:build`
- Route tree regenerates correctly (TanStack Router)
- Manual: navigate to `/inbox/automations`, create/toggle/delete automations
- `pnpm e2e` — no regressions on existing inbox E2E tests

---

### [ ] Step: Final Integration & Report

1. Run full test suite: `pnpm test:libs`, `pnpm e2e`
2. Run build: `nx run @nxus/core-app:build`
3. Manual end-to-end verification:
   - Add inbox item → metrics update
   - Mark item as done → auto-archive fires (archivedAt set)
   - Create backlog_overflow automation → add items until threshold → webhook fires
   - Create auto_tag automation → add item with keyword → supertag added
4. Write report to `.zenflow/tasks/pipe-inbox-in-reactive-query-2a87/report.md`
