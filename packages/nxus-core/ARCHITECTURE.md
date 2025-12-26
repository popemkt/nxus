# Architecture

This document describes the architectural patterns and conventions used in the nxus-core package.

## Directory Structure

```
src/
├── lib/                  # Pure utilities (framework-agnostic, easily testable)
├── hooks/                # React state + lib composition
├── services/             # Zustand stores, server functions
├── components/           # React UI components
├── routes/               # TanStack Router route components
├── types/                # TypeScript type definitions
└── data/                 # Static data (app registry, etc.)
```

## Key Principles

### 1. Pure Functions in `lib/`

The `lib/` directory contains pure utility functions with **zero React dependencies**. These functions:

- Are easily unit-testable
- Have no side effects
- Can be reused across different contexts (hooks, server functions, tests)

**Example:** `lib/path-resolver.ts` contains `getOsDefaultWorkspacePath()` which takes OS info and returns a path string.

### 2. Hooks Compose Pure Functions

The `hooks/` directory contains React hooks that:

- Compose pure functions from `lib/` with React state
- Handle React-specific concerns (effects, state updates)
- Provide a clean API for components

**Example:** `hooks/use-install-path.ts` uses `getOsDefaultWorkspacePath()` from `lib/` and combines it with `useOsInfo()` and `useAppCheck()` state.

### 3. Services for External Concerns

The `services/` directory contains:

- **Zustand stores** (`app-state.ts`) for client-side state management
- **Server functions** (`*.server.ts`) for server-side operations

### 4. When to Add Complexity

Start with the simplest structure. Only add additional layers (e.g., `domain/`, `application/`) when:

- You have genuinely complex business logic that needs orchestration
- You're sharing logic across multiple platforms (React Native, CLI, etc.)
- Unit testing becomes difficult due to tight coupling

**Recommended approach:** Colocation over separation until you feel real pain.
