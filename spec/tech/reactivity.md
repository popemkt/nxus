# Reactivity: Event Bus, Live Queries, Computed Fields, Automations

Invalidated by: implementation decisions about how mutations propagate to live queries, computed fields, and automations.

Scope: everything under `libs/nxus-db/src/reactive/`. The data model these events describe is owned by [../product/data-model.md](../product/data-model.md); the query evaluator and write API are owned by [./persistence.md](./persistence.md). This file owns the propagation contract: *what fires when a node changes, and what is allowed to react*.

## 1. Architecture summary

Every write in the node service synchronously emits a typed `MutationEvent` on a singleton in-memory event bus. Three consumers subscribe:

1. **Query subscriptions** — live `QueryDefinition` results, re-evaluated with dependency-tracked (smart) invalidation and diffed into added/removed/changed sets.
2. **Computed fields** — COUNT/SUM/AVG/MIN/MAX aggregations over a query subscription's results, cached back into the DB as node properties.
3. **Automations** — trigger→action rules (query-membership or computed-field threshold triggers), with a cycle guard; webhook actions go through an in-memory retry queue.

Public surface is re-exported from `libs/nxus-db/src/reactive/index.ts` (factories + singletons for every service). Each service MUST be constructible as an isolated instance (factory) for tests; the module-level singletons are the production wiring.

## 2. Event bus

`libs/nxus-db/src/reactive/event-bus.ts`

- `createEventBus()` (event-bus.ts:27) returns `{ subscribe, emit, listenerCount, clear }` (interface: reactive/types.ts:326-348). Singleton `eventBus` at event-bus.ts:126.
- **Emission is synchronous**: `emit()` iterates all subscribers inline (event-bus.ts:77-108). Sync listener cost is therefore paid *inside the mutating call* — a slow subscription evaluation blocks `setProperty`. This is the intended model (see §9 performance targets); listeners MUST stay fast.
- **Error isolation**: a throwing sync listener is caught and logged, remaining listeners still run (event-bus.ts:100-106). Async listeners are fire-and-forget; rejections are logged only (event-bus.ts:92-98). Listener failure MUST NOT fail the mutation.
- **Filtering**: `subscribe(listener, filter?)` supports `EventFilter { types?, nodeIds?, fieldIds?, supertagIds? }` (types.ts:63-68); all present clauses must match (AND semantics, event-bus.ts:34-64).
- `emit()` increments `reactiveMetrics.eventCount` (event-bus.ts:79).

### 2.1 Mutation event vocabulary

`MutationType` — exactly 8 values (types.ts:24-33): `node:created | node:updated | node:deleted | property:set | property:added | property:removed | supertag:added | supertag:removed`. `MutationEvent` (types.ts:39-53) carries `nodeId`, `timestamp`, and per-kind context: `fieldId` (field node UUID) **and** `fieldSystemId` (e.g. `field:status`) for property events, `supertagId`/`supertagSystemId` for supertag events, `beforeValue`/`afterValue` for change detection.

### 2.2 Emission contract (write API → events)

Every write path in `libs/nxus-db/src/services/node.service.ts` MUST emit; this is what makes the bus trustworthy as the sole invalidation source:

| Write fn | Emits | Site |
|---|---|---|
| `createNode` | `node:created`; plus `supertag:added` if `supertagId` option given | node.service.ts:627, :645 |
| `updateNodeContent` | `node:updated` (before/after content) | node.service.ts:680 |
| `deleteNode` (soft) | `node:deleted` | node.service.ts:703 |
| `setProperty` | `property:set` (with beforeValue) | node.service.ts:765 |
| `addPropertyValue` | `property:added` | node.service.ts:815 |
| `clearProperty` | one `property:removed` **per removed value** | node.service.ts:870 |
| `setNodeSupertags` | `supertag:removed`/`supertag:added` per diffed tag | node.service.ts:1125, :1138 |
| `addNodeSupertag` | `supertag:added` | node.service.ts:1176 |
| `removeNodeSupertag` | `supertag:removed` | node.service.ts:1224 |

