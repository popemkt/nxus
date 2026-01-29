# d2ts Integration Research: Technical Design Document

## Executive Summary

This document presents the research findings for integrating [d2ts](https://github.com/electric-sql/d2ts) (Differential Dataflow in TypeScript) into the Nxus reactive query system. After thorough analysis, **we recommend deferring d2ts integration** and continuing with the current Phase 3 implementation (smart invalidation + batching) for the following reasons:

1. **Current performance is sufficient**: Phase 3 achieves 98.8% reduction in evaluations with smart invalidation
2. **d2ts is client-focused**: Designed primarily for client-side use with TanStack DB / ElectricSQL
3. **Architecture mismatch**: Requires fundamental restructuring of our query model
4. **Maturity concerns**: d2ts is still evolving (TanStack DB targeting 1.0 in late 2025)

**Recommendation**: **DEFER** - Revisit when:
- Node count exceeds 100k with noticeable performance degradation
- TanStack DB reaches 1.0 stable release
- Server-side patterns are better established in the ecosystem

---

## 1. What is d2ts?

d2ts is a TypeScript implementation of [differential dataflow](https://github.com/TimelyDataflow/differential-dataflow), a data-parallel programming framework enabling incremental computations over changing data.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Graph** | A D2 instance containing the computation pipeline |
| **Input** | Entry point for data into the graph |
| **MultiSet** | Data representation as `[value, multiplicity]` pairs where +1 = insert, -1 = delete |
| **Version** | Temporal ordering of data changes (timestamps) |
| **Frontier** | Lower bound on future versions, triggers computation |
| **Operators** | Composable transformations (map, filter, join, reduce, etc.) |

### Basic Usage Pattern

```typescript
import { D2, map, filter, reduce } from '@electric-sql/d2ts'

// 1. Create computation graph
const graph = new D2({ initialFrontier: 0 })
const input = graph.newInput<{ id: string; status: string; price: number }>()

// 2. Build pipeline with operators
const filtered = input.pipe(
  filter(item => item.status === 'active'),
  map(item => [item.id, item.price]),  // keyed
  reduce((acc, val) => acc + val, 0)   // sum by key
)

// 3. Finalize and run
graph.finalize()

// 4. Send incremental changes
input.sendData(1, [
  [{ id: '1', status: 'active', price: 10 }, 1],   // insert
  [{ id: '2', status: 'active', price: 20 }, 1],   // insert
])
input.sendFrontier(2)
graph.run()  // Output: sum = 30

// 5. Incremental update
input.sendData(2, [
  [{ id: '1', status: 'active', price: 10 }, -1],  // delete old
  [{ id: '1', status: 'done', price: 10 }, 1],     // insert new (no longer matches)
])
input.sendFrontier(3)
graph.run()  // Output: sum = 20 (only recomputed delta)
```

### Key Features

- **Sub-millisecond updates**: Recomputes only changed parts of results
- **Type-safe pipelines**: Full TypeScript inference through operator chains
- **SQLite persistence**: Optional backend for larger datasets
- **ElectricSQL integration**: Works with ShapeStreams for real-time sync

---

## 2. Current Architecture vs d2ts

### Current Implementation (Phase 3)

```
Mutation → Event Bus → Smart Invalidation → Full Re-evaluation → Diff → Callback
                              ↓
              Dependency Tracker (skip unaffected queries)
```

**Key characteristics:**
- Pull-based: Queries are re-evaluated from scratch when invalidated
- Set-based diffing: Compare old vs new result sets to find added/removed/changed
- Smart invalidation: Only affected subscriptions re-evaluate (98.8% reduction)
- Batching: Rapid mutations collected and processed together (95% reduction)

### d2ts Approach

```
Mutation → MultiSet Delta → d2ts Pipeline → Incremental Output → Callback
                                 ↓
              Operators maintain internal state (arrangements)
```

**Key characteristics:**
- Push-based: Changes flow through pre-built pipelines
- Delta-based: Only changes are propagated, not full datasets
- Stateful operators: Join/reduce operators maintain indexed state
- True incrementality: No re-evaluation, just delta computation

---

## 3. Mapping Our Query Types to d2ts

### Filter Types Analysis

| Filter Type | d2ts Mapping | Complexity |
|------------|--------------|------------|
| **Supertag** | `filter(n => n.supertag === target)` | Low |
| **Property** (eq/neq/gt/lt) | `filter(n => compare(n.props[field], value))` | Low |
| **Content** | `filter(n => n.content.includes(query))` | Low |
| **HasField** | `filter(n => field in n.props)` | Low |
| **Temporal** | `filter(n => n.createdAt > date)` | Low |
| **Relation** (childOf) | `filter(n => n.ownerId === target)` | Low |
| **Relation** (linksTo/linkedFrom) | `join()` with properties stream | **High** |
| **Logical** (AND) | Chain of `filter()` operators | Medium |
| **Logical** (OR) | `concat()` + `distinct()` | Medium |
| **Logical** (NOT) | Complex: requires anti-join pattern | **High** |
| **Supertag inheritance** | `join()` with inheritance graph | **High** |

### Aggregations (Computed Fields)

| Aggregation | d2ts Mapping | Notes |
|------------|--------------|-------|
| COUNT | `count()` | Native operator |
| SUM | `reduce((acc, v) => acc + v, 0)` | Native pattern |
| AVG | `reduce()` with count tracking | Requires custom |
| MIN/MAX | `reduce((acc, v) => Math.min/max(acc, v))` | Native pattern |

### Challenges Identified

1. **Supertag Inheritance**: Our system supports supertags that extend other supertags (e.g., #Task extends #Item). This requires a pre-computed inheritance graph that updates when supertags change.

2. **Backlinks (linkedFrom)**: Finding nodes that link TO a target requires indexing all property values - essentially a global join.

3. **NOT filters**: d2ts doesn't have a native anti-join. Implementing "NOT matching X" requires maintaining the full set and subtracting matches.

4. **Node Assembly**: Our `AssembledNode` type requires joining nodes with their properties and supertags - multiple joins per query.

---

## 4. Proposed d2ts Architecture

### Data Model for d2ts

```typescript
// Primary inputs to d2ts graph
interface NodeInput {
  id: string
  content: string
  ownerId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

interface PropertyInput {
  nodeId: string
  fieldSystemId: string
  value: unknown
}

interface SupertagAssignmentInput {
  nodeId: string
  supertagSystemId: string
}
```

### Pipeline Architecture

```typescript
// Master d2ts graph with all data streams
const graph = new D2({ initialFrontier: 0 })

// Primary inputs
const nodesInput = graph.newInput<NodeInput>()
const propertiesInput = graph.newInput<PropertyInput>()
const supertagsInput = graph.newInput<SupertagAssignmentInput>()

// Keyed streams for joins
const keyedNodes = nodesInput.pipe(
  filter(n => n.deletedAt === null),
  keyBy(n => n.id)
)

const keyedProperties = propertiesInput.pipe(
  keyBy(p => p.nodeId)
)

const keyedSupertags = supertagsInput.pipe(
  keyBy(s => s.nodeId)
)

// Example query: nodes with #task supertag
function createSupertagQuery(targetSystemId: string) {
  return supertagsInput.pipe(
    filter(s => s.supertagSystemId === targetSystemId),
    keyBy(s => s.nodeId),
    join(keyedNodes),
    // Output: [nodeId, [supertagAssignment, node]]
  )
}

// Example query: nodes with status = 'active'
function createPropertyQuery(fieldSystemId: string, value: unknown) {
  return propertiesInput.pipe(
    filter(p => p.fieldSystemId === fieldSystemId && p.value === value),
    keyBy(p => p.nodeId),
    join(keyedNodes),
    // Output: [nodeId, [property, node]]
  )
}
```

### Query Compilation

Each `QueryDefinition` would need to be compiled into a d2ts pipeline:

```typescript
function compileQueryToD2Pipeline(
  definition: QueryDefinition,
  graph: D2,
  inputs: { nodes: Input; properties: Input; supertags: Input }
): StreamBuilder {
  let pipeline: StreamBuilder

  // Start with all non-deleted nodes
  pipeline = inputs.nodes.pipe(filter(n => n.deletedAt === null))

  // Apply each filter
  for (const filter of definition.filters) {
    pipeline = applyFilter(pipeline, filter, inputs)
  }

  return pipeline
}

function applyFilter(
  pipeline: StreamBuilder,
  filter: QueryFilter,
  inputs: { nodes: Input; properties: Input; supertags: Input }
): StreamBuilder {
  switch (filter.type) {
    case 'supertag':
      // Join with supertags stream, filter by systemId
      return pipeline.pipe(
        keyBy(n => n.id),
        join(inputs.supertags.pipe(
          filter(s => s.supertagSystemId === filter.supertagSystemId),
          keyBy(s => s.nodeId)
        ))
      )

    case 'property':
      // Join with properties stream, filter by field and value
      return pipeline.pipe(
        keyBy(n => n.id),
        join(inputs.properties.pipe(
          filter(p => p.fieldSystemId === filter.fieldSystemId),
          filter(p => compareValue(p.value, filter.op, filter.value)),
          keyBy(p => p.nodeId)
        ))
      )

    case 'and':
      // Apply each sub-filter in sequence
      for (const subFilter of filter.filters) {
        pipeline = applyFilter(pipeline, subFilter, inputs)
      }
      return pipeline

    case 'or':
      // Union of sub-filter results
      const results = filter.filters.map(f =>
        applyFilter(pipeline, f, inputs)
      )
      return results.reduce((acc, r) => acc.pipe(concat(r))).pipe(distinct())

    // ... other filter types
  }
}
```

---

## 5. Migration Path

### Phase 1: Hybrid Architecture (Recommended Start)

Keep current architecture but add d2ts for specific high-performance queries:

```typescript
// New: D2tsQueryService for opt-in differential queries
class D2tsQueryService {
  private graph: D2
  private inputs: { nodes: Input; properties: Input; supertags: Input }
  private compiledQueries: Map<string, StreamBuilder>

  // Subscribe to a query using d2ts (for performance-critical queries)
  subscribeWithD2(
    definition: QueryDefinition,
    onResultChange: (event: QueryResultChangeEvent) => void
  ): SubscriptionHandle {
    const pipeline = compileQueryToD2Pipeline(definition, this.graph, this.inputs)
    // ... wire up output handler
  }

  // Feed mutations to d2ts
  handleMutation(event: MutationEvent): void {
    switch (event.type) {
      case 'node:created':
        this.inputs.nodes.sendData(version, [[nodeData, 1]])
        break
      case 'node:deleted':
        this.inputs.nodes.sendData(version, [[nodeData, -1]])
        break
      case 'property:set':
        // Delete old, insert new
        this.inputs.properties.sendData(version, [
          [oldProp, -1],
          [newProp, 1]
        ])
        break
      // ... other mutations
    }
    this.graph.run()
  }
}
```

### Phase 2: Full Migration (If Needed)

Replace `QuerySubscriptionService` entirely with d2ts-based implementation:

1. Load all nodes/properties/supertags into d2ts inputs on startup
2. Compile all active query subscriptions to d2ts pipelines
3. Route all mutations through d2ts
4. Remove brute-force re-evaluation code

### Migration Risks

| Risk | Mitigation |
|------|------------|
| Query semantics differ | Comprehensive test suite, side-by-side comparison |
| Performance regression | Benchmark before/after, feature flag for rollback |
| Memory usage increase | d2ts maintains state; monitor memory, use SQLite backend |
| Complexity increase | Start with subset of queries, expand gradually |

---

## 6. Performance Analysis

### Current Phase 3 Performance

From `performance-targets.test.ts` and `performance.bench.ts`:

| Metric | Value |
|--------|-------|
| 50 subscriptions + 1k nodes | All 500 evaluations (brute force baseline) |
| Smart invalidation skip ratio | 98.8% (6 evaluations vs 500) |
| Batching reduction | 95% (40 → 2 evaluations for 100 mutations) |
| Mutation latency | < 50ms for 100 subs + 5k nodes |

### Expected d2ts Performance

Based on TanStack DB benchmarks:

| Metric | Claimed Value |
|--------|---------------|
| Single row update in 100k collection | 0.7ms |
| Complex joins across multiple tables | < 1ms |

### When d2ts Provides Benefit

d2ts excels when:
1. **Large result sets change incrementally**: e.g., 10k matching nodes, 1 node changes
2. **Complex aggregations**: SUM/COUNT over thousands of records
3. **Multiple chained queries**: Computed fields → threshold checks → automations

d2ts overhead may hurt when:
1. **Small result sets**: Our smart invalidation already skips unaffected queries
2. **Simple filters**: The join overhead may exceed brute-force evaluation
3. **Rapidly changing filters**: Recompiling pipelines is expensive

### Estimated Crossover Point

Based on analysis, d2ts likely provides benefit when:
- Node count > 50k
- Average query result size > 1k nodes
- Complex aggregations across > 10k nodes

Our current target is 300k nodes. At that scale, d2ts would be beneficial, but Phase 3 optimizations may still be sufficient depending on query patterns.

---

## 7. Alternative Approaches

### Option A: Continue with Phase 3 (Recommended)

- **Pros**: Already implemented, well-tested, sufficient performance
- **Cons**: May hit limits at very large scale
- **When to revisit**: If mutation latency exceeds 100ms consistently

### Option B: d2ts Integration (Deferred)

- **Pros**: True incrementality, proven at scale (Materialize)
- **Cons**: Significant implementation effort, architecture changes
- **When to implement**: Node count > 100k with performance issues

### Option C: Materialite (Alternative to d2ts)

[Materialite](https://github.com/vlcn-io/materialite) is another JS differential dataflow library:

- **Pros**: Similar API, designed for client-side state
- **Cons**: Not production-ready ("not ready for public consumption"), join/reduce naive
- **Status**: Currently maintained in private repo as part of zerosync.dev

### Option D: Server-Side Materialize/DBSP

For ultimate scale, consider server-side incremental view maintenance:

- **Materialize**: Production-grade differential dataflow database
- **Epsio**: IVM extension for PostgreSQL
- **pg_ivm**: Open-source PostgreSQL IVM

These are overkill for single-user PKM but worth considering if scaling to multi-user.

---

## 8. Recommendation

### Decision: DEFER d2ts Integration

**Rationale:**

1. **Current performance is acceptable**: Phase 3 achieves 98.8% reduction in evaluations with smart invalidation. For 300k nodes with 100 subscriptions, estimated mutation latency is < 100ms.

2. **d2ts is client-focused**: The library and TanStack DB are designed for client-side reactive state with sync to backends. Server-side patterns are not well-established.

3. **Significant implementation effort**: Mapping our query types to d2ts pipelines requires:
   - Query compiler (QueryDefinition → d2ts pipeline)
   - Data loading (SQLite → d2ts inputs)
   - Mutation routing (event bus → d2ts)
   - Node assembly (joining multiple streams)

4. **Maturity concerns**: TanStack DB is targeting 1.0 in late 2025. The ecosystem is still evolving.

### Conditions to Revisit

1. **Performance degradation**: If mutation latency consistently exceeds 100ms with Phase 3 optimizations

2. **Scale increase**: If node count approaches 300k+ with complex queries

3. **TanStack DB 1.0**: When the ecosystem stabilizes with clear server-side patterns

4. **Computed field bottleneck**: If aggregations (SUM/COUNT) become the primary performance issue

### Immediate Actions

1. **Monitor performance metrics**: Use the `reactiveMetrics` module to track evaluation counts and latency in production

2. **Profile at scale**: Create benchmark with 100k+ nodes to identify actual bottlenecks

3. **Document query patterns**: Understand which queries are most expensive for targeted optimization

---

## 9. References

### d2ts / TanStack DB
- [d2ts GitHub Repository](https://github.com/electric-sql/d2ts)
- [TanStack DB Documentation](https://tanstack.com/db/latest/docs/overview)
- [TanStack DB 0.5 - Query-Driven Sync](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync)
- [ElectricSQL + TanStack DB Integration](https://electric-sql.com/blog/2025/07/29/local-first-sync-with-tanstack-db)

### Differential Dataflow Theory
- [Materialize - IVM Database Replica](https://materialize.com/blog/ivm-database-replica/)
- [DBSP: Automatic Incremental View Maintenance (Paper)](https://arxiv.org/abs/2203.16684)
- [Timely/Differential Dataflow](https://github.com/TimelyDataflow/differential-dataflow)

### Alternatives
- [Materialite - JS Differential Dataflow](https://github.com/vlcn-io/materialite)
- [pg_ivm - PostgreSQL IVM Extension](https://github.com/sraoss/pg_ivm)
- [Everything to Know About IVM](https://materializedview.io/p/everything-to-know-incremental-view-maintenance)

### Internal
- `docs/archived/reactive-architecture-discussion.md` - Original architecture exploration
- `.zenflow/tasks/reactive-at-the-backend-layer-1526/requirements.md` - Requirements analysis
- `.zenflow/tasks/reactive-at-the-backend-layer-1526/spec.md` - Technical specification
