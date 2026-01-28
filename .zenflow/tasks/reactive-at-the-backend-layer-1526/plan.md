# Reactive Query System - Implementation Plan

## Configuration
- **Artifacts Path**: `.zenflow/tasks/reactive-at-the-backend-layer-1526`
- **Spec Document**: `spec.md`
- **Requirements Document**: `requirements.md`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: d3f98879-24aa-4953-864a-5dd7acc1cc50 -->

Create a Product Requirements Document (PRD) based on the feature description.

### [x] Step: Technical Specification
<!-- chat-id: 91ef1db7-43db-479e-bd46-e635cb4f42ef -->

Create a technical specification based on the PRD in `requirements.md`.

### [x] Step: Planning
<!-- chat-id: 77975236-8943-4e66-8b65-932d08909b34 -->

Created a detailed implementation plan with 4 phases and 22 concrete steps.

---

# Phase 1: Event Bus + Reactive Core (Foundation)

### [x] Step: Create reactive module types and event bus
<!-- chat-id: 21bb4e6e-c6cc-40a1-b3c0-668d7f22760d -->

Create the foundation for the reactive system with type definitions and the mutation event bus.

**Files created:**
- `packages/nxus-db/src/reactive/types.ts` - All reactive system types (MutationEvent, EventFilter, QuerySubscription, etc.)
- `packages/nxus-db/src/reactive/event-bus.ts` - In-memory pub/sub event bus singleton
- `packages/nxus-db/src/reactive/index.ts` - Public exports

**Implementation:**
- [x] Define `MutationType` enum: `node:created`, `node:updated`, `node:deleted`, `property:set`, `property:added`, `property:removed`, `supertag:added`, `supertag:removed`
- [x] Define `MutationEvent` interface with `type`, `timestamp`, `nodeId`, `systemId`, `fieldSystemId`, `beforeValue`, `afterValue`, `supertagSystemId`
- [x] Define `MutationListener` type and `EventFilter` interface
- [x] Implement `createEventBus()` factory with `subscribe(listener, filter?)`, `emit(event)`, `listenerCount()`, `clear()`
- [x] Export singleton `eventBus` instance

**Verification:**
- [x] Run `pnpm --filter @nxus/db test` - all 54 tests pass (no regressions)
- [x] TypeScript type check - no errors in reactive module (pre-existing errors in node.service.ts unrelated)

### [x] Step: Write event bus unit tests
<!-- chat-id: 8baf2f10-9f13-43dc-85e2-3d47e6bb2065 -->

Create comprehensive tests for the event bus before integrating with mutation functions.

**Files created:**
- `packages/nxus-db/src/reactive/__tests__/event-bus.test.ts`

**Test cases:**
- [x] `emit()` delivers events to all subscribed listeners
- [x] `subscribe()` returns working unsubscribe function
- [x] Filter by event types works correctly
- [x] Filter by fieldSystemIds works correctly
- [x] Filter by nodeIds works correctly
- [x] Multiple filters combine with AND logic
- [x] `clear()` removes all listeners
- [x] Async listeners are handled correctly
- [x] Errors in one listener don't affect others

**Additional tests implemented:**
- [x] Filter by supertagSystemIds works correctly
- [x] Edge cases (self-unsubscribing listeners, empty filters, etc.)
- [x] Listener count tracking
- [x] Multiple subscriptions of same listener

**Verification:**
- [x] Run `pnpm --filter @nxus/db test src/reactive/__tests__/event-bus.test.ts` - 35 tests pass
- [x] Run `pnpm --filter @nxus/db test` - all 89 tests pass (no regressions)

### [x] Step: Wrap mutation functions with event emission
<!-- chat-id: af39987f-80f3-4564-b369-dfe0fe5928b4 -->

Modify `node.service.ts` to emit events through the event bus for all mutations.

**Files modified:**
- `packages/nxus-db/src/services/node.service.ts`

**Functions wrapped (9 total):**
- [x] `createNode()` → emit `node:created` with afterValue containing node data
- [x] `updateNodeContent()` → emit `node:updated` with beforeValue/afterValue for content
- [x] `deleteNode()` → emit `node:deleted`
- [x] `setProperty()` → emit `property:set` with fieldSystemId, beforeValue, afterValue
- [x] `addPropertyValue()` → emit `property:added` with fieldSystemId, afterValue
- [x] `clearProperty()` → emit `property:removed` with fieldSystemId, beforeValue
- [x] `setNodeSupertags()` → emit `supertag:added` and `supertag:removed` for changes
- [x] `addNodeSupertag()` → emit `supertag:added` with supertagSystemId
- [x] `removeNodeSupertag()` → emit `supertag:removed` with supertagSystemId