The SurrealDB backend duplicates this contract at 9 emit sites (`services/backends/surreal-backend.ts:240-722`) — emission logic is copy-pasted per backend, not centralized. Any new write path (any backend) MUST emit the matching event(s), or live queries silently go stale.

DRIFT: events emitted mid-mutation, no transaction boundary
- canonical: listeners observe only fully-applied mutations; a multi-step write (create + tag) is atomic before any event fires.
- current: `createNode` emits `node:created` before the supertag assignment runs (node.service.ts:627 vs :645); no write is wrapped in a transaction (see ./persistence.md). Synchronous listeners (automations) can read and act on half-applied state.
- impact: automations/computed fields can fire on a node that "has no supertag yet", producing wrong membership diffs that self-correct only on the next event.
- closes: wrap multi-step writes in a transaction and emit events after commit (or queue events until commit).

## 3. Live query subscriptions

`libs/nxus-db/src/reactive/query-subscription.service.ts`

### 3.1 Contract

- `querySubscriptionService.subscribe(db, definition, onResultChange)` → `SubscriptionHandle { id, unsubscribe, getLastResults }` (query-subscription.service.ts:56-63, :431-482). Subscribing performs an **initial synchronous evaluation** (:439) and registers the query's dependencies with the tracker (:459). Singleton at :570.
- The service lazily subscribes to the event bus on first subscription and unsubscribes at zero subscriptions (:414-428).
- On relevant mutations, affected subscriptions are re-evaluated via `evaluateQuery` (the evaluator in `services/query-evaluator.service.ts`, owned by ./persistence.md) and diffed against the previous result set (:230-296). The callback fires **only when the diff is non-empty** (:284-286) with `QueryResultChangeEvent { added, removed, changed, totalCount, evaluatedAt }` (types.ts:91-98).
- **Change detection** for still-matching nodes uses a string signature of content + sorted properties (rawValue by order) + sorted supertag IDs (`computeNodeSignature`, :198-218). Two nodes with equal signatures are "unchanged".
- Callback errors are caught and logged; they MUST NOT break other subscriptions (:305-313).
- Each subscription retains the **full `AssembledNode` map** of its last results (`lastAssembledNodes`, :163) to serve `getLastResults()` synchronously and to report `removed` nodes with their final state. Memory cost is O(results × subscriptions).

### 3.2 Batching (debounce)

- `setDebounceMs(ms)` enables mutation batching: mutations accumulate in `pendingMutations`; the timer resets on each new mutation; on expiry all affected subscriptions are evaluated **once each** (:391-409, :324-371). `flushPendingMutations()` forces immediate processing (:557-562).
- Default is `debounceMs = 0` — immediate, per-mutation processing (:190). Note: the interface doc-comment claims "default: 10" (:137); the implementation's 0 is authoritative.

### 3.3 Smart invalidation

`libs/nxus-db/src/reactive/dependency-tracker.ts`

On registration, a query's filters are statically analyzed into a `DependencySet` of field UUIDs, `supertag:<uuid>` keys, and markers from `DEPENDENCY_MARKERS` (`__content__`, `__node_membership__`, `__any_supertag__`, `__owner__`, `__created_at__`, `__updated_at__`; dependency-tracker.ts:39-52). Extraction rules (`extractFilterDependencies`, :133-236):

- `supertag` filter → `supertag:<supertagId>`; plus `ANY_SUPERTAG` unless `includeInherited === false` (:141-146).
- `property` / `hasField` → the filter's `fieldId` (:153, :212); `path` → every hop's `fieldId` (:160-163).
- `content` → `CONTENT` (:168); `temporal` → `CREATED_AT`/`UPDATED_AT` (:199-207).
- `relation` childOf/ownedBy → `OWNER`; linksTo/linkedFrom **without** a fieldId → `NODE_MEMBERSHIP` (conservative: any property could be a link, :173-195).
- `and`/`or`/`not` → union of children (:216-228); unknown filter type → `NODE_MEMBERSHIP` (fail-safe over-invalidation, :230-233).
- Every query implicitly depends on `NODE_MEMBERSHIP` (:248) and on its `sort` field (:259-271).

