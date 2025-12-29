# Nxus Data Architecture

> **Status**: Implemented (Phase 1 - Client Cache)  
> **Last Updated**: 2025-12-29

## Overview

Nxus uses a **hybrid client-server architecture** optimized for instant reads with server-side persistence.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
│  ┌───────────────┐      ┌──────────────────────────────────┐    │
│  │    React UI   │◀────▶│   Zustand Store (in-memory)      │    │
│  └───────────────┘      └──────────────┬───────────────────┘    │
│                                        │                         │
│                                        ▼                         │
│                         ┌──────────────────────────────────┐    │
│                         │     IndexedDB (Dexie)            │    │
│                         │   • Persistent cache             │    │
│                         │   • Survives refresh             │    │
│                         │   • Pending mutations queue      │    │
│                         └──────────────┬───────────────────┘    │
│                                        │                         │
└────────────────────────────────────────┼─────────────────────────┘
                                         │ Background Sync
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│                  ┌──────────────────────────────────────┐       │
│                  │     SQLite (Drizzle) - Future        │       │
│                  │   • Source of truth                  │       │
│                  │   • Complex queries (JOINs)          │       │
│                  │   • Server-only operations           │       │
│                  └──────────────────────────────────────┘       │
│                                                                  │
│                  ┌──────────────────────────────────────┐       │
│                  │     Server Functions                 │       │
│                  │   • Dependency checks (which cmd)    │       │
│                  │   • Command execution (shell)        │       │
│                  │   • File system operations           │       │
│                  └──────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Read Path (Instant)

```
UI Component → Zustand Store → (populated from Dexie on boot)
```

- UI never waits for network
- Zustand provides reactive updates
- Dexie provides persistence across refreshes

### Write Path (Optimistic)

```
UI Component → Zustand (instant) → Dexie (persist) → Server (async)
```

- Immediate UI feedback
- Background sync to server
- Retry on failure

## Data Categories

| Category              | Storage        | Purpose                   |
| --------------------- | -------------- | ------------------------- |
| **Gallery Items**     | Dexie → Server | Apps, dependencies, tools |
| **Commands**          | Dexie → Server | User-defined commands     |
| **Dependency Checks** | Dexie (cache)  | Cached `which` results    |
| **Installations**     | Dexie → Server | Machine-specific paths    |
| **UI State**          | Zustand only   | Ephemeral, not persisted  |

## Technology Choices

### Why Dexie (IndexedDB)?

- **Instant reads**: No network latency for UI
- **Persistence**: Survives browser refresh
- **TypeScript support**: Typed tables
- **Offline capable**: Works without server

### Why Zustand?

- **Already in project**: No new dependency
- **Reactive**: Components auto-update
- **Simple**: Minimal boilerplate

### Why Server Functions (not REST)?

- **Type-safe RPC**: End-to-end types
- **TanStack Start**: Native integration
- **Server-only code**: Shell access, file system

### Future: SQLite + Drizzle

When queries become complex (JOINs, aggregates), add:

- `better-sqlite3` for embedded SQLite
- `drizzle-orm` for typed queries
- Server becomes source of truth, Dexie becomes cache

## Sync Strategy

### Initial Load

1. Check Dexie for cached data
2. Render UI immediately (from cache)
3. Fetch latest from server in background
4. Merge updates into Dexie + Zustand

### Mutations

1. Write to Zustand (instant UI update)
2. Write to Dexie with `_syncStatus: 'pending'`
3. POST to server function
4. On success: Update `_syncStatus: 'synced'`
5. On failure: Keep in pending queue, retry later

### Conflict Resolution

Since Nxus is single-user (local machine), conflicts are rare.
Strategy: **Last-write-wins** with timestamp comparison.

## File Structure

```
src/
├── lib/
│   └── db.ts                    # Dexie database schema
├── services/
│   └── cache/
│       └── cache-sync.service.ts # Sync engine
├── hooks/
│   ├── use-cached-gallery.ts    # Reactive gallery access
│   └── use-cached-commands.ts   # Reactive commands access
└── stores/
    └── cache.store.ts           # Zustand store for cache
```

## Usage Examples

### Reading Cached Commands (Instant)

```typescript
import { useCachedCommands, searchCommands } from '@/hooks/use-cached-commands';

function CommandPalette() {
  const { commands, isLoading } = useCachedCommands();
  const filtered = searchCommands(commands, query);
  // UI renders instantly - no network wait
}
```

### Reading Cached Gallery Items

```typescript
import { useCachedGallery } from '@/hooks/use-cached-gallery';

function DependencyList() {
  const { dependencies } = useCachedGallery();
  // dependencies is reactive - auto-updates on changes
}
```

### Adding Items (Optimistic)

```typescript
import { addGalleryItem } from '@/services/cache/cache-sync.service';

// UI updates immediately, syncs to server in background
await addGalleryItem({
  id: 'my-tool',
  name: 'My Tool',
  type: 'dependency',
  tags: ['Dependency', 'cli'],
  // ...
});
```

## Implementation Phases

| Phase                | Status     | Description                             |
| -------------------- | ---------- | --------------------------------------- |
| 1. Client Cache      | ✅ Done    | Dexie + Zustand for instant reads       |
| 2. Dependency System | ✅ Done    | Command dependencies with health checks |
| 3. Background Sync   | 🔜 Next    | Sync pending mutations to server        |
| 4. SQLite Backend    | 📋 Planned | Server-side persistence with Drizzle    |
