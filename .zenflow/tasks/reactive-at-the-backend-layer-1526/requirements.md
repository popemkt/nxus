# Requirements: Reactive Query System at the Backend Layer

## Overview

This document defines the requirements for implementing a reactive query system at the backend layer of Nxus, enabling Tana-like live queries and automations that work independently of the UI.

## Problem Statement

The current query system is **pull-based**: each query is evaluated from scratch on demand. This has limitations:

1. **No live queries**: UI must manually refresh to see changes
2. **No automations**: Cannot trigger actions when data matches a query
3. **Future API consumers** would need to poll for changes
4. **Inefficient**: Re-evaluating entire queries when only small data changes occur

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

### FR3: Automation System

- **FR3.1**: Define automation rules that trigger on query membership changes
- **FR3.2**: Automation triggers:
  - `onEnter`: Node newly matches a query
  - `onExit`: Node no longer matches a query
  - `onChange`: Node still matches but properties changed
- **FR3.3**: Automation actions:
  - Set property value
  - Add/remove supertag
  - Create related node
  - (Extensible for future actions)
- **FR3.4**: Automations execute server-side, not dependent on UI

### FR4: Query Persistence

- **FR4.1**: Live queries can persist across server restarts
- **FR4.2**: Saved queries (existing feature) can be upgraded to live queries
- **FR4.3**: Automation rules persist with their associated queries

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

## Recommended Approach

**Option A (Convex) or Option F (Event Bus + SQLite) with d2ts upgrade path**

### Decision Factors

| Factor | Convex | Event Bus + SQLite |
|--------|--------|-------------------|
| Time to working prototype | Faster (reactivity built-in) | Slower (build from scratch) |
| Migration effort | High (new storage layer) | Low (keep existing) |
| Long-term DX | Excellent (TypeScript functions) | Good (familiar stack) |
| Performance at 300k nodes | Proven | Needs optimization |
| Self-hosting | Supported | Already works |
| Automation support | Native (scheduler, cron) | Must build |

### If choosing Event Bus + SQLite:

**Phase 1: Event Bus + Brute Force**
- Mutation event emitter (create/update/delete)
- Query subscription registry
- Re-evaluate affected queries on change (brute force: all queries initially)
- Basic automation system

**Phase 2: Smart Invalidation**
- Map queries to their data dependencies (which attributes they touch)
- Only re-evaluate queries that could be affected by a change
- Result diffing (added/removed nodes)

**Phase 3: Differential Dataflow (if needed)**
- Adopt d2ts (TanStack DB's differential dataflow engine) for incremental updates
- Sub-millisecond query updates even at scale
- Same technique used by Materialize, proven at production scale

## API Design (Draft)

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

### Defining an Automation

```typescript
const automation = automationService.create({
  name: 'Mark completed items',
  query: {
    filters: [
      { type: 'supertag', supertagId: 'supertag:task' },
      { type: 'property', fieldId: 'field:status', operator: 'eq', value: 'done' }
    ]
  },
  triggers: {
    onEnter: async (node) => {
      await nodeService.setProperty(node.id, 'field:completed_at', Date.now());
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
```

## Open Questions for Technical Spec

1. **Event delivery**: WebSocket vs SSE vs polling for real-time updates?
2. **Automation execution**: Sync in transaction vs async job queue?
3. **Cycle detection**: How to handle automation chains that could loop?
4. **Testing strategy**: How to test reactive behavior deterministically?
5. **Migration**: How to upgrade existing saved queries to live queries?

## Success Criteria

1. Can create a live query that updates when matching data changes
2. Can define an automation that sets a property when a node enters a query
3. System handles 300k nodes without degradation
4. Automations work without UI being open
5. Architecture supports adding API endpoints for external consumers

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