Mutation → affected-dependency mapping (`getMutationAffectedDependencies`, :294-338): `node:created`/`node:deleted` affect **all** subscriptions (`affectsAll`, :298-303, :419-426); `node:updated` → `CONTENT`+`UPDATED_AT`; property events → both the field UUID and its systemId, plus `UPDATED_AT` (:312-324); supertag events → `supertag:<uuid>` + `ANY_SUPERTAG` + `UPDATED_AT` (:326-334). Lookup is O(1) per dependency via a reverse index `dependency → Set<subscriptionId>` (:355).

Additionally, independent of dependencies, any subscription whose **last result set contains the mutated node** is re-evaluated, so `changed` events are never missed (query-subscription.service.ts:342-349).

Smart invalidation MAY be disabled (`setSmartInvalidation(false)`) to fall back to brute-force re-evaluation of every subscription (:365-370); skipped evaluations are counted in metrics (:352-356). Correctness rule: the dependency analysis MUST over-approximate — a mutation that could change a query's results MUST map to at least one of that query's dependencies. Missing a dependency class is a correctness bug (stale live query), not a perf bug.

## 4. Computed fields

`libs/nxus-db/src/reactive/computed-field.service.ts`

- A computed field is a **node** tagged `supertag:computed_field` with properties `field:computed_field_definition` (JSON `ComputedFieldDefinition`), `field:computed_field_value`, `field:computed_field_updated_at` (constants :49-55; definition schema types.ts:113-124).
- `ComputedFieldDefinition = { aggregation: COUNT|SUM|AVG|MIN|MAX, query: QueryDefinition, fieldId?, parentNodeId? }`. `fieldId` (UUID **or** systemId, matched against either — :186-206) is required for all aggregations except COUNT; non-numeric values are skipped, string values are `parseFloat`ed (:193-199). Empty input → `null` (not 0) for SUM/AVG/MIN/MAX (:228, :249).
- Each active computed field owns one query subscription; on any result change the aggregate is recomputed from `getLastResults()` and, **only if the value changed**, written back to the DB via `setProperty` (value + updatedAt, :375-385, :390-420) and broadcast to `onValueChange` listeners (:345-370). Note the write-back itself emits `property:set` events — computed-field updates are ordinary mutations and can cascade.
- `getValue()` prefers the live in-memory value; otherwise it returns the **possibly-stale DB-cached value** without activating a subscription (:572-590). `recompute()`/`initialize()` activate live updates (:592-641, :744-759). `initialize(db)` MUST be called once at process start to resurrect subscriptions for persisted computed fields; nothing calls it automatically.
- `getAll()` discovers computed-field nodes by scanning all `field:supertag` property rows and JSON-parsing values (:654-666) — same full-scan cost model as the query evaluator (see ./persistence.md).

## 5. Automations

`libs/nxus-db/src/reactive/automation.service.ts`

- An automation is a **node** tagged `supertag:automation` with properties `field:automation_definition` (JSON `AutomationDefinition`), `field:automation_state`, `field:automation_last_fired`, `field:automation_enabled` (:92-99). `AutomationDefinition = { name, trigger, action, enabled }` (types.ts:301-307); triggers and actions are Zod discriminated unions (types.ts:196-200, :285-292).

### 5.1 Triggers

1. **`query_membership`** `{ queryDefinition, event: onEnter|onExit|onChange }` (types.ts:160-171): the service subscribes to the query; on a result-change event it targets `added`/`removed`/`changed` nodes respectively and executes the action per node (automation.service.ts:314-368). `field:automation_last_fired` is updated per firing (:353-366).
2. **`threshold`** `{ computedFieldId, condition: {operator: gt|gte|lt|lte|eq, value}, fireOnce }` (types.ts:182-191): listens to a computed field's `onValueChange`; fires on a **crossing** (previously-not-met → met, :412-416). `fireOnce: true` suppresses re-fires while the condition stays met and auto-resets when it stops being met; the crossed flag persists in `field:automation_state` so restarts don't re-fire (:419-437, :639-648). On registration, an already-met condition with `fireOnce` is marked crossed without firing (:643-648).

### 5.2 Actions

