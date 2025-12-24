# Nxus - AI Development Guidelines

## Project Vision

**Nxus** is an application manager and productivity hub designed to centralize access to all your generated apps, tools, scripts, and repositories. It serves as a single point of control for managing, installing, opening, and organizing your development ecosystem.

### Core Objectives

1. **App Management**: Centralized gallery to browse, search, and manage all generated applications
2. **Quick Access**: One-click access to frequently used tools, scripts, and commands
3. **Multi-Machine Setup**: Streamlined installation and setup process across different machines
4. **Extensibility**: Support for various app types (HTML files, TypeScript apps, remote repos, scripts, etc.)

## Architecture Overview

### Monorepo Structure

- **nxus-core**: Main application (React + TanStack Router + Vite)
- **Future packages**: Additional tools, shared libraries, CLI utilities

### Technology Stack

#### Frontend

- **React 19**: UI framework
- **TanStack Router**: Type-safe routing with file-based routing
- **TailwindCSS v4**: Styling with modern CSS
- **shadcn/ui + Base UI**: Component library
- **Phosphor Icons**: Icon system

#### Type Safety & Validation

- **TypeScript 5.7+**: Strict mode enabled
- **Zod**: Runtime schema validation (parse, don't validate)
- **Type-safe APIs**: End-to-end type safety

#### Backend/Services

- **Vite**: Build tool and dev server
- **Node.js**: For script execution and file system operations
- **Future**: Tauri or Electron for desktop app capabilities

## App Configuration Schema

Apps are defined in a JSON registry with the following structure:

```typescript
{
  id: string;              // Unique identifier
  name: string;            // Display name
  description: string;     // App description
  type: AppType;           // 'html' | 'typescript' | 'remote-repo' | 'script-tool'
  path: string;            // Local path or remote URL
  homepage?: string;       // URL to homepage/preview
  installConfig?: {
    script: string;        // Installation script path
    platform: Platform[];  // ['windows', 'linux', 'macos']
    dependencies: string[];
  };
  metadata: {
    tags: string[];
    category: string;
    createdAt: string;
    updatedAt: string;
    version?: string;
  };
  status: 'installed' | 'not-installed' | 'available';
}
```

## Development Principles

### 1. Type Safety First

- Use TypeScript for all logic
- Define schemas with Zod for runtime validation
- Parse external data, don't assume validity
- Leverage discriminated unions for app types

### 2. Clear Code Flow

- Single Responsibility Principle
- Pure functions where possible
- Explicit error handling (Result types or explicit throws)
- Avoid implicit behavior

### 3. Functional Programming Patterns

- Immutable data structures
- Composition over inheritance
- Higher-order functions for reusability
- Avoid side effects in business logic

### 4. File Organization

```
packages/nxus-core/
├── src/
│   ├── types/           # TypeScript types and Zod schemas
│   ├── services/        # Business logic (app registry, installer, etc.)
│   ├── hooks/           # React hooks
│   ├── components/      # UI components
│   │   ├── ui/          # Base UI components
│   │   ├── app/         # App-specific components
│   │   └── layout/      # Layout components
│   ├── routes/          # TanStack Router routes
│   ├── lib/             # Utilities and helpers
│   └── data/            # App registry JSON
```

### 5. Component Design

- Small, focused components
- Props interfaces defined with TypeScript
- Use composition for flexibility
- Separate presentation from logic

### 6. State Management

- React hooks for local state
- TanStack Query for server state (future)
- Context for global app state (minimal usage)
- Zustand for complex state (if needed)

## Feature Roadmap

### Phase 1: Single HTML App Support (Current)

- [ ] App registry JSON structure
- [ ] Type-safe app configuration
- [ ] Gallery view with cards
- [ ] Search and filter functionality
- [ ] Open HTML files in browser/iframe
- [ ] App metadata display

### Phase 2: Installation & Scripts

- [ ] Script execution service
- [ ] Platform detection
- [ ] Install/uninstall workflows
- [ ] Progress tracking
- [ ] Error handling and rollback

### Phase 3: Multi-Type App Support

- [ ] TypeScript app integration
- [ ] Remote repository cloning
- [ ] Script tool management
- [ ] Custom app type plugins

### Phase 4: Advanced Features

- [ ] Command palette for quick actions
- [ ] Favorites and collections
- [ ] App templates
- [ ] Export/import configurations
- [ ] Multi-machine sync

## Coding Standards

### TypeScript

```typescript
// ✅ Good: Explicit types, parse don't validate
import { z } from 'zod';

const AppSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['html', 'typescript', 'remote-repo', 'script-tool']),
});

type App = z.infer<typeof AppSchema>;

function parseApp(data: unknown): App {
  return AppSchema.parse(data);
}

// ❌ Bad: Implicit any, no validation
function parseApp(data: any) {
  return data;
}
```

### Error Handling

```typescript
// ✅ Good: Explicit Result type
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

async function installApp(id: string): Promise<Result<void>> {
  try {
    // installation logic
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// ❌ Bad: Silent failures
async function installApp(id: string) {
  try {
    // installation logic
  } catch (error) {
    console.log(error); // Don't just log
  }
}
```

### React Components

```typescript
// ✅ Good: Clear props, typed, focused
interface AppCardProps {
  app: App;
  onOpen: (id: string) => void;
  onInstall: (id: string) => void;
}

export function AppCard({ app, onOpen, onInstall }: AppCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{app.name}</CardTitle>
      </CardHeader>
    </Card>
  );
}

// ❌ Bad: Unclear props, doing too much
export function AppCard(props: any) {
  // 200 lines of mixed logic and UI
}
```

## AI Assistant Guidelines

When working on Nxus, AI assistants should:

1. **Always validate inputs**: Use Zod schemas for any external data
2. **Maintain type safety**: Never use `any` without explicit justification
3. **Follow the architecture**: Respect the separation of concerns
4. **Action Dialog Pattern**: Clicking on app items should open an `AlertDialog` (Base UI) for actions. Avoid adding many buttons directly to the card.
5. **Server Functions**: Use TanStack Start's `createServerFn` for any local system operations (filesystem, git, shell commands).
6. **Base UI**: Always prioritize using Base UI components for interactive elements like dialogs, popovers, and menus.
7. **Document complex logic**: Add JSDoc comments for non-obvious code
8. **Consider edge cases**: Handle errors, empty states, loading states
9. **Keep it simple**: Don't over-engineer, start with the simplest solution
10. **Incremental development**: Build features step by step, test as you go
11. **State Management Service Pattern**: When implementing complex client-side state (especially if it involves persistence), usage of a **Service Facade** is required.
    - **Internal**: Use Zustand (or other libs) inside `services/` but DO NOT export the store directly.
    - **Public API**: Export _Hooks_ (e.g. `useAppCheck`) for reactive reads and a _Service Object_ (e.g. `appStateService`) for async actions.
    - **Async Actions**: Service actions should return `Promise<void>` to allow for future migration to async backends (e.g. Convex, DB) without breaking component contracts.
12. **Server Function Isolator Pattern**: To prevent Bundler Errors (like "Module `node:fs` has been externalized"):
    - **Boundary File**: The file exporting the `createServerFn` must NOT have any static Node.js imports (`child_process`, `fs`). It should only contain Zod Schemas and dynamic imports.
    - **Logic File**: Move all Node.js logic to a separate file (e.g., `installation-logic.ts`) marked with `"use server"`.
    - **Integration**: The boundary file should import the logic file dynamically: `const logic = await import('./logic')`.
    - **Result**: This allows the Client to import the Boundary File (for types/validation) without dragging in Node.js modules.

## Questions to Ask Before Implementing

1. Is this type-safe?
2. Have I validated external inputs?
3. Is the error handling explicit?
4. Is this component/function doing one thing well?
5. Can this be tested easily?
6. Is the code self-documenting?
7. Does this follow the established patterns?

## Resources

- [TanStack Router Docs](https://tanstack.com/router)
- [Zod Documentation](https://zod.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [shadcn/ui Components](https://ui.shadcn.com)
