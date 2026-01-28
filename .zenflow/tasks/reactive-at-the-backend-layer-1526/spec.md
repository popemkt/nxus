# Technical Specification: Reactive Query System at the Backend Layer

## Overview

This specification describes the implementation of a reactive query system at the backend layer for Nxus. The system enables Tana-like live queries and automations that work independently of the UI, supporting future API consumers.

## Technical Context

### Current Stack

| Component | Technology | Location |
|-----------|------------|----------|
| Storage | SQLite + Drizzle ORM | `packages/nxus-db/` |
| Schema | Node-based EAV model | `src/schemas/node-schema.ts` |
| Query Engine | Pull-based evaluator | `src/services/query-evaluator.service.ts` |
| Server API | TanStack Start server functions | `packages/nxus-workbench/src/server/` |
| Types | TypeScript + Zod | `src/types/query.ts` |

### Core Data Model

```
nodes: id, content, systemId, ownerId, timestamps
nodeProperties: nodeId, fieldNodeId, value (JSON), order
```

All entities (supertags, fields, items, queries) are nodes. Relationships are encoded as properties where `value` contains node UUIDs.

### Existing Query System

The current query evaluator (`query-evaluator.service.ts:70-111`) is pull-based:

1. Get all non-deleted node IDs
2. Apply filters sequentially (intersect candidate sets)
3. Assemble matching nodes (resolve properties)
4. Sort and limit
5. Return results

Supported filters: supertag, property, content, hasField, temporal, relation, logical (and/or/not).

## Implementation Approach: Event Bus + SQLite

Based on requirements analysis, we implement **Option F: Custom Event Bus + SQLite** with phased optimization.

### Why This Approach

| Factor | Decision Rationale |
|--------|-------------------|
| Migration Risk | Minimal - no storage layer changes |
| Time to Value | Incremental - basic reactivity in Phase 1 |
| Existing Patterns | Aligns with pure functions + server functions |
| Optimization Path | Can adopt d2ts/differential dataflow later |
| Single-User | Aggressive memory caching acceptable |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mutation API                            │
│              (createNode, setProperty, deleteNode)              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ emit
┌─────────────────────────────▼───────────────────────────────────┐
│                         Event Bus                               │
│   MutationEvent: {type, nodeId, fieldSystemId?, before, after}  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ broadcast
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Query Registry  │  │ Computed Fields │  │ Automation Svc  │
│ (subscriptions) │  │ (aggregations)  │  │ (rules engine)  │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │ diff               │ recompute          │ trigger
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ResultChange    │  │ ComputedValue   │  │ Action Executor │
│ (add/remove)    │  │ Update          │  │ (webhook queue) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Source Code Structure

### New Files to Create

```
packages/nxus-db/src/
├── reactive/
│   ├── index.ts                      # Public exports
│   ├── event-bus.ts                  # Mutation event emitter
│   ├── types.ts                      # Reactive system types
│   ├── query-subscription.service.ts # Live query registry
│   ├── computed-field.service.ts     # Aggregation engine
│   ├── automation.service.ts         # Rules engine
│   ├── dependency-tracker.ts         # Query→field mapping (Phase 3)
│   └── __tests__/
│       ├── event-bus.test.ts
│       ├── query-subscription.test.ts
│       ├── computed-field.test.ts
│       └── automation.test.ts
├── schemas/
│   └── node-schema.ts                # Add new system fields (extend)

packages/nxus-workbench/src/server/
├── reactive.server.ts                # Server functions for reactive API
```

### Modified Files

| File | Changes |
|------|---------|
| `node.service.ts` | Wrap mutations to emit events |
| `node-schema.ts` | Add system fields for computed fields and automations |
| `server.ts` | Export reactive module |
| `services/index.ts` | Export reactive services |

## Data Model Changes

### New System Fields

Add to `SYSTEM_FIELDS` in `node-schema.ts`:

```typescript
// Computed Field specific
COMPUTED_FIELD_DEFINITION: 'field:computed_field_definition', // JSON aggregation config
COMPUTED_FIELD_VALUE: 'field:computed_field_value',           // Current computed value
COMPUTED_FIELD_UPDATED_AT: 'field:computed_field_updated_at', // Last update timestamp

// Automation specific
AUTOMATION_DEFINITION: 'field:automation_definition',         // JSON trigger+action config
AUTOMATION_STATE: 'field:automation_state',                   // For threshold tracking
AUTOMATION_LAST_FIRED: 'field:automation_last_fired',         // Timestamp
AUTOMATION_ENABLED: 'field:automation_enabled',               // Boolean
```

