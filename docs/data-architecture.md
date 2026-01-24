# Nxus Data Architecture

> **Status**: Implemented (Phase 6 - Package Separation with Node Architecture)
> **Last Updated**: 2026-01-24

## Overview

Nxus uses a **node-based architecture** with SQLite (master data) and SurrealDB (graph relationships). The database layer is extracted into the `@nxus/db` package for reuse across mini-apps.

See also: [Package Architecture](./package-architecture.md) for the overall package structure.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GIT-COMMITTED SOURCE OF TRUTH                     │
├─────────────────────────────────────────────────────────────────────────┤
│   nxus-core/src/data/                                                    │
│   ├── apps/                    Individual app folders                    │
│   │   ├── claude-code/                                                   │
│   │   │   ├── manifest.json   ← App manifest (commands, metadata)        │
│   │   │   └── *.md            ← Documentation files                      │
│   │   └── automaker/                                                     │
│   │       └── manifest.json   ← App manifest                             │
│   ├── tags.json               ← Tag tree                                 │
│   └── inbox.json              ← Backlog items                            │
└─────────────────────────────────────────────────────────────────────────┘
                              │
           pnpm db:seed       │    pnpm db:export
           (JSON → SQLite)    ▼    (SQLite → JSON)
                              │
┌─────────────────────────────────────────────────────────────────────────┐
│                       RUNTIME (Node-based SQLite)                        │
├─────────────────────────────────────────────────────────────────────────┤
│   @nxus/db (packages/nxus-db)                                            │
│   ├── nodes             ← All entities as nodes                          │
│   ├── nodeProperties    ← Properties as field-value pairs                │
│   └── System schema:                                                     │
│       ├── SYSTEM_SUPERTAGS: Item, Command, Tag, Field, Supertag          │
│       └── SYSTEM_FIELDS: path, icon, description, tags, etc.             │
│                                                                          │
│   ephemeral.db (Local-only, gitignored)                                  │
│   ├── installations ← Machine-specific installs                          │
│   └── tool_health   ← Cached health checks with TTL                      │
│                                                                          │
│   SurrealDB (Graph relationships)                                        │
│   └── Backlinks, references, inheritance                                 │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVER FUNCTIONS                                │
├─────────────────────────────────────────────────────────────────────────┤
│   @nxus/workbench/server                                                 │
│   ├── getNodeServerFn()          ← Query single node                     │
│   ├── getAllItemsFromNodesServerFn() ← Items with adapters               │
│   ├── searchNodesServerFn()      ← Full-text search                      │
│   └── nodeToItem(), nodeToTag()  ← Legacy adapters                       │
│                                                                          │
│   @nxus/db/server                                                        │
│   ├── createNode(), findNode()   ← Node CRUD                             │
│   ├── setProperty()              ← Property operations                   │
│   └── bootstrapSystemNodes()     ← System schema init                    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             CLIENT                                       │
├─────────────────────────────────────────────────────────────────────────┤
│   @nxus/workbench (React components)                                     │
│   ├── NodeWorkbenchRoute    ← Full node management UI                    │
│   ├── NodeBrowser           ← Grid/list of nodes                         │
│   ├── NodeInspector         ← Node detail view                           │
│   └── SupertagSidebar       ← Filter by supertag                         │
│                                                                          │
│   Zustand Stores (Client)                                                │
│   ├── Tool health (localStorage with TTL)                                │
│   ├── Tool config (localStorage, API keys)                               │
│   └── UI state (ephemeral, not persisted)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Categories

| Category          | Source (Git)                         | Runtime Storage          | Package             |
| ----------------- | ------------------------------------ | ------------------------ | ------------------- |
| **System Nodes**  | Auto-bootstrapped                    | nxus.db `nodes`          | `@nxus/db`          |
| **Apps**          | `src/data/apps/*/manifest.json`      | nxus.db `nodes`          | `@nxus/db`          |
| **Commands**      | Embedded in manifest.json            | nxus.db `nodes`          | `@nxus/db`          |
| **Tags**          | `src/data/tags.json`                 | nxus.db `nodes`          | `@nxus/db`          |
| **Node Props**    | Derived from manifests               | nxus.db `nodeProperties` | `@nxus/db`          |
| **Installations** | —                                    | ephemeral.db             | `@nxus/db`          |
| **Tool Health**   | —                                    | localStorage (TTL)       | nxus-core           |
| **Tool Config**   | —                                    | localStorage             | nxus-core           |
| **UI State**      | —                                    | Zustand (memory)         | nxus-core           |

## Package Structure

### @nxus/db (Database Layer)

| File                            | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `schemas/node-schema.ts`        | Node & property tables, system constants      |
| `schemas/ephemeral-schema.ts`   | Ephemeral schema (installations, tool_health) |
| `client/master-client.ts`       | Database initialization                       |
| `services/node.service.ts`      | Node CRUD operations                          |
| `services/bootstrap.ts`         | System schema bootstrap                       |
| `types/item.ts`, `command.ts`   | Legacy type definitions                       |

### @nxus/workbench (Node UI)

