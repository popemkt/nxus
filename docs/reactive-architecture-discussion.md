# Reactive Architecture Discussion

A conversation exploring reactive query systems, Datalog, and whether brute-force SQLite can scale for a Tana-like PKM.

---

## Context

Exploring options for building a personal knowledge management system with:

- Reactive/live queries (Tana/Notion-style)
- Automations that trigger on data changes
- Single-user (allows aggressive memory tradeoffs)

---

## Part 1: Node-Based System Scalability

### Current Architecture Assessment

The node-based approach (apps as discrete entities) is solid for an app manager because:

**Pros:**

- Simple mental model - each app is a discrete entity
- Easy to query, filter, sort
- JSON/SQLite handles thousands of entries easily
- Predictable CRUD operations

**Potential Limits:**

- Complex relationships (dependencies, workflows) get awkward in flat structures
- Heavy cross-referencing or graph traversals become expensive

**Verdict:** For Nxus's use case (managing apps, not knowledge), node-based scales fine.

---

## Part 2: How Others Do It

### Tana's Likely Architecture

Tana uses a **supertag + live search** model - attributed graph with dynamic inheritance and computed views.

Likely stack:

- **PostgreSQL core** (reliable, JSONB for flexibility)
- **Elasticsearch** for full-text and live search
- **WebSocket layer** for real-time
- **Client-side Datalog** (like Datascript) for offline queries
- Heavy caching and denormalization

They reportedly started with **Firebase**, then migrated when they hit query limitations (no joins, no graph traversals, cost at scale).

### Logseq's Architecture

Uses **Datascript** (in-memory Datalog for ClojureScript):

- Bidirectional links trivial
- Pattern matching queries
- Schema flexibility
- Trade-off: In-memory limits (loads everything into RAM)

### Notion's Approach

- **OT or CRDTs** for block editing
- **PostgreSQL** as source of truth
- **Denormalized caches** per-view
- **WebSocket subscriptions** per-block/page
- Automations run server-side on **job queue** (slightly laggy, not instant)

---

## Part 3: Reactive Queries - The Core Problem

Traditional DBs are **pull-based**: you ask, they answer.

For live tables and automations, you need **push-based evaluation**:

- "Notify me when any node with #project has status = done"
- "Auto-set date when I move something to #inbox"
- Live-updating tables reflecting query results

### How Push-Based Works

#### 1. Incremental View Maintenance

Track active queries, their dependencies, and only update affected queries on change.

#### 2. Differential Dataflow

Libraries like **Materialize** compute only the delta:

```
Query: SELECT * FROM nodes WHERE tag = 'project' AND status = 'done'

On INSERT node {tag: 'project', status: 'done'}:
  → Emit: [+1 row to result set]
  → Push to all subscribers
```

#### 3. Trigger System + Event Bus

```typescript
rules.on('node.updated', (event) => {
  if (event.changes.status === 'done' && node.hasTag('project')) {
    node.set('completedAt', Date.now());
  }
});
```

#### 4. Client-Side Reactive Queries (Datascript)

- All data in memory
- Queries re-evaluated on transaction
- React/Reagent re-renders affected components

---

## Part 4: TypeScript Reactive Options

### Reactive Query Libraries

| Library      | Description                                | Best For                |
| ------------ | ------------------------------------------ | ----------------------- |
| **TinyBase** | Reactive tables, indexes, listeners        | Local-first, simple     |
| **RxDB**     | Queries return Observables, real-time sync | PouchDB/IndexedDB apps  |
| **SignalDB** | MongoDB-like API with signals              | Signal-based frameworks |

### Sync + Reactive

| Library          | Description                                     | Best For               |
| ---------------- | ----------------------------------------------- | ---------------------- |
| **Replicache**   | Client-side cache with mutations, subscriptions | Linear/Figma-style     |
| **Triplit**      | Full-stack reactive DB, Datalog-inspired        | Real-time + offline    |
| **Electric SQL** | Postgres ↔ SQLite sync, reactive local queries | Existing Postgres apps |

### Lightweight Options

| Library                 | Description                     | Best For              |
| ----------------------- | ------------------------------- | --------------------- |
| **Zustand + subscribe** | Manual but simple               | Existing Zustand apps |
| **Valtio**              | Proxy-based, auto-tracks access | Simple reactivity     |
| **Jotai + atomFamily**  | Derived atoms are reactive      | Atom-based state      |
| **Datascript-js**       | Port of Datascript to JS        | Logseq-style queries  |

---

## Part 5: Recommended Stack for Single-User PKM

### Architecture

```
┌─────────────────────────────────────────┐
│           UI (React/Solid)              │
│              ↑ signals                  │
├─────────────────────────────────────────┤
│         Datascript (in-memory)          │
│         - All data loaded               │
│         - Datalog queries               │
│         - Instant reactivity            │
├─────────────────────────────────────────┤
│         SQLite (persistence)            │
│         - Write-through on tx           │
│         - Load on startup               │
└─────────────────────────────────────────┘
```