### New System Supertags

Add to `SYSTEM_SUPERTAGS` in `node-schema.ts`:

```typescript
COMPUTED_FIELD: 'supertag:computed_field',  // Computed field definitions
AUTOMATION: 'supertag:automation',          // Automation rules
```

## Interface Definitions

### Event Bus Types (`reactive/types.ts`)

```typescript
/**
 * Types of mutations that trigger events
 */
export type MutationType =
  | 'node:created'
  | 'node:updated'
  | 'node:deleted'
  | 'property:set'
  | 'property:added'
  | 'property:removed'
  | 'supertag:added'
  | 'supertag:removed'

/**
 * Mutation event emitted by the event bus
 */
export interface MutationEvent {
  type: MutationType
  timestamp: Date
  nodeId: string
  systemId?: string | null  // Node's systemId (for quick filtering)

  // Property-specific fields
  fieldSystemId?: string    // e.g., 'field:status'
  beforeValue?: unknown     // Previous value (for change detection)
  afterValue?: unknown      // New value

  // Supertag-specific fields
  supertagSystemId?: string // e.g., 'supertag:subscription'
}

/**
 * Event listener signature
 */
export type MutationListener = (event: MutationEvent) => void | Promise<void>

/**
 * Filter to selectively receive events
 */
export interface EventFilter {
  types?: MutationType[]           // Filter by event type
  nodeIds?: string[]               // Filter by specific node(s)
  fieldSystemIds?: string[]        // Filter by field changes
  supertagSystemIds?: string[]     // Filter by supertag changes
}
```

### Query Subscription Types

```typescript
/**
 * Live query subscription
 */
export interface QuerySubscription {
  id: string
  queryDefinition: QueryDefinition
  lastResults: Set<string>        // Node IDs from last evaluation
  lastEvaluatedAt: Date

  // Callbacks
  onResultChange?: (event: QueryResultChangeEvent) => void
}

/**
 * Change event for query results
 */
export interface QueryResultChangeEvent {
  subscriptionId: string
  added: AssembledNode[]          // Nodes newly matching
  removed: AssembledNode[]        // Nodes no longer matching
  changed: AssembledNode[]        // Nodes still matching but properties changed
  totalCount: number
  evaluatedAt: Date
}
```

### Computed Field Types

```typescript
/**
 * Aggregation types supported
 */
export type AggregationType = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'

/**
 * Computed field definition (stored in field:computed_field_definition)
 */
export interface ComputedFieldDefinition {
  aggregation: AggregationType
  query: QueryDefinition          // Which nodes to aggregate
  fieldSystemId?: string          // Which field to aggregate (for SUM, AVG, etc.)
  parentNodeId?: string           // Optional parent (null = global)
}

/**
 * Runtime computed field with current value
 */
export interface ComputedField {
  id: string                      // Node ID of the computed field node
  name: string                    // Display name
  definition: ComputedFieldDefinition
  value: number | null            // Current computed value
  updatedAt: Date
}
```

### Automation Types

