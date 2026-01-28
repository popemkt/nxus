# Requirements: Reactive Query System at the Backend Layer

## Overview

This document defines the requirements for implementing a reactive query system at the backend layer of Nxus, enabling Tana-like live queries and automations that work independently of the UI.

## Problem Statement

The current query system is **pull-based**: each query is evaluated from scratch on demand. This has limitations:

1. **No live queries**: UI must manually refresh to see changes
2. **No automations**: Cannot trigger actions when data matches a query
3. **Future API consumers** would need to poll for changes
4. **Inefficient**: Re-evaluating entire queries when only small data changes occur
5. **No computed fields**: Cannot define aggregations (SUM, COUNT) that update automatically

## Motivating Use Case

**Subscription Tracker Mini-App Example:**

A user builds a subscription tracking app within Nxus. They want:
1. Each subscription has a `monthlyPrice` property
2. A **computed field** shows `totalMonthlyExpense = SUM(all subscriptions' monthlyPrice)`
3. An **automation** fires when `totalMonthlyExpense > $100`:
   - Calls an external API to send a push notification to their phone
   - Only fires once when threshold is crossed (not repeatedly)

This mirrors how **Google Sheets-backed apps** work:
- Spreadsheet formulas provide reactive aggregations
- `onEdit()` triggers in Apps Script fire on data changes
- Conditional logic triggers external actions (emails, webhooks)

The key insight: **Google Sheets IS a reactive database** at small scale. We need similar capabilities at the backend layer.

## Goals

### Primary Goals

1. **Reactive query evaluation**: Queries automatically re-evaluate when underlying data changes
2. **Backend automations**: Trigger actions when nodes enter/exit a query's result set
3. **Scale target**: Support 300k+ nodes with many concurrent live queries (like Tana)
4. **API-ready**: Architecture should support future external API consumers subscribing to query changes

### Non-Goals (Phase 1)

- Client-side sync (e.g., Replicache, Electric SQL integration)
- Real-time collaborative editing
- Complex graph traversals (COMPONENTS REC, etc.) - filter queries are sufficient
- UI changes - focus is backend infrastructure

## Functional Requirements

### FR1: Live Query Subscriptions

- **FR1.1**: Backend can register a query definition and receive notifications when results change
- **FR1.2**: Notifications include what changed (added/removed nodes) not just "something changed"
- **FR1.3**: Multiple subscribers can listen to the same query
- **FR1.4**: Queries can be subscribed/unsubscribed dynamically

### FR2: Change Detection

- **FR2.1**: System detects when a node mutation could affect a query's results
- **FR2.2**: Only affected queries are re-evaluated (not all active queries)
- **FR2.3**: Changes tracked: node creation, deletion, property changes, supertag assignment

### FR3: Computed Fields / Aggregations

- **FR3.1**: Define computed fields that aggregate data from related nodes
- **FR3.2**: Supported aggregations:
  - `SUM`: Sum numeric property across nodes
  - `COUNT`: Count matching nodes
  - `AVG`: Average of numeric property
  - `MIN`/`MAX`: Minimum/maximum values
- **FR3.3**: Computed fields can be:
  - Attached to a parent node (e.g., "total expense" on a category)
  - Standalone (global aggregation)
- **FR3.4**: Computed fields update when underlying data changes

### FR4: Automation System

- **FR4.1**: Define automation rules that trigger on:
  - Query membership changes (node enters/exits result set)
  - Threshold conditions on computed fields (e.g., `totalExpense > 100`)
- **FR4.2**: Automation triggers:
  - `onEnter`: Node newly matches a query
  - `onExit`: Node no longer matches a query
  - `onChange`: Node still matches but properties changed
  - `onThresholdCrossed`: Computed field crosses a threshold (fires once per crossing)
- **FR4.3**: Automation actions:
  - Set property value
  - Add/remove supertag
  - Create related node
  - **Call external webhook/API** (for push notifications, etc.)
  - (Extensible for future actions)
- **FR4.4**: Automations execute server-side, not dependent on UI
- **FR4.5**: Automations track state to prevent duplicate firing (e.g., "already notified for this threshold")

### FR5: Query Persistence

- **FR5.1**: Live queries can persist across server restarts
- **FR5.2**: Saved queries (existing feature) can be upgraded to live queries
- **FR5.3**: Automation rules persist with their associated queries
- **FR5.4**: Automation state (e.g., "threshold already triggered") persists

## Non-Functional Requirements

### NFR1: Performance