### Why This Works for Single-User

| Tradeoff              | Multi-user pain    | Single-user advantage  |
| --------------------- | ------------------ | ---------------------- |
| All data in memory    | Expensive at scale | 16-64GB RAM available  |
| No sync conflicts     | CRDT complexity    | Just you, no conflicts |
| SQLite persistence    | Scaling writes     | Single writer, trivial |
| Full graph in browser | Memory per user    | One user, load it all  |

### Memory Estimate

For ~100k nodes:

- Each node: ~500 bytes average
- Total: ~50MB in memory
- With indices: ~100-150MB

Totally fine. Logseq users run 500k+ block graphs in-browser.

### Implementation Sketch

```typescript
// 1. Schema
const schema = {
  'node/title': { ':db/cardinality': ':db.cardinality/one' },
  'node/parent': { ':db/valueType': ':db.type/ref' },
  'node/tags': {
    ':db/cardinality': ':db.cardinality/many',
    ':db/valueType': ':db.type/ref',
  },
  'node/props': { ':db/cardinality': ':db.cardinality/many' },
};

// 2. Reactive query hook
function useQuery<T>(query: string, inputs?: any[]): Signal<T[]> {
  const result = signal<T[]>([]);

  db.addTransactionListener(() => {
    result.value = d.q(query, db, ...(inputs || []));
  });

  return result;
}

// 3. Usage - Tana-style live query
const projectTasks = useQuery(`
  [:find ?title ?status
   :where 
   [?e :node/tags ?tag]
   [?tag :node/title "project"]
   [?e :node/title ?title]
   [?e :node/status ?status]]
`);

// 4. Automations - just listeners
db.addTransactionListener((tx) => {
  for (const datom of tx.txData) {
    if (datom.attribute === 'node/status' && datom.value === 'done') {
      d.transact(db, [
        { ':db/id': datom.entity, 'node/completedAt': Date.now() },
      ]);
    }
  }
});
```

### Incremental Query Updates

Don't re-run full queries. Datascript gives you `tx-data` (the diff):

```typescript
db.addTransactionListener((report) => {
  // report.txData = only what changed
  // report.dbBefore / report.dbAfter

  for (const [queryId, query] of activeQueries) {
    if (queryTouchesDatoms(query, report.txData)) {
      updateQueryResult(queryId);
    }
  }
});
```

---

## Part 6: Can Brute Force SQLite Scale?

### Current Stack: SQLite + Zustand + React

| Feature              | Current Effort       | Notes             |
| -------------------- | -------------------- | ----------------- |
| Basic CRUD           | Works                | Already there     |
| Filter/search        | Works                | Already there     |
| Live queries         | Manual subscriptions | Medium effort     |
| Bidirectional links  | JOINs                | Gets ugly fast    |
| Graph traversals     | Recursive CTEs       | Slow, complex     |
| Automations          | Manual triggers      | Lots of plumbing  |
| Supertag inheritance | Doable but hacky     | Schema gets messy |

### Brute Force Approach

```typescript
// Every mutation triggers full re-query
function updateNode(id, changes) {
  await db.update('nodes', id, changes);

  // Brute force: re-run ALL active queries
  for (const query of activeQueries) {
    const results = await db.execute(query.sql);
    query.setState(results);
  }
}
```

**Will it work?** Yes, for a while.

**When it breaks:**

- 10k+ nodes with 20+ live queries = noticeable lag
- Complex queries (joins, recursive) get slow
- Automation cascades = hell

### The Real Problem: Complexity, Not Performance

With SQLite you'll write:

- Manual subscription tracking
- Manual dependency graphs for queries
- Manual trigger systems for automations
- Manual denormalization for graph queries

With Datalog you get:

- Queries ARE subscriptions
- Dependencies are implicit
- Triggers are just queries that fire on patterns
- Graph traversals are native

### Verdict

**For ~10k nodes, single user, brute force works.**

```typescript
// Stupid simple, works up to 10-50k nodes
const useReactiveQuery = (sql: string, deps: any[]) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    const run = async () => setData(await db.execute(sql));
    run();
    return db.subscribe(() => run()); // re-run on ANY write
  }, deps);

  return data;
};
```

**But for Tana-level features** (live tables, chaining automations, supertag inheritance, backlinks), you'll spend more time fighting SQL than building features.

---

## Part 7: Recommendation

### Start Brute Force, Evolve When It Hurts

1. **Start brute force** - see where it actually hurts
2. If **query complexity** hurts → add Datascript as query layer, keep SQLite for persistence
3. If **reactivity plumbing** hurts → add TinyBase or RxDB
4. If **nothing hurts** → ship it

### Don't Rebuild Logseq

Logseq already has Datascript + SQLite persistence. But:

- It's ClojureScript (hard to extend in TS)
- UI/UX choices are fixed (outliner-first)
- Different model than Tana's supertags

**Alternative:** Use **datascript** (JS port), study Logseq's schema, design YOUR schema for Tana-style supertags, build YOUR UI in React/Solid.