```typescript
/**
 * Trigger types for automations
 */
export type TriggerType =
  | 'query_membership'    // Node enters/exits query results
  | 'threshold'           // Computed field crosses threshold

/**
 * Query membership trigger
 */
export interface QueryMembershipTrigger {
  type: 'query_membership'
  queryDefinition: QueryDefinition
  event: 'onEnter' | 'onExit' | 'onChange'
}

/**
 * Threshold trigger for computed fields
 */
export interface ThresholdTrigger {
  type: 'threshold'
  computedFieldId: string
  condition: {
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
    value: number
  }
  fireOnce: boolean               // Only fire once per crossing
}

export type AutomationTrigger = QueryMembershipTrigger | ThresholdTrigger

/**
 * Action types for automations
 */
export type ActionType =
  | 'set_property'
  | 'add_supertag'
  | 'remove_supertag'
  | 'create_node'
  | 'webhook'

/**
 * Set property action
 */
export interface SetPropertyAction {
  type: 'set_property'
  fieldSystemId: string
  value: unknown | { $now: true }  // Special value for current timestamp
}

/**
 * Webhook action (executed async via job queue)
 */
export interface WebhookAction {
  type: 'webhook'
  url: string
  method: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  body?: Record<string, unknown>
  // Template variables: {{ node.id }}, {{ node.content }}, {{ computedField.value }}
}

export type AutomationAction =
  | SetPropertyAction
  | { type: 'add_supertag'; supertagSystemId: string }
  | { type: 'remove_supertag'; supertagSystemId: string }
  | { type: 'create_node'; content: string; supertagSystemId?: string; ownerId?: string }
  | WebhookAction

/**
 * Complete automation definition (stored in field:automation_definition)
 */
export interface AutomationDefinition {
  name: string
  trigger: AutomationTrigger
  action: AutomationAction
  enabled: boolean
}

/**
 * Automation state for threshold tracking (stored in field:automation_state)
 */
export interface AutomationState {
  lastTriggeredAt?: string        // ISO timestamp
  thresholdCrossed?: boolean      // For fireOnce tracking
  previousValue?: number          // For detecting crossing direction
}
```

## API Design

### Event Bus API (`reactive/event-bus.ts`)

```typescript
/**
 * Singleton event bus for mutation events
 */
export interface EventBus {
  /**
   * Subscribe to mutation events
   * @returns Unsubscribe function
   */
  subscribe(listener: MutationListener, filter?: EventFilter): () => void

  /**
   * Emit a mutation event (called by mutation functions)
   * @internal
   */
  emit(event: MutationEvent): void

  /**
   * Get current listener count (for debugging)
   */
  listenerCount(): number

  /**
   * Clear all listeners (for testing)
   */
  clear(): void
}

// Implementation: Simple in-memory pub/sub
const eventBus = createEventBus()
export { eventBus }
```

### Query Subscription Service (`reactive/query-subscription.service.ts`)

```typescript
/**
 * Manage live query subscriptions
 */
export interface QuerySubscriptionService {
  /**
   * Subscribe to query result changes
   */
  subscribe(
    db: Database,
    definition: QueryDefinition,
    onResultChange: (event: QueryResultChangeEvent) => void
  ): QuerySubscription

  /**
   * Unsubscribe from a query
   */
  unsubscribe(subscriptionId: string): void

  /**
   * Get all active subscriptions (for debugging)
   */
  getActiveSubscriptions(): QuerySubscription[]

  /**
   * Force re-evaluate all subscriptions (e.g., after bulk import)
   */
  refreshAll(db: Database): void
}

// Creates a service instance that auto-subscribes to event bus
export function createQuerySubscriptionService(): QuerySubscriptionService
```

### Computed Field Service (`reactive/computed-field.service.ts`)

```typescript
/**
 * Manage computed field definitions and values
 */
export interface ComputedFieldService {
  /**
   * Create a new computed field (stored as node with supertag:computed_field)
   */
  create(
    db: Database,
    options: {
      name: string
      definition: ComputedFieldDefinition
      ownerId?: string
    }
  ): string  // Returns computed field node ID

  /**
   * Get current value of a computed field
   */
  getValue(db: Database, computedFieldId: string): number | null

  /**
   * Force recompute a field's value
   */
  recompute(db: Database, computedFieldId: string): number | null

  /**
   * Get all computed fields
   */
  getAll(db: Database): ComputedField[]

  /**
   * Delete a computed field
   */
  delete(db: Database, computedFieldId: string): void
}

export function createComputedFieldService(): ComputedFieldService
```

### Automation Service (`reactive/automation.service.ts`)

```typescript
/**
 * Manage automation rules and execution
 */
export interface AutomationService {
  /**
   * Create a new automation (stored as node with supertag:automation)
   */
  create(
    db: Database,
    definition: AutomationDefinition
  ): string  // Returns automation node ID

  /**
   * Enable/disable an automation
   */
  setEnabled(db: Database, automationId: string, enabled: boolean): void

  /**
   * Get all automations
   */
  getAll(db: Database): Array<{
    id: string
    definition: AutomationDefinition
    state: AutomationState
  }>

  /**
   * Delete an automation
   */
  delete(db: Database, automationId: string): void

  /**
   * Manually trigger an automation (for testing)
   */
  trigger(
    db: Database,
    automationId: string,
    context: { nodeId?: string; computedFieldValue?: number }
  ): void
}

export function createAutomationService(): AutomationService
```