- **NFR1.1**: Support 300k+ nodes in the system
- **NFR1.2**: Support 50+ concurrent live queries without significant degradation
- **NFR1.3**: Change propagation latency < 100ms for simple automations
- **NFR1.4**: Memory usage bounded and predictable

### NFR2: Correctness

- **NFR2.1**: Query results must be eventually consistent with data state
- **NFR2.2**: Automations must not create infinite loops (cycle detection)
- **NFR2.3**: No duplicate trigger invocations for same change

### NFR3: Developer Experience

- **NFR3.1**: TypeScript-first API with full type safety
- **NFR3.2**: Works with existing TanStack Start server functions
- **NFR3.3**: Testable in isolation without running full server
- **NFR3.4**: Observable/debuggable (can inspect active queries, pending automations)

### NFR4: Architecture

- **NFR4.1**: Backend-only - no UI framework dependencies
- **NFR4.2**: Storage-agnostic interface (can swap SQLite/SurrealDB/other)
- **NFR4.3**: Single-user optimized (can use aggressive memory caching)

## Technical Context

### Current Architecture

- **Storage**: SQLite + Drizzle ORM (node-based EAV model)
- **Query DSL**: Custom filter/sort/limit definitions (JSON-serializable)
- **API**: TanStack Start server functions
- **State**: Zustand (client), React Query (caching)

### Data Model

```
nodes: id, content, systemId, ownerId, timestamps
nodeProperties: nodeId, fieldNodeId, value (JSON), order
```

### Existing Query Types

- Supertag filter
- Property filters (eq, neq, gt, contains, etc.)
- Content search
- Relation filters
- Temporal filters
- Logical combinators (AND, OR, NOT)

## Architectural Options Analysis

Based on 2025-2026 research, here are the main approaches considered:

### Option A: Convex (Recommended for consideration)

