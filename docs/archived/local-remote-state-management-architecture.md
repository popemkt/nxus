# State Management Architecture

## Current Strategy: Hybrid Singleton

We currently use a **Hybrid Singleton** approach to bridge the gap between our imperative service layer (Shell/Terminal) and our reactive UI layer (React).

### The Components

1.  **TanStack Query (Async State)**: Handles server state (e.g., "Is `claude` installed?"). It provides caching, deduplication, and background refetching.
2.  **Zustand (Client State)**: Handles transient client state (e.g., "Is the terminal open?", "What are the logs?").
3.  **The Bridge (Singleton QueryClient)**: A globally exported `queryClient` instance that allows services to invalidate caches without React Context.

### Why Singleton?

In a standard React web app, you would create `const queryClient = new QueryClient()` inside your root component to avoid ensuring state isolation between server requests (SSR).

However, **Nxus is a local-first desktop-style application**.

- We don't have multiple users sharing the same server process.
- We **do** have background services (like `commandExecutor`) that affect the world state (filesystem) outside of the React Tree.

By using a singleton `queryClient` defined in `lib/query-client.ts`, our non-React services can import it directly and trigger UI updates:

```typescript
// services/command-palette/executor.ts
import { queryClient } from '@/lib/query-client';

export const execute = async () => {
  // ... run command ...
  // "Hey UI, the world changed. Refresh the status!"
  await queryClient.invalidateQueries({ queryKey: ['item-status'] });
};
```

## Future Roadmap: Signal-Based Architecture

As the application grows, manually invalidating caches in services can become error-prone. We are exploring a transition to **Signals** to unify state and effect management.

### The Vision

Merging TanStack Query's caching power with the fine-grained reactivity of Signals (e.g., `@tanstack/react-query` v5+ integration or `@preact/signals-react`).

Instead of:

1.  Service runs command.
2.  Service calls `invalidateQueries`.
3.  Query refetches.
4.  Component re-renders.

We could have:

```typescript
// services/state/item-signals.ts
import { signal } from '@preact/signals-react';

export const itemStatus = signal<Status>('unknown');

// Service just updates the value
export const execute = async () => {
  itemStatus.value = 'checking';
  await runCommand();
  itemStatus.value = 'installed';
};
```

This would eliminate the need for the "Singleton Bridge" and make the data flow strictly unidirectional and reactive.