### Server Function Integration (`reactive.server.ts`)

```typescript
/**
 * Subscribe to a live query (returns subscription ID)
 * Real-time events delivered via WebSocket/SSE (Phase 2+)
 */
export const subscribeToQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    definition: QueryDefinitionSchema,
  }))
  .handler(async (ctx) => {
    // Implementation: Register subscription, return ID
    // Events pushed via separate WebSocket connection
  })

/**
 * Unsubscribe from a live query
 */
export const unsubscribeFromQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ subscriptionId: z.string() }))

/**
 * Create a computed field
 */
export const createComputedFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    name: z.string(),
    definition: ComputedFieldDefinitionSchema,
    ownerId: z.string().optional(),
  }))

/**
 * Get computed field value
 */
export const getComputedFieldValueServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ computedFieldId: z.string() }))

/**
 * Create an automation
 */
export const createAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    definition: AutomationDefinitionSchema,
  }))

/**
 * Get all automations
 */
export const getAutomationsServerFn = createServerFn({ method: 'GET' })
```

## Implementation Details

### Wrapping Mutations for Event Emission

Modify `node.service.ts` to emit events:

```typescript
// Before (current)
export function setProperty(db, nodeId, fieldSystemId, value, order = 0) {
  // ... direct DB operations
}

// After (with event emission)
export function setProperty(db, nodeId, fieldSystemId, value, order = 0) {
  const beforeValue = getPropertyValue(db, nodeId, fieldSystemId)

  // ... existing DB operations

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

Pattern applies to: `createNode`, `deleteNode`, `updateNodeContent`, `setProperty`, `addPropertyValue`, `clearProperty`, `setNodeSupertags`, `addNodeSupertag`, `removeNodeSupertag`.

### Query Subscription Re-evaluation Strategy

Phase 1 (Brute Force):

```typescript
// On any mutation event:
for (const subscription of activeSubscriptions) {
  // Re-evaluate entire query
  const newResults = evaluateQuery(db, subscription.queryDefinition)
  const newIds = new Set(newResults.nodes.map(n => n.id))

  // Diff with previous results
  const added = newResults.nodes.filter(n => !subscription.lastResults.has(n.id))
  const removed = [...subscription.lastResults]
    .filter(id => !newIds.has(id))
    .map(id => assembleNode(db, id))
    .filter(Boolean)

  // Detect changed (in both but properties different)
  const changed = newResults.nodes.filter(n =>
    subscription.lastResults.has(n.id) &&
    hasChangedProperties(n, subscription.lastNodeStates.get(n.id))
  )

  if (added.length || removed.length || changed.length) {
    subscription.onResultChange({ added, removed, changed, ... })
  }

  subscription.lastResults = newIds
}
```

Phase 3 (Smart Invalidation):

```typescript
// Track query dependencies
const queryDependencies = new Map<string, Set<string>>()
// subscriptionId -> Set of fieldSystemIds that could affect it

// On mutation event:
const affectedSubscriptions = activeSubscriptions.filter(sub =>
  queryTouchedByMutation(sub.queryDefinition, event)
)

