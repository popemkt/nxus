# Nxus Data Architecture

> **Status**: Implemented (Phase 5 - Dual SQLite with JSON Source)  
> **Last Updated**: 2026-01-09

## Overview

Nxus uses a **dual SQLite architecture** with JSON files as the git-committed source of truth:

- **Master Data** (apps, commands, tags, inbox): Individual JSON files → SQLite at runtime
- **Ephemeral Data** (installations, tool health): Separate SQLite (gitignored)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GIT-COMMITTED SOURCE OF TRUTH                     │
├─────────────────────────────────────────────────────────────────────────┤
│   src/data/                                                              │
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
           npm run db:seed    │    npm run db:export
           (JSON → SQLite)    ▼    (SQLite → JSON)
                              │
┌─────────────────────────────────────────────────────────────────────────┐
│                           RUNTIME (SQLite)                               │
├─────────────────────────────────────────────────────────────────────────┤
│   nxus.db (Master)                                                       │
│   ├── apps          ← App manifests                                      │
│   ├── commands      ← App commands (separate table for queries)          │
│   ├── tags          ← Hierarchical tag tree                              │
│   └── inbox_items   ← Backlog for add-item workflow                      │
│                                                                          │
│   ephemeral.db (Local-only, gitignored)                                  │
│   ├── installations ← Machine-specific installs                          │
│   └── tool_health   ← Cached health checks with TTL                      │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             CLIENT                                       │
├─────────────────────────────────────────────────────────────────────────┤
│   Server Functions (TanStack Start)                                      │
│   ├── getAllAppsServerFn()  ← Query apps from SQLite                     │
│   ├── Tag/Inbox CRUD        ← Server-side operations                     │
│   └── Shell operations      ← PTY, command execution                     │
│                                                                          │
│   Zustand Stores (Client)                                                │
│   ├── Tool health (localStorage with TTL)                                │
│   ├── Tool config (localStorage, API keys)                               │
│   └── UI state (ephemeral, not persisted)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Categories

| Category          | Source (Git)                    | Runtime (SQLite)      | Notes                        |
| ----------------- | ------------------------------- | --------------------- | ---------------------------- |
| **Apps**          | `src/data/apps/*/manifest.json` | nxus.db `apps`        | Upsert by ID                 |
| **Commands**      | Embedded in manifest.json       | nxus.db `commands`    | Separate table for queries   |
| **Tags**          | `src/data/tags.json`            | nxus.db `tags`        | Tag tree                     |
| **Inbox**         | `src/data/inbox.json`           | nxus.db `inbox_items` | Backlog                      |
| **Installations** | —                               | ephemeral.db          | Machine-specific, gitignored |
| **Tool Health**   | —                               | localStorage (TTL)    | Ephemeral cache              |
| **Tool Config**   | —                               | localStorage          | API keys, never cleared      |
| **UI State**      | —                               | Zustand (memory)      | Not persisted                |

## Key Files

### SQLite & Schemas

| File                         | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `src/db/schema.ts`           | Master schema (apps, commands, tags, inbox)   |
| `src/db/ephemeral-schema.ts` | Ephemeral schema (installations, tool_health) |
| `src/db/client.ts`           | Dual database initialization                  |

### Scripts

| Script                         | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `scripts/db-seed.ts`           | JSON → SQLite (upsert by ID)         |
| `scripts/db-export.ts`         | SQLite → JSON (individual manifests) |
| `scripts/migrate-manifests.ts` | One-time initial migration           |

### Server Functions

| File                                 | Purpose                         |
| ------------------------------------ | ------------------------------- |
| `src/services/apps/apps.server.ts`   | App/command queries from SQLite |
| `src/services/tag.server.ts`         | Tag CRUD operations             |
| `src/services/inbox/inbox.server.ts` | Inbox CRUD operations           |

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

### Read Path

```
UI Component → Zustand Store → (hydrated from Dexie/localStorage on boot)
```

### Write Path (Optimistic)

```
UI Action → Zustand (instant) → Dexie (persist) → Server Fn (SQLite, async)
                                                      ↓
                                            Mark as synced on success
```

## Implementation Status

| Phase                  | Status  | Description                             |
| ---------------------- | ------- | --------------------------------------- |
| 1. Client Cache        | ✅ Done | Dexie + Zustand for instant reads       |
| 2. Dependency System   | ✅ Done | Command dependencies with health checks |
| 3. localStorage Stores | ✅ Done | Tool health, config, installations      |
| 4. SQLite Backend      | ✅ Done | nxus.db with inbox_items + tags tables  |

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