**Pattern:**
```typescript
export function setProperty(db, nodeId, fieldSystemId, value, order = 0) {
  const beforeValue = getPropertyValue(db, nodeId, fieldSystemId)
  // ... existing DB operations ...
  eventBus.emit({
    type: 'property:set',
    timestamp: new Date(),
    nodeId,
    fieldSystemId,
    beforeValue,
    afterValue: value,
  })
}
```

**Verification:**
- [x] Run `pnpm --filter @nxus/db test` - all 89 tests pass (no regressions)
- [x] Event emission does not affect function behavior or return values

### [x] Step: Create query subscription service
<!-- chat-id: 4b0cd83f-a911-4bb5-88ab-807d9ee2b309 -->

Implement the service that manages live query subscriptions and computes result diffs.

**Files created:**
- `packages/nxus-db/src/reactive/query-subscription.service.ts`

**Implementation:**
- [x] Define `QuerySubscriptionService` interface
- [x] Implement `createQuerySubscriptionService()` factory
- [x] `subscribe(db, definition, onResultChange)` - register subscription, evaluate initial results, return subscription object
- [x] `unsubscribe(subscriptionId)` - remove subscription
- [x] `getActiveSubscriptions()` - list all active subscriptions (debugging)
- [x] `refreshAll(db)` - force re-evaluate all subscriptions
- [x] Internal: On mutation event, re-evaluate all subscriptions (brute force Phase 1)
- [x] Internal: Compute diff (added/removed/changed) using Set comparison
- [x] Internal: Track `lastResults` as `Set<string>` of node IDs per subscription
- [x] Internal: Track `lastNodeStates` as `Map<string, AssembledNode>` for change detection

**Additional features implemented:**
- [x] `subscriptionCount()` - get number of active subscriptions
- [x] `clear()` - clear all subscriptions (for testing)
- [x] `SubscriptionHandle` with `getLastResults()` for synchronous access to current results
- [x] Smart event bus subscription management (subscribes only when needed, unsubscribes when empty)
- [x] Node change detection via content/properties/supertags signature comparison

**Key Design:**
- Service auto-subscribes to eventBus when first subscription added
- Re-evaluation is synchronous for Phase 1
- Debouncing deferred to Phase 3
- Singleton `querySubscriptionService` exported for direct use

**Verification:**
- [x] Run `pnpm --filter @nxus/db test` - all 89 tests pass (no regressions)
- [x] TypeScript compilation passes (no new errors in reactive module)

### [x] Step: Write query subscription service tests
<!-- chat-id: 23a60b51-0835-4965-bc2f-ba560db60035 -->

Create comprehensive tests for the query subscription service.

**Files created:**
- `packages/nxus-db/src/reactive/__tests__/query-subscription.test.ts`

**Test cases implemented (39 total tests):**
- [x] Subscribe to query, receive initial results
- [x] Detect node added to query results (node created matching filter)
- [x] Detect node added when supertag added makes node match filter
- [x] Detect node added when property change makes node match filter
- [x] Detect node removed from results (node deleted)
- [x] Detect node removed when supertag removed makes node not match
- [x] Detect node removed when property change makes node not match
- [x] Detect node changed (still matches but content/properties changed)
- [x] Multiple subscriptions to same query receive same events
- [x] Handle different queries independently
- [x] Unsubscribe stops receiving events (via handle and service)
- [x] Rapid mutations trigger multiple callbacks (no batching in Phase 1)
- [x] Query with supertag filter works correctly (including inheritance)
- [x] Query with property filter works correctly (eq, gt operators)
- [x] Query with logical AND/OR filters works correctly
- [x] refreshAll() force re-evaluates all subscriptions
- [x] clear() removes all subscriptions
- [x] Error handling - callback errors don't affect other subscriptions
- [x] Event bus subscription management (subscribes when needed, unsubscribes when empty)
- [x] totalCount included in change events

**Verification:**
- [x] Run `pnpm --filter @nxus/db test src/reactive/__tests__/query-subscription.test.ts` - 39 tests pass
- [x] Run `pnpm --filter @nxus/db test` - all 128 tests pass (no regressions)

### [ ] Step: Create basic automation service (internal actions only)