---

## Resources

- [Datascript-js](https://github.com/tonsky/datascript) - Datalog for JS
- [TinyBase](https://tinybase.org/) - Reactive tables for TS
- [Replicache](https://replicache.dev/) - Sync + reactivity
- [Triplit](https://triplit.dev/) - Full-stack reactive DB
- [Electric SQL](https://electric-sql.com/) - Postgres ↔ SQLite sync
- [Logseq Codebase](packages/repos/logseq/) - Reference implementation

---

## Part 8: Semantic Relations (Tana-style)

### The Feature

Tana's meaningful relationships define **how** nodes are connected, not just **that** they're connected:

- `part_of`: Strict hierarchy (Engine part_of Car)
- `dependency_of`: Sequential tasks (Read before Essay)
- `references`: Generic links with backlinks
- `tagged_with`: Tag assignment

### COMPONENTS REC Operator

```
Project X
├── [part_of] Module A
│   ├── [part_of] Task 1
│   └── [part_of] Task 2
└── [part_of] Module B
    └── [part_of] Task 3
        └── [part_of] Subtask 3.1

Query: COMPONENTS REC(Project X)
Returns: [Module A, Task 1, Task 2, Module B, Task 3, Subtask 3.1]
```

### Why Graph DB Helps

| Operation                | SQL                 | SurrealDB                |
| ------------------------ | ------------------- | ------------------------ |
| Get 3 levels of children | Recursive CTE       | `->part_of*3->node`      |
| Backlinks                | Reverse JOIN        | `<-references<-node`     |
| Dependency chain         | Multiple self-joins | `->dependency_of*->node` |

### Implementation in SurrealDB

```sql
-- Components recursive
SELECT * FROM node<-part_of*10<-$project_x

-- Dependencies chain
SELECT * FROM $task->dependency_of*->node

-- Backlinks
SELECT * FROM node<-references<-$node_id
```

### Current Implementation

Files created:

- `packages/nxus-core/src/db/graph-client.ts` - SurrealDB connection and schema
- `packages/nxus-core/src/services/graph/graph.service.ts` - CRUD + semantic traversals
- `packages/nxus-core/src/services/graph/graph.server.ts` - Server functions

Feature flag in `packages/nxus-core/src/config/feature-flags.ts`:

```typescript
export type ArchitectureType = 'table' | 'node' | 'graph';
export const ARCHITECTURE_TYPE: ArchitectureType = 'node'; // Change to 'graph' to enable
```

### How to Enable Graph Architecture

**IMPORTANT:** The SurrealDB JS SDK requires a running SurrealDB server. It does NOT support embedded/in-memory mode directly from the client.

#### 1. Install SurrealDB

```bash
# macOS
brew install surrealdb/tap/surreal

# Linux/WSL
curl -sSf https://install.surrealdb.com | sh

# Windows (PowerShell)
iwr https://install.surrealdb.com -useb | iex
```

#### 2. Start the Server

In a separate terminal, run one of:

```bash
# In-memory (data lost on restart, good for dev)
surreal start --user root --pass root memory

# File-based persistence
surreal start --user root --pass root file:~/.popemkt/.nxus/graph.db

# Or with custom bind address
surreal start --user root --pass root --bind 0.0.0.0:8000 memory
```

#### 3. Enable Graph Architecture

In `packages/nxus-core/src/config/feature-flags.ts`:

```typescript
export const ARCHITECTURE_TYPE: ArchitectureType = 'graph';
```

#### 4. (Optional) Custom Connection

Set environment variables if not using defaults:

```bash
export SURREAL_URL=http://127.0.0.1:8000/rpc  # default
export SURREAL_NS=nxus                         # namespace
export SURREAL_DB=main                         # database
export SURREAL_USER=root                       # username
export SURREAL_PASS=root                       # password
```

#### Fallback

If you don't want to run SurrealDB, use `node` or `table` architecture:

```typescript
export const ARCHITECTURE_TYPE: ArchitectureType = 'node'; // Current default
```

### Relation Types Defined

```typescript
type RelationType =
  | 'part_of' // Hierarchical composition
  | 'dependency_of' // Sequential dependency
  | 'references' // Generic link (backlinks)
  | 'tagged_with' // Tag assignment
  | 'has_supertag' // Type assignment
  | 'extends'; // Supertag inheritance
```

### Live Query Subscriptions

```typescript
// Subscribe to components of a project
const unsubscribe = subscribeToComponents(projectId, (components) => {
  setProjectTasks(components);
});

// Subscribe to supertag changes
subscribeToSupertag('supertag:item', (action, node) => {
  if (action === 'CREATE') console.log('New item:', node);
});
```

---

## Open Questions

1. What specific Tana features are must-haves?
2. How many nodes realistically? (10k? 100k? 1M?)
3. Offline-first requirement?
4. Integration with Nxus app management or separate project?
5. SurrealDB embedded vs server mode for production?