// Only re-evaluate affected subscriptions
for (const subscription of affectedSubscriptions) {
  // ... same re-evaluation logic
}
```

### Computed Field Aggregation

```typescript
function computeAggregation(
  db: Database,
  definition: ComputedFieldDefinition
): number | null {
  // 1. Evaluate the query to get matching nodes
  const result = evaluateQuery(db, definition.query)

  if (result.nodes.length === 0) return null

  // 2. Extract values for aggregation field (if applicable)
  const values: number[] = []
  if (definition.fieldSystemId) {
    for (const node of result.nodes) {
      const propValue = getPropertyBySystemId(node, definition.fieldSystemId)
      if (typeof propValue === 'number') {
        values.push(propValue)
      }
    }
  }

  // 3. Apply aggregation
  switch (definition.aggregation) {
    case 'COUNT':
      return result.nodes.length
    case 'SUM':
      return values.reduce((a, b) => a + b, 0)
    case 'AVG':
      return values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null
    case 'MIN':
      return values.length > 0 ? Math.min(...values) : null
    case 'MAX':
      return values.length > 0 ? Math.max(...values) : null
  }
}
```

### Automation Execution

```typescript
// Query membership automation
eventBus.subscribe((event) => {
  for (const automation of getEnabledAutomations(db)) {
    if (automation.definition.trigger.type !== 'query_membership') continue

    const { queryDefinition, event: triggerEvent } = automation.definition.trigger

    // Check if this mutation could affect the query
    if (!couldAffectQuery(event, queryDefinition)) continue

    // Evaluate query membership
    const isInResults = evaluateQuery(db, queryDefinition)
      .nodes.some(n => n.id === event.nodeId)

    const wasInResults = automation.state.previouslyInResults?.includes(event.nodeId)

    if (triggerEvent === 'onEnter' && isInResults && !wasInResults) {
      executeAction(db, automation.definition.action, { nodeId: event.nodeId })
    } else if (triggerEvent === 'onExit' && !isInResults && wasInResults) {
      executeAction(db, automation.definition.action, { nodeId: event.nodeId })
    } else if (triggerEvent === 'onChange' && isInResults && wasInResults) {
      executeAction(db, automation.definition.action, { nodeId: event.nodeId })
    }

    // Update state
    updateAutomationState(db, automation.id, { previouslyInResults: isInResults })
  }
})

// Threshold automation
computedFieldService.onValueChange((fieldId, oldValue, newValue) => {
  for (const automation of getEnabledAutomations(db)) {
    if (automation.definition.trigger.type !== 'threshold') continue
    if (automation.definition.trigger.computedFieldId !== fieldId) continue

    const { condition, fireOnce } = automation.definition.trigger
    const wasTriggered = meetsCondition(oldValue, condition)
    const isTriggered = meetsCondition(newValue, condition)

    // Detect crossing
    if (!wasTriggered && isTriggered) {
      if (fireOnce && automation.state.thresholdCrossed) continue

      executeAction(db, automation.definition.action, {
        computedFieldId: fieldId,
        computedFieldValue: newValue
      })

      updateAutomationState(db, automation.id, {
        thresholdCrossed: true,
        lastTriggeredAt: new Date().toISOString()
      })
    } else if (wasTriggered && !isTriggered) {
      // Reset threshold crossed state when dropping below
      updateAutomationState(db, automation.id, { thresholdCrossed: false })
    }
  }
})
```

### Webhook Execution (Async Job Queue)

```typescript
interface WebhookJob {
  id: string
  automationId: string
  action: WebhookAction
  context: Record<string, unknown>
  retryCount: number
  createdAt: Date
}

// Simple in-memory queue for Phase 1
// Can upgrade to SQLite-based queue or external service later
const webhookQueue: WebhookJob[] = []

function enqueueWebhook(automationId: string, action: WebhookAction, context: Record<string, unknown>) {
  webhookQueue.push({
    id: uuidv7(),
    automationId,
    action,
    context,
    retryCount: 0,
    createdAt: new Date()
  })
}

// Process queue (called on interval)
async function processWebhookQueue() {
  while (webhookQueue.length > 0) {
    const job = webhookQueue.shift()!

    try {
      const body = interpolateTemplate(job.action.body, job.context)
      await fetch(job.action.url, {
        method: job.action.method,
        headers: { 'Content-Type': 'application/json', ...job.action.headers },
        body: JSON.stringify(body)
      })
    } catch (error) {
      if (job.retryCount < 3) {
        job.retryCount++
        webhookQueue.push(job) // Re-queue for retry
      } else {
        console.error(`Webhook failed after 3 retries: ${job.automationId}`, error)
      }
    }
  }
}
```

### Cycle Detection for Automations

```typescript
// Prevent infinite loops from chained automations
const executionContext = new Map<string, number>() // automationId -> execution depth

