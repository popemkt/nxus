# Item Status Architecture

## Overview

The **Item Status System** provides a generic way to check the "liveness" or "installation status" of any item in the registry (Tools, Apps, Repositories). It replaces the former "Tool Health" system.

## Core Concepts

1.  **Generic & Item-Agnostic**: Works for any item with a `checkCommand`.
2.  **Deduplicated Checks**: Multiple items can share the same `checkCommand`. The system executes the command once and updates all subscribers.
3.  **Reactive State**: Uses Zustand for global state management, automatically syncing with UI components.
4.  **Smart Caching**: Uses TanStack Query for caching, background refetching, and deduplication.

## Architecture

```mermaid
graph TD
    UI[UI Components] -->|useItemStatusCheck| HookLayer
    HookLayer -->|useItemStatusQuery| QueryLayer
    QueryLayer -->|checkItemStatus| ServerLayer
    ServerLayer -->|exec| System[System Shell]

    QueryLayer --syncs--> StateStore[Item Status Store (Zustand)]
    StateStore --updates--> UI
```

### 1. Server Layer (`services/apps/item-status.server.ts`)

Executes shell commands to verify item presence.

- `checkItemStatus`: Checks a single item.
- `batchCheckItemStatus`: Checks multiple items in parallel.
- Returns `ItemStatusResult`: `{ isInstalled: boolean, version?: string, error?: string }`

### 2. State Layer (`services/state/item-status-state.ts`)

A Zustand store that maintains the global status of all known items.

- **Persistence**: Saves statuses to `localStorage` with a TTL (default 5 mins).
- **Command Mapping**: Maps `checkCommand` -> `[itemId1, itemId2]` to enable shared updates.
- **Actions**: `updateItemStatus`, `registerItemCommand`, `updateStatusesByCommand`.

### 3. Hook Layer

- **`useItemStatusQuery`**: The low-level hook that integrates TanStack Query with the Zustand store. It handles the actual fetching and deduplication.
- **`useItemStatusCheck`**: The primary hook for UI components. Returns the current status from the store + loading state from the query.
- **`useBatchItemStatus`**: Used at app startup to check all configured items efficiently.

## Usage

### Checking a Single Item

```typescript
import { useItemStatusCheck } from '@/hooks/use-item-status-check'

function AppCard({ app }) {
  // Automatically checks status if not cached
  const status = useItemStatusCheck(app)

  if (status.isLoading) return <Spinner />
  if (status.isInstalled) return <Badge>Installed {status.version}</Badge>
  return <Button>Install</Button>
}
```

### Invalidation (e.g., after install)

```typescript
import { useInvalidateItemStatus } from '@/hooks/use-item-status-query';

function InstallButton({ app }) {
  const { invalidateByItemId } = useInvalidateItemStatus();

  const handleInstall = async () => {
    await installApp(app.id);
    // Triggers re-check for this item AND any others sharing the command
    invalidateByItemId(app.id);
  };
}
```

## Deduplication Logic

When an item is registered with a `checkCommand`:

1.  The store records the mapping: `checkCommand` -> `[itemId]`.
2.  `useItemStatusQuery` uses `checkCommand` as the Query Key.
3.  If two items (e.g., `claude-code` and `claude-code-glm`) use `claude --version`:
    - Only **one** network request/command execution happens.
    - The result is broadcast to **both** items in the Zustand store via `updateStatusesByCommand`.
