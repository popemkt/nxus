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

The project follows Nx conventions with `apps/` for runnable applications and `libs/` for shared libraries. Package manager is **pnpm** with workspace support.

#### Applications (`apps/`)
- **nxus-gateway** (`@nxus/gateway`): Landing page that lists all mini-apps. Runs at `:3001` on `/`. No database dependency. Acts as a **reverse proxy** to all mini-apps.
- **nxus-core** (`@nxus/core-app`): Main application with app management, command palette, settings. Runs at `:3000` with base path `/core/`.
- **nxus-workbench** (`@nxus/workbench-app`): Standalone workbench for node browsing and graph exploration. Runs at `:3002` with base path `/workbench/`.
- **nxus-calendar** (`@nxus/calendar-app`): Standalone calendar app with event management and Google Calendar sync. Runs at `:3003` with base path `/calendar/`.

#### Libraries (`libs/`)
- **nxus-ui** (`@nxus/ui`): Shared UI components (shadcn/ui, theme, utilities). No dependencies.
- **nxus-db** (`@nxus/db`): Database layer (SQLite schemas, node service, bootstrap). Depends on `@nxus/ui`.
- **nxus-workbench** (`@nxus/workbench`): Node management components and server functions. Depends on `@nxus/db`, `@nxus/ui`.
- **nxus-calendar** (`@nxus/calendar`): Calendar integration library. Depends on `@nxus/db`, `@nxus/ui`.

#### Legacy (`packages/`)
- **_commands**: CLI command definitions
- **repos**: Repository configurations

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

## Gateway Proxy Architecture (Critical)

The gateway (`nxus-gateway`) acts as a reverse proxy that routes requests to mini-apps based on URL prefix. This is the primary way users access the apps — through `http://localhost:3001/core/`, `/workbench/`, `/calendar/`.

### How It Works

The `miniAppProxy()` Vite plugin in `apps/nxus-gateway/vite.config.ts` intercepts HTTP and WebSocket requests:

| URL Prefix    | Proxied To           |
|---------------|----------------------|
| `/core/*`     | `localhost:3000`     |
| `/workbench/*`| `localhost:3002`     |
| `/calendar/*` | `localhost:3003`     |

WebSocket connections (for Vite HMR) are also proxied so that hot reload works through the gateway.

### Vite `base` Path — MUST Include Trailing Slash

Each mini-app's `vite.config.ts` sets a `base` path so all assets (JS, CSS, images, API calls) are correctly prefixed:

```typescript
// apps/nxus-core/vite.config.ts
base: '/core/',      // ✅ CORRECT — trailing slash required

// ❌ WRONG — breaks asset URLs
base: '/core',       // import.meta.env.BASE_URL becomes '/core' instead of '/core/'
                     // This causes '/corethumbnails/...' instead of '/core/thumbnails/...'
```

**Why**: Vite's `import.meta.env.BASE_URL` reflects the `base` value exactly. Without a trailing slash, string concatenation like `${BASE_URL}thumbnails/foo.svg` produces broken paths. This also breaks TanStack Start server function RPC calls when accessed through the gateway.

### CSS Dependencies

Each app that uses shadcn components imports `shadcn/tailwind.css` for Radix UI state variant styles. The `shadcn` package must be listed as a **direct dependency** in each app's `package.json` — it is NOT provided by `@nxus/ui`. The `@nxus/ui` library provides component code, but each app needs the CSS foundation independently.

### Running the Apps

```bash
# All apps together (recommended)
pnpm dev

# Individual apps
pnpm dev:gateway   # Port 3001 — proxy + landing page
pnpm dev:core      # Port 3000 — main app
pnpm dev:workbench # Port 3002
pnpm dev:calendar  # Port 3003

# Tests
pnpm test          # All tests
pnpm test:libs     # Library tests only (faster)
```

### Naming Convention