function executeWithCycleProtection(
  db: Database,
  automationId: string,
  action: AutomationAction,
  context: Record<string, unknown>,
  maxDepth = 10
) {
  const depth = executionContext.get(automationId) ?? 0

  if (depth >= maxDepth) {
    console.warn(`Automation cycle detected: ${automationId} at depth ${depth}`)
    return
  }

  executionContext.set(automationId, depth + 1)

  try {
    executeAction(db, action, context)
  } finally {
    executionContext.set(automationId, depth)
    if (depth === 0) executionContext.delete(automationId)
  }
}
```

## Delivery Phases

### Phase 1: Event Bus + Reactive Core (Foundation)

**Scope:**
- Event bus implementation with mutation emission
- Basic query subscription service (brute-force re-evaluation)
- Query membership automations (onEnter/onExit/onChange)
- Internal actions only (set_property, add/remove_supertag)

**Deliverables:**
1. `reactive/event-bus.ts` - Mutation event emitter
2. `reactive/types.ts` - All type definitions
3. `reactive/query-subscription.service.ts` - Live query subscriptions
4. `reactive/automation.service.ts` - Basic automation engine (no webhooks)
5. Wrapped mutation functions in `node.service.ts`
6. Tests for all new services

**Verification:**
- Unit tests for event bus pub/sub
- Unit tests for query subscription diffing
- Integration test: Create automation, mutate data, verify action executes
- Performance baseline: Measure latency with 50 subscriptions, 10k nodes

### Phase 2: Computed Fields + Threshold Automations

**Scope:**
- Computed field service (SUM, COUNT, AVG, MIN, MAX)
- Threshold triggers for automations
- Webhook action type with async queue
- Server function integration

**Deliverables:**
1. `reactive/computed-field.service.ts` - Aggregation engine
2. Schema changes for computed field and automation nodes
3. Webhook job queue (in-memory initially)
4. `reactive.server.ts` - Server functions
5. Tests for aggregations and threshold detection

**Verification:**
- Unit tests for each aggregation type
- Unit tests for threshold crossing detection (both directions)
- Integration test: Subscription tracker scenario from requirements
- Verify fireOnce behavior

### Phase 3: Smart Invalidation (Optimization)

**Scope:**
- Query dependency tracking (which fields affect which queries)
- Selective re-evaluation (only affected queries)
- Batching rapid mutations

**Deliverables:**
1. `reactive/dependency-tracker.ts` - Query→field mapping
2. Debounced/batched re-evaluation
3. Metrics for evaluation counts

**Verification:**
- Before/after comparison of evaluation counts
- Performance benchmarks with 100+ subscriptions

### Phase 4: Differential Dataflow (Scale)

**Scope:**
- Integrate d2ts or similar for incremental updates
- Sub-millisecond query updates at 300k+ nodes

**Deliverables:**
1. Differential dataflow integration
2. Migration path from brute-force

**Verification:**
- Benchmarks showing <1ms updates at 300k nodes
- No regression in correctness

## Verification Approach

### Unit Testing

Using Vitest (existing test setup in `packages/nxus-db`):

```typescript
// event-bus.test.ts
describe('EventBus', () => {
  it('emits events to all listeners', () => { ... })
  it('filters events by type', () => { ... })
  it('filters events by fieldSystemId', () => { ... })
  it('unsubscribe stops receiving events', () => { ... })
})

// query-subscription.test.ts
describe('QuerySubscriptionService', () => {
  it('detects added nodes', () => { ... })
  it('detects removed nodes', () => { ... })
  it('detects changed nodes', () => { ... })
  it('handles rapid mutations', () => { ... })
})

// computed-field.test.ts
describe('ComputedFieldService', () => {
  it('computes SUM correctly', () => { ... })
  it('computes COUNT correctly', () => { ... })
  it('recomputes on relevant mutation', () => { ... })
  it('ignores irrelevant mutations', () => { ... })
})