Implement automation rules for query membership triggers with internal actions.

**Files to create:**
- `packages/nxus-db/src/reactive/automation.service.ts`

**Implementation:**
- [ ] Define `AutomationService` interface
- [ ] Implement `createAutomationService(querySubscriptionService)` factory
- [ ] `create(db, definition)` - create automation node with `supertag:automation`
- [ ] `setEnabled(db, automationId, enabled)` - enable/disable automation
- [ ] `getAll(db)` - list all automations with their state
- [ ] `delete(db, automationId)` - remove automation
- [ ] `trigger(db, automationId, context)` - manual trigger for testing
- [ ] Internal: Register query subscription for each enabled automation
- [ ] Internal: Execute actions on query membership events (onEnter/onExit/onChange)
- [ ] Internal: Implement cycle detection with execution depth counter (max 10)

**Supported actions (Phase 1):**
- [ ] `set_property` - set a property value on the triggering node
- [ ] `add_supertag` - add a supertag to the triggering node
- [ ] `remove_supertag` - remove a supertag from the triggering node

**Verification:**
- Unit tests cover automation lifecycle and execution

### [ ] Step: Add schema changes for automation nodes

Extend the schema to support automation nodes with their definitions and state.

**Files to modify:**
- `packages/nxus-db/src/schemas/node-schema.ts`

**Add to SYSTEM_FIELDS:**
- [ ] `AUTOMATION_DEFINITION: 'field:automation_definition'` - JSON automation config
- [ ] `AUTOMATION_STATE: 'field:automation_state'` - JSON state tracking
- [ ] `AUTOMATION_LAST_FIRED: 'field:automation_last_fired'` - Timestamp
- [ ] `AUTOMATION_ENABLED: 'field:automation_enabled'` - Boolean

**Add to SYSTEM_SUPERTAGS:**
- [ ] `AUTOMATION: 'supertag:automation'` - Automation rule nodes

**Verification:**
- Run `pnpm --filter @nxus/db test` - existing tests still pass
- Bootstrap creates new system nodes correctly

### [ ] Step: Write automation service tests

Create comprehensive tests for the automation service.

**Files to create:**
- `packages/nxus-db/src/reactive/__tests__/automation.test.ts`

**Test cases:**
- [ ] Create automation, verify node created with correct supertag and properties
- [ ] `onEnter` fires when node newly matches query
- [ ] `onExit` fires when node stops matching query
- [ ] `onChange` fires when matching node's properties change
- [ ] `set_property` action sets correct property value
- [ ] `add_supertag` action adds supertag to triggering node
- [ ] `remove_supertag` action removes supertag from triggering node
- [ ] Disabled automation doesn't fire
- [ ] Cycle detection prevents infinite loops (automation triggers itself)
- [ ] Multiple automations can fire on same event
- [ ] Automation state persists across re-evaluation

**Verification:**
- Run `pnpm --filter @nxus/db test src/reactive/__tests__/automation.test.ts`

### [ ] Step: Integration test for Phase 1

Create an integration test that validates the complete Phase 1 reactive system.

**Files to create:**
- `packages/nxus-db/src/reactive/__tests__/integration.test.ts`

**Integration scenario:**
- [ ] Test: Auto-complete timestamp automation
  1. Create automation: when task status → 'done', set completedAt to now
  2. Create task node with status 'pending'
  3. Change status to 'done'
  4. Verify completedAt was set automatically
  5. Change status back to 'pending'
  6. Verify completedAt is cleared (or remains - depending on design)

- [ ] Test: Multi-automation chain (within cycle limit)
  1. Automation A: when priority → 'high', add supertag 'urgent'
  2. Automation B: when has supertag 'urgent', set notified = true
  3. Create node, set priority to 'high'
  4. Verify both supertag and notified property are set

**Verification:**
- Run `pnpm --filter @nxus/db test src/reactive/__tests__/integration.test.ts`

### [ ] Step: Export reactive module from package

Wire up the reactive module for public consumption.

**Files to modify:**
- `packages/nxus-db/src/reactive/index.ts` - export all public APIs
- `packages/nxus-db/src/services/index.ts` - re-export reactive module
- `packages/nxus-db/src/index.ts` - include reactive in main exports
- `packages/nxus-db/src/server.ts` - include reactive in server exports

**Exports:**
- [ ] Types: `MutationEvent`, `MutationListener`, `EventFilter`, `QuerySubscription`, `QueryResultChangeEvent`, `AutomationDefinition`, `AutomationAction`, etc.
- [ ] Factories: `createQuerySubscriptionService`, `createAutomationService`
- [ ] Singleton: `eventBus`

