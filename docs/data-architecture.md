# Nxus Data Architecture

> **Status**: Implemented (Phase 4 - SQLite Backend)  
> **Last Updated**: 2026-01-04

## Overview

Nxus uses a **hybrid client-server architecture** with clear separation between persisted and ephemeral data.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
│                                                                          │
│  ┌───────────────┐     reads/writes     ┌────────────────────────────┐  │
│  │    React UI   │◄────────────────────►│   Zustand Stores           │  │
│  └───────────────┘                      │   ├─ Data Stores           │  │
│                                         │   │  (tags, cache, etc)    │  │
│                                         │   └─ UI Stores             │  │
│                                         │      (ephemeral state)     │  │
│                                         └──────────────┬─────────────┘  │
│                                                        │                 │
│              ┌─────────────────────────────────────────┼─────────────┐  │
│              │                                         │             │  │
│              ▼                                         ▼             │  │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐│  │
│  │    localStorage             │     │     IndexedDB (Dexie)       ││  │
│  │    • Theme                  │     │     "NxusDB" database       ││  │
│  │    • Tool health (TTL)      │     │     • galleryItems          ││  │
│  │    • Tool config            │     │     • commands              ││  │
│  │    • App installations      │     │     • tags                  ││  │
│  │    (via Zustand persist)    │     │     • installations         ││  │
│  └─────────────────────────────┘     └──────────────┬──────────────┘│  │
│                                                      │               │  │
└──────────────────────────────────────────────────────┼───────────────┘  │
                                                       │ Background Sync  │
                                                       ▼                  │
┌─────────────────────────────────────────────────────────────────────────┘
│                              SERVER
├──────────────────────────────────────────────────────────────────────────
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │     SQLite (nxus.db)                                                 │
│  │     via Drizzle ORM                                                  │
│  │     ├─ inbox_items  (backlog for add-item workflow)                 │
│  │     └─ tags         (hierarchical tag tree)                         │
│  └─────────────────────────────────────────────────────────────────────┘
│
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │     Server Functions (TanStack Start)                                │
│  │     ├─ Shell operations (command execution, PTY)                    │
│  │     ├─ File system (folder picker, read scripts)                    │
│  │     ├─ Dependency checks (which command)                            │
│  │     └─ CRUD operations (inbox, tags → SQLite)                       │
│  └─────────────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────
```

## Data Categories

| Category              | Client Storage | Server Storage | Pattern                             |
| --------------------- | -------------- | -------------- | ----------------------------------- |
| **Tags**              | Dexie          | SQLite         | Optimistic update → background sync |
| **Gallery Items**     | Dexie          | —              | Client cache only (seeded from TS)  |
| **Commands**          | Dexie          | —              | Client cache only (seeded from TS)  |
| **Inbox Items**       | —              | SQLite         | Server-only                         |
| **Tool Health**       | localStorage   | —              | Ephemeral with TTL                  |
| **Tool Config**       | localStorage   | —              | Persisted, never cleared            |
| **App Installations** | localStorage   | —              | Persisted, never cleared            |
| **Theme**             | localStorage   | —              | Simple preference                   |
| **UI State**          | Zustand only   | —              | Ephemeral, not persisted            |

## Key Files

### Dexie (IndexedDB)

| File                                       | Purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| `src/lib/db.ts`                            | Dexie schema, tables, version migrations |
| `src/stores/cache.store.ts`                | Zustand store reading from Dexie         |
| `src/services/cache/cache-sync.service.ts` | Initialize/seed Dexie on boot            |
| `src/stores/tag-data.store.ts`             | Tag data with Dexie + SQLite sync        |

### localStorage (Zustand persist)

| File                                      | Purpose            |
| ----------------------------------------- | ------------------ |
| `src/services/state/app-state.ts`         | App installations  |
| `src/services/state/item-status-state.ts` | Tool health cache  |
| `src/services/state/tool-config-state.ts` | Tool configuration |

### SQLite

| File                                 | Purpose                                |
| ------------------------------------ | -------------------------------------- |
| `src/db/client.ts`                   | SQLite init, table creation, save/load |
| `src/db/schema.ts`                   | Drizzle ORM schema definitions         |
| `src/services/tag.server.ts`         | Tag CRUD server functions              |
| `src/services/inbox/inbox.server.ts` | Inbox CRUD server functions            |

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
