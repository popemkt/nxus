# Nxus vs Logseq DB: Node Architecture Comparison Report

> **Date:** January 2026  
> **Purpose:** Compare Nxus node-based architecture with Logseq's database version

---

## Executive Summary

| Aspect | Nxus | Logseq DB |
|--------|------|-----------|
| **Storage** | SQLite (better-sqlite3) | DataScript (in-memory) + SQLite persistence |
| **Query Layer** | Drizzle ORM (SQL) | Datalog |
| **Schema** | 2 tables (nodes + node_properties) | ~20 attributes per entity |
| **Node Model** | Everything is a node (Tana-like) | Blocks + Pages with typed attributes |
| **Best For** | Simplicity, large datasets | Complex relational queries |

---

## 1. Database Technology

### Nxus
- **Engine:** SQLite via `better-sqlite3`
- **ORM:** Drizzle ORM with TypeScript types
- **Persistence:** Immediate writes with WAL mode
- **Location:** `~/.popemkt/.nxus/` (ephemeral) + `packages/nxus-core/src/data/` (master)

### Logseq DB
- **Engine:** DataScript (Datalog in-memory database)
- **Persistence:** OPFS (browser), periodic export to SQLite (Electron)
- **Sync:** Real-Time Collaboration (RTC) system
- **Export:** Transit-encoded snapshots

---

## 2. Schema Architecture

### Nxus Schema (2 Tables)

```
nodes                    node_properties
├── id (UUID)           ├── id (auto-increment)
├── content             ├── node_id (FK)
├── content_plain       ├── field_node_id (FK → nodes.id)
├── system_id           ├── value (JSON string)
├── owner_id            ├── order
├── created_at          ├── created_at
├── updated_at          └── updated_at
└── deleted_at
```

**Key Design:**
- Fields are nodes themselves (self-referential)
- Supertags encoded as property values (`field:supertag` → node UUID)
- All values JSON-encoded in `value` column

### Logseq DataScript Schema

```clojure
{:block/name      {:db/index true}
 :block/uuid      {:db/unique :db.unique/identity}
 :block/tags      {:db/valueType :db.type/ref 
                   :db/cardinality :db.cardinality/many}
 :block/parent    {:db/valueType :db.type/ref}
 :block/page      {:db/valueType :db.type/ref}
 ;; ... 100+ built-in property idents
 }
```

**Key Design:**
- Attribute-centric schema with explicit types
- Cardinality annotations (`:one` vs `:many`)
- Native ref types with automatic backlink tracking

---

## 3. Type System & Supertags

### Nxus Supertags

```typescript
// Supertags are just nodes with special systemId
SYSTEM_SUPERTAGS = {
  ITEM: 'supertag:item',
  TOOL: 'supertag:tool',      // extends ITEM
  REPO: 'supertag:repo',      // extends ITEM
  TAG: 'supertag:tag',
  COMMAND: 'supertag:command',
}

// Fields are also nodes
SYSTEM_FIELDS = {
  SUPERTAG: 'field:supertag',
  EXTENDS: 'field:extends',
  TYPE: 'field:type',
  // ... ~30 field definitions
}
```

**Inheritance:** Walk `field:extends` chain with caching

### Logseq Classes

```clojure
;; Classes are db/idents with schema
:logseq.class/Page
:logseq.class/Journal
:logseq.class/Tag
:logseq.class/Property

;; Inheritance via attribute
:logseq.property.class/extends
```

**Inheritance:** Built into DataScript entity system

---

## 4. Query Patterns

### Nxus (SQL via Drizzle)

```typescript
// Direct lookup - O(1)
const node = db.select().from(nodes)
  .where(eq(nodes.systemId, systemId)).get()

// Property assembly - requires multiple queries
const props = db.select().from(nodeProperties)
  .where(eq(nodeProperties.nodeId, nodeId)).all()

// Supertag query - O(n) scan on value column
const withSupertag = db.select().from(nodeProperties)
  .where(eq(nodeProperties.fieldNodeId, supertagField.id))
  .all()
  .filter(p => JSON.parse(p.value) === targetId)
```

### Logseq (Datalog)

```clojure
;; Single declarative query
(d/q '[:find ?page ?title
       :where
       [?page :block/title ?title]
       [?page :block/tags ?tag]
       [?tag :db/ident :logseq.class/Page]]
     db)

;; Recursive ancestor query
[:find ?ancestor
 :in $ ?class
 :where
 (ancestor ?class ?ancestor)]
```

---

## 5. Performance Comparison

### Query Performance

| Operation | Nxus | Logseq |
|-----------|------|--------|
| Single node by ID | 🟢 O(1) B-tree | 🟢 O(1) index |
| Node by systemId | 🟢 O(1) cached | 🟢 O(1) `:db/ident` |
| All nodes with supertag | 🟡 O(n) value scan | 🟢 O(1) reverse index |
| Property assembly | 🔴 Multi-query + JSON parse | 🟢 Native entity |
| Backlinks query | 🟡 Index scan on `value` | 🟢 Native ref tracking |
| Complex relational | 🔴 Manual JOINs | 🟢 Single Datalog |
| Full-text search | 🟢 FTS5 native | 🟡 External |

### Memory Usage

| Scale | Nxus | Logseq |
|-------|------|--------|
| Base | ~1-5MB (SQLite engine) | ~20MB (DataScript + schema) |
| 1K nodes | ~2MB disk, minimal RAM | ~20-30MB RAM |
| 10K nodes | ~15MB disk, minimal RAM | ~100-200MB RAM |
| 100K nodes | ~100MB disk, minimal RAM | 🔴 ~1-2GB RAM |
| **Limit** | Millions of nodes | ~50-100K practical |