**Verification:**
- Can import from `@nxus/db` and `@nxus/db/server`
- TypeScript compilation succeeds

---

# Phase 2: Computed Fields + Threshold Automations

### [ ] Step: Add schema changes for computed field nodes

Extend the schema to support computed field nodes.

**Files to modify:**
- `packages/nxus-db/src/schemas/node-schema.ts`

**Add to SYSTEM_FIELDS:**
- [ ] `COMPUTED_FIELD_DEFINITION: 'field:computed_field_definition'` - JSON aggregation config
- [ ] `COMPUTED_FIELD_VALUE: 'field:computed_field_value'` - Current computed value
- [ ] `COMPUTED_FIELD_UPDATED_AT: 'field:computed_field_updated_at'` - Last update timestamp

**Add to SYSTEM_SUPERTAGS:**
- [ ] `COMPUTED_FIELD: 'supertag:computed_field'` - Computed field definition nodes

**Verification:**
- Run `pnpm --filter @nxus/db test` - existing tests still pass

### [ ] Step: Create computed field service

Implement the service that manages computed field definitions and values.

**Files to create:**
- `packages/nxus-db/src/reactive/computed-field.service.ts`

**Implementation:**
- [ ] Define `ComputedFieldService` interface
- [ ] Implement `createComputedFieldService(querySubscriptionService)` factory
- [ ] `create(db, { name, definition, ownerId? })` - create computed field node
- [ ] `getValue(db, computedFieldId)` - get current value
- [ ] `recompute(db, computedFieldId)` - force recompute
- [ ] `getAll(db)` - list all computed fields with values
- [ ] `delete(db, computedFieldId)` - remove computed field

**Aggregation implementation:**
- [ ] `COUNT` - count matching nodes
- [ ] `SUM` - sum numeric field values across matching nodes
- [ ] `AVG` - average of numeric field values
- [ ] `MIN` - minimum value
- [ ] `MAX` - maximum value

**Reactivity:**
- [ ] Subscribe to relevant query for each computed field
- [ ] On query result change, recompute aggregation
- [ ] Emit value change event for threshold automations

**Verification:**
- Unit tests cover all aggregation types

### [ ] Step: Write computed field service tests

Create comprehensive tests for the computed field service.

**Files to create:**
- `packages/nxus-db/src/reactive/__tests__/computed-field.test.ts`

**Test cases:**
- [ ] Create computed field, verify initial value computed
- [ ] COUNT aggregation counts matching nodes correctly
- [ ] SUM aggregation sums numeric field values
- [ ] AVG aggregation computes correct average
- [ ] MIN aggregation finds minimum value
- [ ] MAX aggregation finds maximum value
- [ ] Value updates when matching node is added
- [ ] Value updates when matching node is removed
- [ ] Value updates when matching node's field value changes
- [ ] Handles null/undefined values gracefully
- [ ] Handles empty result set (returns null or 0 based on aggregation)

**Verification:**
- Run `pnpm --filter @nxus/db test src/reactive/__tests__/computed-field.test.ts`

### [ ] Step: Extend automation service with threshold triggers

Add threshold trigger support to the automation service.

**Files to modify:**
- `packages/nxus-db/src/reactive/automation.service.ts`

**Implementation:**
- [ ] Add `ThresholdTrigger` type: `{ type: 'threshold', computedFieldId, condition, fireOnce }`
- [ ] Subscribe to computed field value changes
- [ ] Detect threshold crossing (value goes from not-meeting to meeting condition)
- [ ] Track `thresholdCrossed` state for fireOnce behavior
- [ ] Reset `thresholdCrossed` when value drops below threshold

**Threshold conditions:**
- [ ] `gt` - greater than
- [ ] `gte` - greater than or equal
- [ ] `lt` - less than
- [ ] `lte` - less than or equal
- [ ] `eq` - equal to

**Verification:**
- Unit tests cover threshold detection

### [ ] Step: Write threshold automation tests

Create tests for threshold-based automations.

**Files to modify:**
- `packages/nxus-db/src/reactive/__tests__/automation.test.ts`

**Additional test cases:**
- [ ] Threshold automation fires when computed field crosses threshold
- [ ] `fireOnce: true` only fires once per crossing
- [ ] `fireOnce: false` fires on every evaluation while above threshold
- [ ] Threshold resets when value drops below
- [ ] After reset, crossing fires again
- [ ] Multiple threshold automations on same computed field