// automation.test.ts
describe('AutomationService', () => {
  it('fires onEnter when node matches query', () => { ... })
  it('fires onExit when node stops matching', () => { ... })
  it('fires threshold when crossing up', () => { ... })
  it('resets threshold when crossing down', () => { ... })
  it('respects fireOnce', () => { ... })
  it('detects cycles and stops', () => { ... })
})
```

### Integration Testing

```typescript
// subscription-tracker.integration.test.ts
describe('Subscription Tracker Scenario', () => {
  it('computes total expense and fires webhook on threshold', async () => {
    // 1. Create computed field: SUM of monthly_price for supertag:subscription
    const totalExpense = computedFieldService.create(db, {
      name: 'Total Monthly Expense',
      definition: {
        aggregation: 'SUM',
        query: {
          filters: [{ type: 'supertag', supertagSystemId: 'supertag:subscription' }],
          limit: 1000
        },
        fieldSystemId: 'field:monthly_price'
      }
    })

    // 2. Create threshold automation
    const budgetAlert = automationService.create(db, {
      name: 'Budget Alert',
      trigger: {
        type: 'threshold',
        computedFieldId: totalExpense,
        condition: { operator: 'gt', value: 100 },
        fireOnce: true
      },
      action: {
        type: 'webhook',
        url: 'https://mock.local/webhook',
        method: 'POST',
        body: { message: 'Budget exceeded: {{ computedField.value }}' }
      },
      enabled: true
    })

    // 3. Add subscriptions totaling $95
    createSubscription(db, 'Netflix', 15)
    createSubscription(db, 'Spotify', 10)
    createSubscription(db, 'Gym', 50)
    createSubscription(db, 'Cloud', 20)

    expect(computedFieldService.getValue(db, totalExpense)).toBe(95)
    expect(webhooksCalled).toBe(0)

    // 4. Add subscription pushing over $100
    createSubscription(db, 'VPN', 10)

    expect(computedFieldService.getValue(db, totalExpense)).toBe(105)
    expect(webhooksCalled).toBe(1)
    expect(lastWebhookBody.message).toBe('Budget exceeded: 105')

    // 5. Add more - should NOT re-fire (fireOnce)
    createSubscription(db, 'News', 5)

    expect(computedFieldService.getValue(db, totalExpense)).toBe(110)
    expect(webhooksCalled).toBe(1) // Still 1

    // 6. Remove subscriptions to drop below, then add back
    deleteSubscription(db, 'Gym')  // Now 60
    expect(webhooksCalled).toBe(1)

    createSubscription(db, 'Premium', 50)  // Now 110, crosses again
    expect(webhooksCalled).toBe(2) // Should fire again
  })
})
```

### Performance Benchmarks

```typescript
describe('Performance', () => {
  it('handles 50 concurrent subscriptions', async () => {
    // Setup: 10k nodes, 50 active subscriptions
    const start = performance.now()

    // Mutate a node
    setProperty(db, nodeId, 'field:status', 'active')

    const latency = performance.now() - start
    expect(latency).toBeLessThan(100) // Phase 1 target: <100ms
  })

  it('handles 300k nodes with smart invalidation', async () => {
    // Phase 3 target: same performance with 300k nodes
  })
})
```

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Event delivery: WebSocket vs SSE vs polling? | Phase 1: In-memory subscriptions (same process). Phase 2+: WebSocket for external consumers. |
| Automation execution: Sync vs async? | Internal actions: sync in same transaction. Webhooks: async job queue. |
| Cycle detection method? | Execution depth counter per automation ID, max depth 10. |
| Testing strategy? | In-memory SQLite databases for isolation, mocked webhooks. |
| Migration of saved queries? | Saved queries (`supertag:query`) can optionally become live via subscription. No migration needed. |

## Success Criteria

1. **Computed Fields**: Can define `SUM(subscription.monthlyPrice)` that updates instantly
2. **Live Queries**: Subscriptions receive add/remove/change events within 100ms
3. **State Automations**: `onEnter` fires instantly when node matches query
4. **Threshold Alerts**: Webhook fires exactly once when computed field crosses threshold
5. **Performance**: 50 subscriptions + 10k nodes = <100ms latency (Phase 1)
6. **Reliability**: Webhooks retry 3x, cycle detection prevents loops
7. **Testability**: All services testable in isolation with in-memory DB

## References

- Requirements: `.zenflow/tasks/reactive-at-the-backend-layer-1526/requirements.md`
- Architecture Discussion: `docs/archived/reactive-architecture-discussion.md`
- Query Evaluator: `packages/nxus-db/src/services/query-evaluator.service.ts`
- Node Service: `packages/nxus-db/src/services/node.service.ts`
- Query Types: `packages/nxus-db/src/types/query.ts`