- Apps: `@nxus/{name}-app` (e.g., `@nxus/core-app`, `@nxus/workbench-app`)
- Libs: `@nxus/{name}` (e.g., `@nxus/ui`, `@nxus/db`)
- Gateway: `@nxus/gateway` (special — no `-app` suffix since it's the entry point)

## Tag Configuration System

### System Tags (`apps/nxus-core/src/lib/system-tags.ts`)

System tags are predefined tags with stable integer IDs. They are seeded during database initialization and used for specific functionality. Some system tags are marked `configurable: true` (e.g., `AI_PROVIDER` with id 14), meaning apps can have per-app configuration values for that tag.

### Tag Config Server Functions (`apps/nxus-core/src/services/tag-config.server.ts`)

- `getAllConfigurableTagsServerFn`: Returns all configurable tags. Combines tags from the `tagSchemas` DB table with system tags marked `configurable: true` (even if they don't have a saved schema yet). This ensures the UI shows configuration buttons for system tags even before anyone has defined a schema in the database.
- `setAppTagValuesServerFn`: Saves per-app config values, validated against the tag's schema.
- Tag schemas define typed fields (text, password, boolean, number, select) for configuration forms.

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
apps/
├── nxus-gateway/             # Gateway landing page (port 3001, basePath: /)
│   └── src/
│       ├── config/           # Mini-app manifest (mini-apps.ts)
│       ├── routes/           # TanStack Router routes
│       └── styles.css
├── nxus-core/                # Main application (port 3000, basePath: /core)
│   └── src/
│       ├── types/            # TypeScript types and Zod schemas
│       ├── services/         # Business logic, server functions
│       ├── hooks/            # React hooks
│       ├── components/       # UI components
│       ├── routes/           # TanStack Router routes
│       ├── lib/              # Utilities and helpers
│       └── data/             # App registry JSON
├── nxus-workbench/           # Workbench app (port 3002, basePath: /workbench)
│   └── src/
│       ├── routes/           # TanStack Router routes
│       └── styles.css
└── nxus-calendar/            # Calendar app (port 3003, basePath: /calendar)
    └── src/
        ├── routes/           # TanStack Router routes
        └── styles.css

libs/
├── nxus-ui/                  # Shared UI components
├── nxus-db/                  # Database layer
├── nxus-workbench/           # Node management library
└── nxus-calendar/            # Calendar integration
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

13. **Library Package Server Functions**: Server functions in library packages (`@nxus/*`) require extra care:
    - **Node.js-Only Libraries**: Libraries like `googleapis` that access Node.js APIs at module load time MUST use dynamic imports:
      ```typescript
      // BAD - causes "Cannot read property 'isTTY'" error in browser
      import { google } from 'googleapis'

      // GOOD - only loads when function is called (on server)
      async function getGoogleApis() {
        const { google } = await import('googleapis')
        return google
      }
      ```
    - **Entry Point Separation**: Keep Node.js-dependent exports out of the main client entry point. Use separate entry points like `@nxus/package/server`.
    - **TanStack Start API**: Use `.inputValidator()` NOT `.validator()` for server function validation schemas.
    - **Consider App-Level Server Functions**: For complex cases, consider keeping server function definitions in the app (`nxus-core`) rather than library packages. Libraries can export the business logic functions, and apps define the server function wrappers.

14. **CommonJS/ESM Interop in Vite + TanStack Start**: When using CommonJS packages in SSR environments, Vite handles modules differently between SSR and client. This causes "does not provide an export named 'default'" or "Named export 'X' not found" errors.

    **Step 1: Check the package.json of the problematic package:**
    ```bash
    cat node_modules/<package>/package.json | grep -E '"main"|"module"|"exports"'
    ```
    Look for `"module"` field - this is the ESM entry point.

    **Step 2: Add a Vite alias to force ESM resolution:**
    ```typescript
    // vite.config.ts
    export default defineConfig({
      resolve: {
        alias: {
          // Force packages to use their ESM entry points
          // Check package.json "module" field for the correct path
          rrule: 'rrule/dist/esm/index.js',
          'react-big-calendar': 'react-big-calendar/dist/react-big-calendar.esm.js',
        },
      },
    })
    ```

    **Step 3: Use named imports (NOT default imports):**
    ```typescript
    // CORRECT - use named imports that match ESM exports
    import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
    import { RRule, rrulestr } from 'rrule'

    // WRONG - default imports often don't exist in ESM
    import ReactBigCalendar from 'react-big-calendar'  // ❌
    ```

    **Step 4: For sub-modules without ESM (like addons), use fallback pattern:**
    ```typescript
    import withDragAndDropImport from 'react-big-calendar/lib/addons/dragAndDrop'
    const withDragAndDrop = (withDragAndDropImport as any).default ?? withDragAndDropImport
    ```

    **Why this works:** Vite uses different module resolution strategies for SSR vs client bundling. By forcing both to use the ESM entry point via aliases, you get consistent named exports everywhere.

## Common Pitfalls

These are issues that have been debugged and resolved. Future agents should be aware of them:

### 1. Assets 404 Through Gateway
**Symptom**: SVG thumbnails, images, or server function calls return 404 when accessed through `localhost:3001/core/...` but work on `localhost:3000/core/...`.
**Cause**: The `base` path in the app's `vite.config.ts` is missing a trailing slash (e.g., `'/core'` instead of `'/core/'`).
**Fix**: Always use trailing slash: `base: '/core/'`.

### 2. "Can't resolve 'shadcn/tailwind.css'"
**Symptom**: CSS error overlay appears in the app.
**Cause**: The `shadcn` package is not listed as a direct dependency in the app's `package.json`.
**Fix**: Add `"shadcn": "^3.6.2"` to the app's `dependencies`. This is needed independently per app, not provided transitively by `@nxus/ui`.

### 3. Tag Configuration Cog Icon Missing
**Symptom**: Tags marked as `configurable: true` in `system-tags.ts` don't show the configuration gear icon in the UI.
**Cause**: The `getAllConfigurableTagsServerFn` was only checking the `tagSchemas` DB table. If no schema has been explicitly saved for a system tag, it wouldn't appear as configurable.
**Fix**: The function now also includes system tags with `configurable: true` from `getAllSystemTags()`, using an empty schema as fallback.

### 4. Manifest `cwd` Paths
**Symptom**: Commands in manifest.json files fail because they reference old directory paths.
**Cause**: The project was restructured from `packages/` to `apps/`, but some manifest files still had old `cwd` or `command` paths.
**Fix**: Ensure all `"cwd"` and `"command"` fields in manifest JSON files under `src/data/apps/` reference `apps/nxus-core` (not `packages/nxus-core`).

### 5. CommonJS/ESM Module Errors
**Symptom**: "does not provide an export named 'default'" or "Named export 'X' not found" errors.
**Cause**: Vite handles modules differently between SSR and client. Some packages only have CJS entry points.
**Fix**: Add a Vite alias to force ESM resolution (see detailed section in Coding Standards above).

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