**Verification:**
- Run `pnpm --filter @nxus/db test src/reactive/__tests__/automation.test.ts`

### [ ] Step: Implement webhook action with async queue

Add webhook/external API action support with reliable async execution.

**Files to create:**
- `packages/nxus-db/src/reactive/webhook-queue.ts`

**Files to modify:**
- `packages/nxus-db/src/reactive/automation.service.ts`

**Implementation:**
- [ ] Define `WebhookAction` type with url, method, headers, body
- [ ] Define `WebhookJob` type for queue items
- [ ] Implement in-memory job queue with retry support
- [ ] `enqueueWebhook(automationId, action, context)` - add job to queue
- [ ] `processWebhookQueue()` - process pending jobs with fetch
- [ ] Template interpolation for body: `{{ node.id }}`, `{{ node.content }}`, `{{ computedField.value }}`
- [ ] Retry logic: 3 attempts with backoff
- [ ] Error logging for failed webhooks

**Verification:**
- Unit tests with mocked fetch

### [ ] Step: Write webhook queue tests

Create tests for the webhook execution queue.

**Files to create:**
- `packages/nxus-db/src/reactive/__tests__/webhook-queue.test.ts`

**Test cases:**
- [ ] Webhook is enqueued and executed
- [ ] Template variables are interpolated correctly
- [ ] Failed webhook retries up to 3 times
- [ ] Successful webhook is removed from queue
- [ ] Multiple webhooks process in order
- [ ] HTTP methods (GET, POST, PUT) work correctly
- [ ] Custom headers are sent

**Verification:**
- Run `pnpm --filter @nxus/db test src/reactive/__tests__/webhook-queue.test.ts`

### [ ] Step: Create server functions for reactive API

Expose reactive services through TanStack Start server functions.

**Files to create:**
- `packages/nxus-workbench/src/server/reactive.server.ts`

**Server functions:**
- [ ] `subscribeToQueryServerFn` - register query subscription, return ID
- [ ] `unsubscribeFromQueryServerFn` - unsubscribe by ID
- [ ] `createComputedFieldServerFn` - create computed field, return ID
- [ ] `getComputedFieldValueServerFn` - get current value
- [ ] `deleteComputedFieldServerFn` - delete computed field
- [ ] `createAutomationServerFn` - create automation, return ID
- [ ] `getAutomationsServerFn` - list all automations
- [ ] `setAutomationEnabledServerFn` - enable/disable automation
- [ ] `deleteAutomationServerFn` - delete automation

**Pattern:**
```typescript
export const createComputedFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    name: z.string(),
    definition: ComputedFieldDefinitionSchema,
    ownerId: z.string().optional(),
  }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, createComputedFieldService } = await import('@nxus/db/server')
    initDatabase()
    const db = getDatabase()
    const service = createComputedFieldService()
    const id = service.create(db, ctx.data)
    return { success: true as const, id }
  })
```

**Verification:**
- Server functions compile without errors
- Manual testing via API calls

### [ ] Step: Subscription tracker integration test (acceptance test)

Create the acceptance test from requirements document.

**Files to create:**
- `packages/nxus-db/src/reactive/__tests__/subscription-tracker.test.ts`

**Test scenario:**
- [ ] Create computed field: `SUM(subscription.monthlyPrice)` for nodes with `supertag:subscription`
- [ ] Create threshold automation: when total > 100, call webhook
- [ ] Add subscriptions totaling $95
- [ ] Verify computed field value is 95
- [ ] Verify webhook NOT called
- [ ] Add subscription pushing total to $105
- [ ] Verify computed field value is 105
- [ ] Verify webhook called exactly once
- [ ] Add more subscriptions
- [ ] Verify webhook NOT called again (fireOnce)
- [ ] Remove subscriptions to drop below $100
- [ ] Add subscription to cross threshold again
- [ ] Verify webhook called second time (threshold reset)

**Verification:**
- Run `pnpm --filter @nxus/db test src/reactive/__tests__/subscription-tracker.test.ts`

---

# Phase 3: Smart Invalidation (Optimization)

### [ ] Step: Create dependency tracker

Implement query-to-field dependency mapping for selective invalidation.

**Files to create:**
- `packages/nxus-db/src/reactive/dependency-tracker.ts`