### Write Performance

| Operation | Nxus | Logseq |
|-----------|------|--------|
| Single write | ~1ms (WAL) | ~1ms (in-memory) |
| Batch write | Transaction batching | `d/transact!` batch |
| Persistence | 🟢 Immediate | 🟡 Periodic (30s) |
| Crash recovery | 🟢 WAL journal | 🔴 Potential loss |

---

## 6. Datalog Overview

### What is Datalog?

Datalog is a declarative logic programming language for querying databases, derived from Prolog. It excels at:
- **Recursive queries** (ancestors, graph traversal)
- **Pattern matching** across relationships
- **Implicit joins** without explicit JOIN syntax

### Query Structure

```clojure
[:find ?variables        ; What to return
 :in $ ?inputs           ; Parameters
 :where                  ; Conditions
 [?entity :attribute ?value]]  ; Triple patterns
```

### Example Queries

```clojure
;; Simple lookup
[:find ?page :where [?page :block/name "foo"]]

;; Implicit join
[:find ?page
 :where
 [?page :block/tags ?tag]
 [?tag :db/ident :logseq.class/Todo]]

;; Recursive (hard in SQL)
[(ancestor ?c ?a)
 [?c :extends ?a]]
[(ancestor ?c ?a)
 [?c :extends ?p]
 (ancestor ?p ?a)]
```

### DataScript Specifics

- **In-memory storage** - no disk I/O during queries
- **Immutable values** - time-travel, undo support
- **Entity API** - navigation via attributes
- **Reactive** - transaction listeners for UI updates

---

## 7. Tana Architecture Analysis

### Original: Firebase Era

```
Client (React) ←→ Firebase Firestore
                    ├── nodes collection
                    └── Real-time sync
```

**Problems:**
- Cost per read/write
- Cloud latency
- Limited offline
- No complex queries

### Current: Hybrid Architecture (Speculation)

```
┌─────────────────────────────────────────┐
│  Client Layer                            │
│  ├── Local IndexedDB / SQLite WASM      │
│  ├── In-memory cache                    │
│  └── Optimistic UI updates              │
└─────────────────────────────────────────┘
                    ↕ Sync
┌─────────────────────────────────────────┐
│  Backend                                 │
│  ├── PostgreSQL (main store)            │
│  └── WebSocket sync layer               │
└─────────────────────────────────────────┘
```

### Does Tana Use Datalog?

**Unlikely at storage layer, possibly for query DSL:**

| For Datalog | Against |
|-------------|---------|
| Node-as-everything fits EAV | Not Clojure stack |
| Fast pattern matching | Search seems traditional |
| Supertag inheritance | Simpler indexing likely |

---

## 8. Comparison Matrix

| Feature | Nxus | Tana | Logseq DB |
|---------|------|------|-----------|
| **Storage** | SQLite local | Cloud + local | DataScript + SQLite |
| **Query** | SQL/Drizzle | Proprietary | Datalog |
| **Node Model** | ✅ Everything | ✅ Everything | ⚠️ Blocks/Pages |
| **Supertags** | ✅ Properties | ✅ First-class | ✅ Classes |
| **Inheritance** | ✅ Extends chain | ✅ Native | ✅ Schema |
| **Sync** | Git-based | Real-time cloud | RTC/P2P |
| **Offline** | ✅ Full | ✅ Full | ✅ Full |
| **Scale** | 🟢 Millions | 🟡 Unknown | 🔴 ~100K |

---

## 9. Nxus Current Bottlenecks

### Identified Issues

1. **Supertag queries are O(n)**
   ```typescript
   // Scans all properties with supertag field
   .filter(p => JSON.parse(p.value) === targetId)
   ```

2. **Property assembly requires multiple queries**
   ```typescript
   // Get node → get all properties → parse JSON → resolve field names
   ```

3. **No native backlink tracking**
   - Must query `node_properties.value` as string

---

## 10. Recommendations

### Short-term Optimizations

1. **Denormalized supertag column**
   ```sql
   ALTER TABLE nodes ADD COLUMN supertag_ids TEXT;
   -- Store comma-separated or JSON array of supertag IDs
   ```

2. **Materialized inheritance table**
   ```sql
   CREATE TABLE supertag_ancestors (
     supertag_id TEXT,
     ancestor_id TEXT,
     depth INTEGER
   );
   ```

3. **FTS5 for content search**
   ```sql
   CREATE VIRTUAL TABLE nodes_fts USING fts5(content, content='nodes');
   ```

### Long-term Considerations

| Option | Pros | Cons |
|--------|------|------|
| **Keep SQLite** | Simple, scales well | Manual query complexity |
| **Add Datalog layer** | Expressive queries | Learning curve, overhead |
| **Hybrid** | Best of both | Complexity |

### Potential Libraries

- **datascript-js** - Datalog compiled to JS
- **Mentat** - Rust Datalog (WASM possible)
- **Custom DSL** - Compile to SQL

---

## Appendix: File References

### Nxus Files
- [node-schema.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/db/node-schema.ts) - Schema definitions
- [node.service.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts) - Core CRUD operations
- [nodes.server.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/nodes.server.ts) - Server functions
- [client.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/db/client.ts) - Database initialization

### Logseq Files (Reference)
- `deps/db/src/logseq/db.cljs` - Main DB namespace
- `deps/db/src/logseq/db/frontend/schema.cljs` - Schema definitions
- `deps/db/src/logseq/db/sqlite/build.cljs` - Graph builder
- `src/main/frontend/persist_db.cljs` - Persistence layer