`set_property` (supports `{ $now: true }` marker → current ISO timestamp), `add_supertag`, `remove_supertag`, `create_node`, `webhook` (types.ts:209-292). Execution (`executeAction`, automation.service.ts:237-309) calls the node.service write API directly — automation effects are ordinary mutations that re-enter the event bus, which is what makes automation chains possible. Threshold triggers have no target node, so node-targeted actions (`set_property`, `add/remove_supertag`) are warn-skipped; only `webhook` executes (:483-552).

DRIFT: create_node action defined but not executable
- canonical: every member of `ActionTypeSchema` is executable.
- current: `create_node` exists in the schema (types.ts:255-261) but `executeAction` has no branch for it — comment "Future: create_node action" (automation.service.ts:300, :543).
- impact: a validated automation with a `create_node` action silently does nothing.
- closes: implement the branch (with cycle-guard participation) or remove it from the schema.

### 5.3 Cycle guard

Two mechanisms, both mandatory (automation.service.ts:87, :246-262):

- **Depth cap**: `MAX_EXECUTION_DEPTH = 10`. Each action execution runs at `context.depth + 1` (via the closure-level `currentExecutionDepth`, :232, :265, restored in `finally` :307); at depth ≥ 10 the action is skipped with a warning. Because emission is synchronous, an automation's action that triggers another automation executes *within* the first one's call stack — depth genuinely nests.
- **Per-chain node set**: `context.triggeringNodeIds` records nodes already acted on in the execution chain; re-targeting the same node is skipped (:254-262). This stops A→B→A ping-pong before the depth cap.

Action errors are caught and logged; the chain continues (:301-306).

### 5.4 Lifecycle

`create` persists definition + enabled + empty state, and registers the live subscription if enabled (:752-802). `setEnabled` updates both the property and the embedded definition JSON, registering/unregistering accordingly (:804-845). `delete` unregisters and soft-deletes the node (:896-906). `initialize(db)` loads all enabled automations from the DB and re-registers them (:994-1013) — like computed fields, it MUST be called at process start; nothing does so automatically. `getAll` uses the same full-scan discovery as computed fields (:868-880). `trigger()` exists for manual/test firing (:908-980).

DRIFT: singleton wiring is disjoint — threshold automations can't see the computed-field singleton
- canonical: the exported singletons form one connected reactive graph: computed fields created anywhere fire threshold automations.
- current: `automationService = createAutomationService()` (automation.service.ts:1025) constructs its **own private** computed-field service (:227-228), while `computedFieldService` (computed-field.service.ts:767) is a separate instance — and each default-constructed service also creates its own private query subscription service instead of the `querySubscriptionService` singleton (computed-field.service.ts:339-340, automation.service.ts:225-226).
- impact: a threshold automation registered on the `automationService` singleton listens to a computed-field instance that no other code writes through; value changes on the exported `computedFieldService` never reach it. Threshold automations only work when caller wires all three services together explicitly.
- closes: default the factories to the exported singletons (or export one pre-wired composition root) and test the singleton path.

## 6. Webhook queue

`libs/nxus-db/src/reactive/webhook-queue.ts`

- In-memory `Map<jobId, WebhookJob>` (:247); job = action + interpolation context + retry state (`status: pending|processing|completed|failed`, :47-58).
- **Templates**: `{{ path.to.value }}` interpolated against `WebhookContext { node?, computedField?, automation, timestamp }` in URL, header values, and (recursively) body objects/arrays (:148-207); unresolved paths become `''` (:152-154). Bodies are JSON-encoded; `Content-Type: application/json` is defaulted for POST/PUT with body (:273-277).
- **Retry**: default 3 attempts, exponential backoff `1000ms × 2^(attempt-1)` with 0-30% jitter, capped at 30s (:213-218, :230-240). Non-2xx counts as failure (:307-320). `processQueue()` is single-flight (concurrency guard, :402-404), processes due pending jobs, and garbage-collects completed/failed jobs older than 1h (:419-428).
- Processing is **pull-based**: the automation service enqueues then fire-and-forgets one `processQueue()` (automation.service.ts:291-298); retries only actually happen if `startProcessing()` (a 100ms `setInterval` loop, :453-463) is running or something else keeps calling `processQueue()`. Nothing in production code calls `startProcessing()`.