**Implementation:**
- [ ] Analyze `QueryDefinition` to extract field dependencies
- [ ] Map subscriptionId → Set of fieldSystemIds that affect it
- [ ] On mutation, check if any active subscription depends on changed field
- [ ] Only re-evaluate affected subscriptions

**Dependency extraction rules:**
- Supertag filter → depends on `field:supertag`
- Property filter → depends on specified fieldSystemId
- Content filter → depends on content (special case)
- Logical filters → union of child dependencies

**Verification:**
- Unit tests for dependency extraction

### [ ] Step: Implement batched re-evaluation

Add debouncing to batch rapid mutations into single re-evaluation.

**Files to modify:**
- `packages/nxus-db/src/reactive/query-subscription.service.ts`

**Implementation:**
- [ ] Collect mutations during debounce window (configurable, default 10ms)
- [ ] After window, evaluate each affected subscription once
- [ ] Merge added/removed from all batched mutations
- [ ] Expose `setDebounceMs(ms)` for testing (0 = immediate)

**Verification:**
- Test that rapid mutations result in single callback
- Test that debounce can be disabled for tests

### [ ] Step: Add performance metrics

Implement observable metrics for the reactive system.

**Files to create:**
- `packages/nxus-db/src/reactive/metrics.ts`

**Metrics to track:**
- [ ] `evaluationCount` - total query re-evaluations
- [ ] `evaluationTimeMs` - cumulative evaluation time
- [ ] `activeSubscriptions` - current subscription count
- [ ] `eventCount` - total events emitted
- [ ] `skippedEvaluations` - evaluations skipped due to smart invalidation

**API:**
- [ ] `getMetrics()` - return current metrics
- [ ] `resetMetrics()` - reset counters (for testing)

**Verification:**
- Metrics update correctly during operation

### [ ] Step: Performance benchmarks

Create performance benchmarks to validate optimization.

**Files to create:**
- `packages/nxus-db/src/reactive/__tests__/performance.bench.ts`

**Benchmarks:**
- [ ] 50 subscriptions + 10k nodes: measure mutation latency
- [ ] 100 subscriptions + 50k nodes: measure with smart invalidation
- [ ] Rapid mutations (100 in 50ms): verify batching reduces evaluations

**Targets:**
- Phase 1 (brute force): <100ms for 50 subscriptions
- Phase 3 (smart invalidation): <50ms for 100 subscriptions

**Verification:**
- Benchmarks run successfully
- Results documented in spec.md

---

# Phase 4: Differential Dataflow (Future Scale)

### [ ] Step: Research d2ts integration

Investigate integrating d2ts (TanStack DB's differential dataflow engine) for incremental updates.

**Tasks:**
- [ ] Review d2ts API and documentation
- [ ] Prototype query evaluation using d2ts
- [ ] Benchmark performance comparison
- [ ] Document migration path

**Deliverable:**
- Technical design document for d2ts integration
- Go/no-go recommendation based on benchmarks

### [ ] Step: Implement differential dataflow engine (if approved)

Replace brute-force re-evaluation with incremental computation.

**Implementation (TBD based on research):**
- [ ] Model queries as d2ts pipelines
- [ ] Emit incremental updates instead of full re-evaluation
- [ ] Maintain d2ts collections for active subscriptions

**Target:**
- <1ms updates at 300k nodes

---

# Verification Summary

After completing each phase, run the full test suite:

```bash
# Unit tests
pnpm --filter @nxus/db test

# Lint
pnpm --filter @nxus/db lint

# Type check
pnpm --filter @nxus/db typecheck
```

## Phase 1 Completion Criteria

- [ ] Event bus emits events for all mutations
- [ ] Query subscriptions detect added/removed/changed nodes
- [ ] Automations fire on query membership changes
- [ ] Cycle detection prevents infinite loops
- [ ] All tests pass

## Phase 2 Completion Criteria

- [ ] Computed fields calculate SUM, COUNT, AVG, MIN, MAX
- [ ] Threshold automations fire on computed field changes
- [ ] Webhooks execute with retry
- [ ] Subscription tracker acceptance test passes
- [ ] All tests pass

## Phase 3 Completion Criteria

- [ ] Smart invalidation reduces unnecessary re-evaluations
- [ ] Batching handles rapid mutations efficiently
- [ ] Performance benchmarks meet targets
- [ ] All tests pass

## Phase 4 Completion Criteria

- [ ] d2ts integration provides sub-millisecond updates (if implemented)
- [ ] No regression in correctness
- [ ] All tests pass