**Approach**: Use [Convex](https://www.convex.dev/) as a reactive backend. Convex is an open-source reactive database where queries are TypeScript code that automatically re-run when dependencies change.

**Pros**:
- **Native reactivity**: Queries automatically re-run and push updates when data changes
- **TypeScript-first**: Write pure TypeScript, no SQL - logic lives in the database
- **Built-in automations**: Scheduler and cron jobs for durable function execution
- **ACID-compliant**: Serializable isolation, optimistic concurrency control
- **Self-hostable**: Can run on Neon, Fly.io, SQLite, Postgres, etc.
- **Efficient fan-out**: Only affected clients get updates

**Cons**:
- Requires migration from SQLite/Drizzle
- Different mental model (functions in DB vs external queries)
- Relatively newer ecosystem

**Reference**: [Convex](https://www.convex.dev/), [How Convex Works](https://stack.convex.dev/how-convex-works)

### Option B: TanStack DB + d2ts (Differential Dataflow)

**Approach**: Use [TanStack DB](https://tanstack.com/db/latest/docs) with its TypeScript differential dataflow engine (d2ts) for incremental query updates.

**Pros**:
- **Sub-millisecond updates**: Differential dataflow recomputes only changed parts
- **TanStack ecosystem**: Integrates with existing TanStack Start/Query stack
- **TypeScript-native**: d2ts is a TS implementation of differential dataflow
- **ElectricSQL compatible**: Can sync from Postgres via Electric
- **Proven performance**: 0.7ms to update one row in 100k-item collection

**Cons**:
- Currently client-focused (beta targeting 1.0 in late 2025)
- Requires ElectricSQL or similar for server sync
- Server-side automation support unclear

**References**: [TanStack DB](https://tanstack.com/db/latest/docs), [d2ts differential dataflow](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync)

### Option C: Triplit

**Approach**: Replace storage layer with [Triplit](https://www.triplit.dev/), which has built-in reactive queries and server-side support.

**Pros**:
- **Reactive by default**: Queries automatically update in real-time
- **TypeScript-first**: Schema in TypeScript, full type safety
- **Server + Client**: Runs on both, syncs via WebSocket
- **EAV-based internally**: Uses timestamped Triple Store (similar to current model)
- **Y Combinator backed**: Active development

**Cons**:
- Storage migration required
- Different query language
- Sync-focused (may be overkill for server-only reactivity)

**Reference**: [Triplit](https://www.triplit.dev/)

### Option D: Datascript/Datalog Layer

**Approach**: Use Datascript (in-memory Datalog) as the query/reactive layer, with SQLite as persistence.

**Pros**:
- Designed for exactly this use case
- Transaction listeners provide reactivity
- Graph queries natural in Datalog
- Battle-tested (Logseq, Roam)

**Cons**:
- All data must fit in memory (OK for single-user)
- Datalog learning curve
- JS port less mature than ClojureScript original
- Two query languages (existing DSL + Datalog)

**References**: [Datascript](https://github.com/tonsky/datascript), [Riffle Systems](https://riffle.systems/essays/prelude/)

### Option E: SurrealDB (existing)

**Approach**: Enable and complete the existing SurrealDB integration with its live query feature.

**Pros**:
- Already partially implemented
- Native live queries
- Graph queries built-in
- Single query language (SurrealQL)

**Cons**:
- Requires running separate server
- Less mature than SQLite
- Migration complexity
- Different mental model from EAV

### Option F: Custom Event Bus + SQLite (Incremental)

**Approach**: Keep SQLite, add mutation event bus with query subscription system.

**Pros**:
- Minimal changes to existing code
- Brute-force initially, optimize later
- Clear separation of concerns
- Can adopt d2ts for incremental updates later

**Cons**:
- Must build dependency tracking from scratch
- May hit performance limits at 300k nodes without differential dataflow

**References**: [pg_ivm](https://github.com/sraoss/pg_ivm), [DBSP paper](https://arxiv.org/abs/2203.16684)

## Tiered Automation Strategy

Not everything needs instant reactivity. Different use cases have different latency requirements:

| Type | Example | Latency Need | Recommended Solution |
|------|---------|--------------|---------------------|
| **State transitions** | "When status → done, set completedAt" | Instant (<100ms) | Event-driven reactive |
| **Derived/computed data** | "Calculate monthly total expense" | On-mutation | Reactive computed field |
| **Threshold alerts** | "Notify when total > $100" | Minutes OK | Cron job OR reactive |
| **External integrations** | "Sync to external API" | Minutes OK | Cron job + queue |
| **Chained automations** | "When X, do Y, which triggers Z" | Instant | Event-driven reactive |

### Design Decision: Hybrid Approach

1. **Reactive core** for state transitions and computed fields (instant)
2. **Cron-based checking** for threshold alerts (simpler, sufficient latency)
3. **Async job queue** for external API calls (reliability, retry logic)

This mirrors how production systems work:
- Google Sheets: `onEdit()` is reactive, but scheduled triggers exist for batch operations
- Notion: Automations are near-instant for internal actions, but external integrations have latency

## Recommended Approach

**Option F (Event Bus + SQLite) with computed fields and cron-based thresholds**

### Decision Factors

| Factor | Convex | Event Bus + SQLite |
|--------|--------|-------------------|
| Time to working prototype | Faster (reactivity built-in) | Slower (build from scratch) |
| Migration effort | High (new storage layer) | Low (keep existing) |
| Long-term DX | Excellent (TypeScript functions) | Good (familiar stack) |
| Performance at 300k nodes | Proven | Needs optimization |
| Self-hosting | Supported | Already works |
| Automation support | Native (scheduler, cron) | Must build |

### Implementation Phases

**Phase 1: Foundation - Event Bus + Computed Fields**
- Mutation event emitter (create/update/delete/property-change)
- Computed field definitions (SUM, COUNT, AVG, MIN, MAX)
- Computed fields re-evaluate on relevant mutations
- Basic automation system for state transitions (onEnter/onExit)

**Phase 2: Threshold Automations + External Actions**
- Cron-based threshold checking on computed fields
- Webhook/external API action type
- Automation state tracking (prevent duplicate triggers)
- Job queue for reliable external calls with retry

**Phase 3: Smart Invalidation (optimization)**
- Map queries/computed fields to their data dependencies
- Only re-evaluate affected computations on change
- Result diffing (added/removed nodes)

**Phase 4: Differential Dataflow (if needed at scale)**
- Adopt d2ts for incremental updates
- Sub-millisecond query updates even at 300k+ nodes
- Same technique used by Materialize, proven at production scale

## API Design (Draft)

### Defining a Computed Field

```typescript
// Define a computed field on a parent node (e.g., subscription category)
const totalExpense = computedFieldService.create({
  name: 'Total Monthly Expense',
  parentNodeId: 'category:subscriptions', // or null for global
  aggregation: {
    type: 'SUM',
    query: {
      filters: [
        { type: 'supertag', supertagId: 'supertag:subscription' }
      ]
    },
    field: 'field:monthly_price'
  }
});

// Computed field value updates automatically when subscriptions change
const value = await computedFieldService.getValue(totalExpense.id);
// => 127.50
```

### Subscribing to a Query

```typescript
// Server-side API
const subscription = queryService.subscribe({
  query: queryDefinition,
  onResultChange: (event) => {
    // event.added: AssembledNode[]
    // event.removed: AssembledNode[]
    // event.changed: AssembledNode[]
  }
});

// Later
subscription.unsubscribe();
```

### Defining Automations

```typescript
// Automation 1: State transition (instant, reactive)
const markCompleted = automationService.create({
  name: 'Mark completed items',
  trigger: {
    type: 'query_membership',
    query: {
      filters: [
        { type: 'supertag', supertagId: 'supertag:task' },
        { type: 'property', fieldId: 'field:status', operator: 'eq', value: 'done' }
      ]
    },
    event: 'onEnter'
  },
  action: {
    type: 'set_property',
    fieldId: 'field:completed_at',
    value: { $now: true } // special value for current timestamp
  }
});

// Automation 2: Threshold alert (cron-checked, external webhook)
const budgetAlert = automationService.create({
  name: 'Budget exceeded alert',
  trigger: {
    type: 'threshold',
    computedFieldId: totalExpense.id,
    condition: { operator: 'gt', value: 100 },
    fireOnce: true // only fire once per threshold crossing
  },
  action: {
    type: 'webhook',
    url: 'https://api.pushover.net/1/messages.json',
    method: 'POST',
    body: {
      token: '{{ env.PUSHOVER_TOKEN }}',
      user: '{{ env.PUSHOVER_USER }}',
      message: 'Monthly subscriptions exceeded $100! Current: ${{ computedField.value }}'
    }
  }
});
```

### Server Function Integration

```typescript
// Expose to future API consumers
export const subscribeToQueryServerFn = createServerFn()
  .input(z.object({ queryId: z.string() }))
  .handler(async ({ queryId }) => {
    // Returns subscription ID, actual events via WebSocket/SSE
  });

// Get computed field value
export const getComputedFieldServerFn = createServerFn()
  .input(z.object({ computedFieldId: z.string() }))
  .handler(async ({ computedFieldId }) => {
    return computedFieldService.getValue(computedFieldId);
  });
```

## Open Questions for Technical Spec

1. **Event delivery**: WebSocket vs SSE vs polling for real-time updates?
2. **Automation execution**: Sync in transaction vs async job queue?
3. **Cycle detection**: How to handle automation chains that could loop?
4. **Testing strategy**: How to test reactive behavior deterministically?
5. **Migration**: How to upgrade existing saved queries to live queries?

## Success Criteria

1. Can define a computed field (e.g., SUM of subscription prices) that updates on data change
2. Can create a live query that updates when matching data changes
3. Can define an automation that sets a property when a node enters a query (instant)
4. Can define a threshold automation that calls a webhook when computed field crosses threshold
5. System handles 300k nodes without degradation
6. Automations work without UI being open
7. Architecture supports adding API endpoints for external consumers

### Subscription Tracker Acceptance Test

Given: A "Subscriptions" mini-app with:
- Nodes with `supertag:subscription` and `field:monthly_price`
- A computed field `totalMonthlyExpense = SUM(monthly_price)`
- An automation: "When totalMonthlyExpense > 100, POST to webhook"

When: User adds subscriptions totaling $95, then adds a $10 subscription

Then:
- Computed field updates to $105
- Webhook is called exactly once with the notification
- Adding more subscriptions doesn't re-fire the alert (until it drops below and crosses again)

## References

### Reactive Database Solutions (2025-2026)
- [Convex - Reactive Backend](https://www.convex.dev/) - Open-source reactive database with TypeScript functions
- [TanStack DB](https://tanstack.com/db/latest/docs) - Reactive client store with differential dataflow
- [TanStack DB 0.5 - Query-Driven Sync](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync) - d2ts differential dataflow engine
- [ElectricSQL + TanStack DB](https://electric-sql.com/blog/2025/07/29/local-first-sync-with-tanstack-db) - Local-first sync stack
- [Triplit - Full-stack Reactive Database](https://www.triplit.dev/) - Syncing database with EAV triple store

### Foundational Technology
- [Materialize - Incremental View Maintenance](https://materialize.com/blog/ivm-database-replica/)
- [DBSP: Automatic Incremental View Maintenance](https://arxiv.org/abs/2203.16684) - Theoretical foundation
- [Riffle Systems - Reactive Relational Database](https://riffle.systems/essays/prelude/)
- [Datascript - Datalog for JS](https://github.com/tonsky/datascript)
- [pg_ivm - PostgreSQL IVM Extension](https://github.com/sraoss/pg_ivm)

### Internal Documentation
- `docs/archived/reactive-architecture-discussion.md` - Previous architecture exploration