## 7. Metrics

`libs/nxus-db/src/reactive/metrics.ts` — singleton `reactiveMetrics` (:152) with counters `eventCount`, `evaluationCount`, `evaluationTimeMs`, `skippedEvaluations` and gauge `activeSubscriptions` (:23-41). Instrumentation points: bus emit (event-bus.ts:79), each subscription evaluation (query-subscription.service.ts:279-281), smart-invalidation skips (:352-356), subscription count changes (:462, :473, :487). `resetMetrics()` clears counters but not the gauge (metrics.ts:112-119).

## 8. Performance model

The system optimizes **number of query evaluations per mutation**, not evaluation cost (the evaluator full-scans; see ./persistence.md). Targets are encoded as tests in `libs/nxus-db/src/reactive/__tests__/performance-targets.test.ts` (header :4-11; CI runs scaled-down node counts):

| Target | Assertion |
|---|---|
| Phase 1 (brute force): 50 subs + 10k nodes, mutation latency < 100ms | test at 1k nodes verifies exactly 50×10 evaluations for 10 mutations (performance-targets.test.ts:293-327, :326) |
| Phase 3 (smart invalidation): 100 subs + 50k nodes < 50ms | test at 5k nodes asserts **skip ratio > 50%** of considered evaluations (:331-368, :367) and smart ≤ brute-force evaluation counts (:370-410, :405) |
| Batching: 100 rapid mutations | asserts **> 80% reduction** in evaluations with `setDebounceMs(50)` vs 0 (:417-457, :456) |

Full-size benchmarks live in `__tests__/performance.bench.ts`. Latency numbers are logged, not asserted (hardware-dependent); the invariants that MUST hold are the evaluation-count reductions.

## 9. Process model (the load-bearing caveat)

The entire reactive layer assumes **one long-lived Node.js process** that opens the SQLite DB, calls `computedFieldService.initialize()` / `automationService.initialize()`, and performs all writes in-process so emissions reach the bus.

DRIFT: all reactive state is process-local and in-memory
- canonical: subscriptions, computed-field liveness, automation registrations, and queued webhooks survive restarts and work under multi-process deployment.
- current: event bus (event-bus.ts:126), subscription maps (query-subscription.service.ts:179), active computed fields (computed-field.service.ts:337), active automations (automation.service.ts:224), and webhook jobs (webhook-queue.ts:247) are module-level in-memory singletons. Restart loses live subscriptions and any pending/failed webhook jobs; computed-field values in the DB go stale until re-`initialize()`d. Writes from a second process (or serverless/multi-worker TanStack Start instances) never reach another process's bus, so its live queries silently freeze.
- impact: correctness (not just perf) under any deployment other than a single dev server; silent data staleness, dropped webhooks.
- closes: durable trigger/queue substrate (e.g. SQLite-backed outbox + poller, or an external queue) and cross-process invalidation (DB change feed or single-writer service).

DRIFT: reactive layer is hard-wired to sync SQLite (`type Database = any`)
- canonical: reactivity works through the `NodeBackend` abstraction so both `node` and `graph` architecture modes have a reactive path (see ./architecture.md for the modes decision).
- current: `QuerySubscriptionService.subscribe` takes `type Database = any` (query-subscription.service.ts:46 — also violating the repo's own no-`any` rule, [../rules/](../rules/)) and passes it to the sync-SQLite `evaluateQuery`; computed-field and automation services type it as `ReturnType<typeof getDatabase>` (computed-field.service.ts:65, automation.service.ts:109) and call sync `node.service` functions directly. `SurrealBackend` dutifully emits events (surreal-backend.ts:240-722) that no subscription can evaluate against — graph mode has emission but no reaction.
- impact: `ARCHITECTURE_TYPE=graph` disables live queries/computed fields/automations entirely; the `any` erases compile-time protection at the layer's most-trafficked boundary.
- closes: route evaluation through `NodeBackend.evaluateQuery` (async), type `db` as the backend interface, and delete the `any`.