| File                            | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `server/nodes.server.ts`        | Node server functions                         |
| `server/adapters.ts`            | Node → Item/Tag/Command adapters              |
| `components/node-browser/`      | Node browsing UI                              |
| `components/node-inspector/`    | Node detail view                              |

### nxus-core (Main App)

| File                            | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `scripts/db-seed.ts`            | JSON → SQLite (bootstrap + seed)              |
| `scripts/db-export.ts`          | SQLite → JSON                                 |
| `services/apps/apps.server.ts`  | App-specific server functions                 |
| `routes/nodes.tsx`              | Mounts @nxus/workbench route                  |

## Type Safety at Data Boundary

> [!IMPORTANT]
> All data entering the application from SQLite MUST be validated and defaulted at the **parse layer**.
> This ensures downstream code never needs defensive null checks.

### The Problem

SQLite stores JSON as TEXT. Drizzle's `json()` column parses it, but:

- Returns `undefined` for null columns
- Returns raw parsed JSON without shape validation
- TypeScript trusts the type annotation, but runtime data may differ

```typescript
// ❌ BAD: Trusting database data without validation
const metadata: AppMetadata = record.metadata; // Could be null, {}, or malformed!
```

### The Solution

Validate and default at the **parse layer** (functions like `parseAppRecord`):

```typescript
// ✅ GOOD: Ensure shape at parse time
function parseAppRecord(record) {
  const rawMetadata = record.metadata as Partial<AppMetadata> | undefined;
  const metadata: AppMetadata = {
    tags: Array.isArray(rawMetadata?.tags) ? rawMetadata.tags : [],
    category: rawMetadata?.category ?? 'uncategorized',
    // ... other fields with defaults
  };
  return { ...app, metadata }; // Guaranteed shape
}
```

### Key Files for Data Boundary

| File             | Parse Function       | Ensures                                       |
| ---------------- | -------------------- | --------------------------------------------- |
| `apps.server.ts` | `parseAppRecord`     | `metadata.tags` is `[]`, `category` is string |
| `apps.server.ts` | `parseCommandRecord` | Command fields have proper defaults           |

### Rule

**Never add defensive checks downstream.** If you find yourself writing `app.metadata?.tags ?? []`,
the fix belongs in the parse layer, not in every consumer.

## Data Flow

### Read Path (Node Architecture)

```
UI Component
    ↓ query
@nxus/workbench Server Function
    ↓ calls
@nxus/db Node Service
    ↓ queries
SQLite (nodes + nodeProperties)
    ↓ assembles
AssembledNode
    ↓ adapts (optional)
Legacy Types (Item/Tag/Command)
    ↓ returns
UI Component
```

### Write Path

```
UI Action → Server Function → @nxus/db → SQLite
                                ↓
                       Invalidate React Query cache
```

### Bootstrap Flow

```
App Start
    ↓
First data query
    ↓
initDatabaseWithBootstrap() [@nxus/db]
    ↓
System nodes exist? ──No──→ bootstrapSystemNodes()
    ↓ Yes                           ↓
Query data                   Create supertags, fields
    ↓                               ↓
Return results              Query data
```

## Implementation Status

| Phase                      | Status  | Description                               |
| -------------------------- | ------- | ----------------------------------------- |
| 1. Client Cache            | ✅ Done | Dexie + Zustand for instant reads         |
| 2. Dependency System       | ✅ Done | Command dependencies with health checks   |
| 3. localStorage Stores     | ✅ Done | Tool health, config, installations        |
| 4. SQLite Backend          | ✅ Done | nxus.db with node-based architecture      |
| 5. Package Separation      | ✅ Done | @nxus/db, @nxus/ui, @nxus/workbench       |
| 6. Auto-bootstrap          | ✅ Done | System nodes created on first query       |

## Future Strategy: TanStack DB

To eliminate the complexity of manual sync layers (Dexie + Zustand + sync logic), the architecture will migrate to **TanStack DB** (currently in beta).

### Why

- **Merges Persistence & State**: Replaces both Dexie (disk) and Data Stores (memory) with a single reactive layer.
- **Automated Sync**: Handles optimistic updates, background sync, and conflict resolution automatically.
- **Backend Agnostic**: Integrates natively with our existing TanStack Start server functions and SQLite.

### Migration Plan (Phase 5)

1.  **Replace Data Stores**:
    - Delete `tag-data.store.ts`, `cache.store.ts`
    - Create TanStack DB `Collections` for `tags`, `apps`, `commands`
2.  **Update UI Components**:
    - Replace `useTagDataStore((s) => s.tags)` selectors
    - With `useQuery(tagCollection.getAll())`
3.  **Keep UI Stores**:
    - Retain lightweight Zustand stores for ephemeral UI state (`tag-ui.store.ts`, `sidebar.store.ts`)
    - These do not need persistence or sync.

### Architecture Shift

**From (Current):**

```
React UI -> Zustand Store (Memory) <-> Dexie (Disk) <-> [Manual Sync] <-> SQLite (Server)
```

**To (TanStack DB):**

```
React UI -> TanStack DB (Memory + Disk + Sync) <-> SQLite (Server)
```
