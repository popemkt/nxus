# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: e89c966b-c9d4-40f6-9763-0b2ef64809f4 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: bb54b532-5031-4911-9bda-bc0a8ebb31f8 -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: 9573bc3f-c495-419e-bf98-57470b9ce3de -->

Create a detailed implementation plan based on `{@artifacts_path}/spec.md`.

---

## Implementation Tasks

### Phase 0: Create @nxus/ui Package (Prevent Circular Dependencies)

> **Rationale**: Without extracting shared UI components first, nxus-workbench would need to depend on nxus-core for UI components while nxus-core depends on nxus-workbench for routes. This creates a circular dependency. Extracting @nxus/ui first establishes a clean dependency graph:
> ```
> nxus-core → nxus-workbench → nxus-db
>     ↓              ↓
>     └──────→ nxus-ui ←──────┘
> ```

#### [ ] Task 0.1: Generate nxus-ui Package Structure
Create the shared UI components package.

**Actions:**
1. Run: `nx g @nx/react:library nxus-ui --directory=packages/nxus-ui --bundler=vite --unitTestRunner=vitest --importPath=@nxus/ui`
2. Clean up generated boilerplate files
3. Create directory structure: `components/`, `lib/`, `hooks/`

**Verification:** `nx build nxus-ui` succeeds (empty package)

---

#### [ ] Task 0.2: Move Shared UI Components to @nxus/ui
Move shadcn/ui components and shared utilities.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `nxus-core/src/components/ui/` | `nxus-ui/src/components/` |
| `nxus-core/src/lib/utils.ts` | `nxus-ui/src/lib/utils.ts` |
| `nxus-core/src/hooks/use-mobile.tsx` | `nxus-ui/src/hooks/use-mobile.tsx` |

**Actions:**
1. Use `git mv` to preserve file history
2. Create `src/index.ts` barrel export for all UI components
3. Update internal imports within moved files

**Verification:** `nx build nxus-ui` succeeds

---

#### [ ] Task 0.3: Configure TypeScript Paths for @nxus/ui
Set up path alias for the new package.

**Actions:**
1. Update `tsconfig.base.json` to add path alias:
   ```json
   "@nxus/ui": ["packages/nxus-ui/src/index.ts"]
   ```
2. Verify Nx project.json configuration is correct

**Verification:** IDE recognizes `@nxus/ui` imports

---

#### [ ] Task 0.4: Update nxus-core to Use @nxus/ui
Replace local UI component imports with package imports.

**Actions:**
1. Add `"@nxus/ui": "workspace:*"` to nxus-core/package.json
2. Run `pnpm install`
3. Global find/replace in nxus-core:
   | Old Import | New Import |
   |------------|------------|
   | `from '@/components/ui/...'` | `from '@nxus/ui'` |
   | `from '@/lib/utils'` | `from '@nxus/ui'` |
4. Delete the now-empty `components/ui/` directory from nxus-core

**Verification:**
- `nx build nxus-core` succeeds
- App runs, all UI renders correctly

---

### Phase 1: Create @nxus/db Package (Foundation)

#### [ ] Task 1.1: Generate nxus-db Package Structure
Generate the Nx library and configure the package.

**Actions:**
1. Run: `nx g @nx/js:library nxus-db --directory=packages/nxus-db --bundler=tsc --unitTestRunner=vitest --importPath=@nxus/db`
2. Clean up generated boilerplate files
3. Create directory structure: `schemas/`, `services/`, `client/`, `types/`, `constants/`

**Verification:** `nx build nxus-db` succeeds (empty package)

---

#### [ ] Task 1.2: Move Schemas to @nxus/db
Move all database schema files to the new package.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `nxus-core/src/db/schema.ts` | `nxus-db/src/schemas/item-schema.ts` |
| `nxus-core/src/db/node-schema.ts` | `nxus-db/src/schemas/node-schema.ts` |
| `nxus-core/src/db/columns.ts` | `nxus-db/src/schemas/columns.ts` |

**Actions:**
1. Use `git mv` to move files with history preservation
2. Create `schemas/index.ts` barrel export
3. Fix internal import paths within moved files

**Verification:** `nx build nxus-db` succeeds

---

#### [ ] Task 1.3: Move Types to @nxus/db
Move shared type definitions to the new package.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `nxus-core/src/types/item.ts` | `nxus-db/src/types/item.ts` |
| `nxus-core/src/types/workflow.ts` | `nxus-db/src/types/workflow.ts` |
| `nxus-core/src/types/command.ts` | `nxus-db/src/types/command.ts` |
| `nxus-core/src/types/command-params.ts` | `nxus-db/src/types/command-params.ts` |

**Actions:**
1. Use `git mv` to move files with history preservation
2. Create `types/index.ts` barrel export
3. Fix internal import paths

**Verification:** `nx build nxus-db` succeeds

---

#### [ ] Task 1.4: Move Database Clients to @nxus/db
Move master DB and graph DB clients.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `nxus-core/src/db/client.ts` | `nxus-db/src/client/master-client.ts` |
| `nxus-core/src/db/graph-client.ts` | `nxus-db/src/client/graph-client.ts` |

**Actions:**
1. Use `git mv` to move files with history preservation
2. Update imports to use local schema paths
3. Create `client/index.ts` barrel export

**Verification:** `nx build nxus-db` succeeds

---

#### [ ] Task 1.5: Move Node Service to @nxus/db
Move the core node service.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `nxus-core/src/services/nodes/node.service.ts` | `nxus-db/src/services/node.service.ts` |

**Actions:**
1. Use `git mv` to move file with history preservation
2. Update imports to use local paths
3. Create `services/index.ts` barrel export

**Verification:** `nx build nxus-db` succeeds

---

#### [ ] Task 1.6: Create Ephemeral DB Factory
Create helper for mini-apps to create their own ephemeral databases.

**Actions:**
1. Create `client/ephemeral-factory.ts` with:
   - `EphemeralDbConfig` interface
   - `createEphemeralDb<T>()` factory function
2. Export from client barrel

**Verification:** `nx build nxus-db` succeeds

---

#### [ ] Task 1.7: Create Constants Module
Move system constants to @nxus/db.

**Actions:**
1. Create `constants/system.ts` with SYSTEM_SUPERTAGS, SYSTEM_FIELDS
2. Move any constants from node-schema.ts or node.service.ts
3. Create `constants/index.ts` barrel export

**Verification:** `nx build nxus-db` succeeds

---

#### [ ] Task 1.8: Create Public API (index.ts)
Create the main barrel export for @nxus/db.

**Actions:**
1. Create `src/index.ts` exporting:
   - All schemas
   - All types
   - NodeService
   - Database clients (initDatabase, getDatabase, initGraph, getGraph)
   - createEphemeralDb factory
   - System constants
2. Verify all exports are correct

**Verification:**
- `nx build nxus-db` succeeds
- Check dist output has all expected exports

---

#### [ ] Task 1.9: Configure TypeScript Paths
Update root tsconfig for @nxus/db alias.

**Actions:**
1. Update `tsconfig.base.json` to add path alias:
   ```json
   "@nxus/db": ["packages/nxus-db/src/index.ts"]
   ```
2. Verify Nx project.json configuration is correct

**Verification:** IDE recognizes `@nxus/db` imports

---

### Phase 2: Integrate @nxus/db into nxus-core

#### [ ] Task 2.1: Add @nxus/db Dependency to nxus-core
Wire up the new package.

**Actions:**
1. Add `"@nxus/db": "workspace:*"` to nxus-core/package.json
2. Run `pnpm install`

**Verification:** No install errors

---

#### [ ] Task 2.2: Update Import Paths in nxus-core Services
Replace old imports with @nxus/db imports.

**Files to update:**
- `services/apps/apps.server.ts`
- `services/apps/apps-mutations.server.ts`
- `services/tag.server.ts`
- Any other files importing from moved locations

**Import replacements:**
| Old | New |
|-----|-----|
| `from '../../db/schema'` | `from '@nxus/db'` |
| `from '../../db/node-schema'` | `from '@nxus/db'` |
| `from '../../types/item'` | `from '@nxus/db'` |
| `from '../../services/nodes/node.service'` | `from '@nxus/db'` |
| `from '../../db/client'` | `from '@nxus/db'` |

**Verification:** `nx build nxus-core` succeeds

---

#### [ ] Task 2.3: Rename Ephemeral DB to ephemeral-items
Clarify that this ephemeral DB is app-specific.

**Actions:**
1. Create `db/ephemeral-items/` directory
2. Move/rename ephemeral.ts → ephemeral-items/schema.ts
3. Create ephemeral-items/client.ts if needed
4. Update all imports referencing ephemeral schema

**Verification:** `nx build nxus-core` succeeds

---

#### [ ] Task 2.4: Delete Moved Files from nxus-core
Clean up after successful migration.

**Files to delete:**
- `db/schema.ts`
- `db/node-schema.ts`
- `db/columns.ts`
- `db/client.ts` (but keep ephemeral-items)
- `db/graph-client.ts`
- `types/item.ts`
- `types/workflow.ts`
- `types/command.ts`
- `types/command-params.ts`
- `services/nodes/node.service.ts`

**Verification:**
- `nx build nxus-core` succeeds
- App runs, / route works

---

### Phase 3: Create @nxus/workbench Package

#### [ ] Task 3.1: Generate nxus-workbench Package Structure
Generate the Nx library for the workbench UI.

**Actions:**
1. Run: `nx g @nx/react:library nxus-workbench --directory=packages/nxus-workbench --bundler=vite --unitTestRunner=vitest --importPath=@nxus/workbench`
2. Clean up generated boilerplate
3. Create directory structure: `components/`, `components/shared/`, `server/`, `hooks/`
4. Add dependencies: `@nxus/db` and `@nxus/ui` (NOT peer dependency on nxus-core)

**Verification:** `nx build nxus-workbench` succeeds (empty package)

---

#### [ ] Task 3.2: Move Node Components to @nxus/workbench
Move all node-related UI components.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `components/features/nodes/node-browser/` | `nxus-workbench/src/components/NodeBrowser.tsx` |
| `components/features/nodes/node-inspector/` | `nxus-workbench/src/components/NodeInspector.tsx` |
| `components/features/nodes/supertag-sidebar/` | `nxus-workbench/src/components/SupertagSidebar.tsx` |
| `components/features/nodes/shared/` | `nxus-workbench/src/components/shared/` |

**Actions:**
1. Use `git mv` to move directories/files with history preservation
2. Update imports to use `@nxus/db` for database operations
3. Update imports to use `@nxus/ui` for UI components (NOT cross-package source imports)

**Verification:** `nx build nxus-workbench` succeeds

---

#### [ ] Task 3.3: Move Node Server Functions to @nxus/workbench
Move server functions for node operations.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| `services/nodes/nodes.server.ts` | `nxus-workbench/src/server/nodes.server.ts` |
| `services/nodes/search-nodes.server.ts` | `nxus-workbench/src/server/search-nodes.server.ts` |

**Actions:**
1. Use `git mv` to move files with history preservation
2. Update imports to use @nxus/db for database operations
3. Create `server/index.ts` barrel export

**Verification:** `nx build nxus-workbench` succeeds

---

#### [ ] Task 3.4: Move Node Hooks to @nxus/workbench
Move workbench-specific React hooks.

**Files to move (using `git mv` for history preservation):**
| Source | Destination |
|--------|-------------|
| Related node hooks in `hooks/` | `nxus-workbench/src/hooks/` |

**Actions:**
1. Identify node-specific hooks
2. Use `git mv` to move with history preservation
3. Update imports to use @nxus/db and @nxus/ui
4. Create `hooks/index.ts` barrel export

**Verification:** `nx build nxus-workbench` succeeds

---

#### [ ] Task 3.5: Create NodeWorkbenchRoute Export
Create the main route component export.

**Actions:**
1. Create `src/route.tsx` that composes NodeBrowser, NodeInspector, SupertagSidebar
2. Export as `NodeWorkbenchRoute`
3. Include any necessary context providers

**Verification:** `nx build nxus-workbench` succeeds

---

#### [ ] Task 3.6: Create Public API (index.ts)
Create the main barrel export for @nxus/workbench.

**Actions:**
1. Create `src/index.ts` exporting:
   - `NodeWorkbenchRoute`
   - Server functions
   - Individual components (optional, for customization)
2. Verify all exports are correct

**Verification:** `nx build nxus-workbench` succeeds

---

#### [ ] Task 3.7: Configure TypeScript Paths for @nxus/workbench
Update configuration for proper resolution.

**Actions:**
1. Update `tsconfig.base.json` to add:
   ```json
   "@nxus/workbench": ["packages/nxus-workbench/src/index.ts"]
   ```
2. Ensure nxus-workbench imports UI components via `@nxus/ui` (NOT cross-package source imports)

> **Note**: Avoid using relative paths to other packages' source files (e.g., `../nxus-core/src/...`). This is an anti-pattern in Nx. All cross-package imports should go through the public API barrel exports.

**Verification:** IDE recognizes imports correctly, no cross-package source imports exist

---

### Phase 4: Final Integration

#### [ ] Task 4.1: Update nxus-core Routes to Use @nxus/workbench
Wire up the workbench package in the main app.

**Actions:**
1. Add `"@nxus/workbench": "workspace:*"` to nxus-core/package.json
2. Update `routes/nodes.tsx`:
   ```typescript
   import { createFileRoute } from '@tanstack/react-router'
   import { NodeWorkbenchRoute } from '@nxus/workbench'

   export const Route = createFileRoute('/nodes')({
     component: NodeWorkbenchRoute,
   })
   ```

**Verification:** `nx build nxus-core` succeeds

---

#### [ ] Task 4.2: Delete Moved Node Files from nxus-core
Final cleanup of moved files.

**Files/directories to delete:**
- `components/features/nodes/` (entire directory)
- `services/nodes/nodes.server.ts`
- `services/nodes/search-nodes.server.ts`
- Keep `services/nodes/` if adapter files remain

**Verification:**
- `nx build nxus-core` succeeds
- `nx run-many -t build` all packages build

---

#### [ ] Task 4.3: Full Build and Runtime Verification
Verify everything works end-to-end.

**Actions:**
1. `nx run-many -t build` - all packages build
2. `nx run-many -t typecheck` - no type errors
3. `nx run-many -t lint` - no lint errors
4. `nx dev nxus-core` - start dev server
5. Manual testing:
   - Navigate to `/` - AppManager works
   - Navigate to `/nodes` - Workbench works
   - Create/edit nodes - persists correctly
   - Switch architecture modes - both work

**Verification:** All checks pass, app fully functional

---

### Phase 5: Testing & Documentation

#### [ ] Task 5.1: Add Unit Tests to @nxus/db
Add tests for the core data layer.

> **Existing Test Script**: Convert `packages/nxus-core/scripts/test-node-service.ts` into proper Vitest unit tests.

**Actions:**
1. Convert `test-node-service.ts` into Vitest unit tests:
   - Move to `packages/nxus-db/src/__tests__/node.service.test.ts`
   - Refactor to use Vitest describe/it/expect syntax
   - Add proper test isolation (setup/teardown)
2. Add tests for `node.service.ts`:
   - `createNode()`
   - `findNode()`
   - `updateNode()`
   - `deleteNode()`
   - `queryNodes()`
   - `assembleNode()`
3. Add tests for `ephemeral-factory.ts`

**Verification:** `nx test nxus-db` passes

---

#### [ ] Task 5.2: Add Integration Tests
Add tests for cross-package functionality.

**Actions:**
1. Test @nxus/workbench server functions
2. Test route integration works
3. Test imports from @nxus/db work correctly

**Verification:** `nx test nxus-workbench` passes

---

#### [ ] Task 5.3: Create Mini-App Example
Demonstrate how future mini-apps use @nxus/db.

**Actions:**
1. Add example in documentation showing:
   - How to import from @nxus/db
   - How to create ephemeral DB
   - How to query nodes

**Verification:** Example compiles

---

#### [ ] Task 5.4: Document Public APIs
Create API documentation for both packages.

**Actions:**
1. Document @nxus/db exports in README or TSDoc
2. Document @nxus/workbench exports
3. Add usage examples

**Verification:** Documentation exists and is accurate

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `nx run-many -t build` passes (all 4 packages: nxus-ui, nxus-db, nxus-workbench, nxus-core)
- [ ] `nx run-many -t typecheck` passes
- [ ] `nx run-many -t lint` passes
- [ ] `nx test nxus-db` passes
- [ ] `nx test nxus-workbench` passes
- [ ] No circular dependencies exist (verify with `nx graph`)
- [ ] No cross-package source imports (all imports via public APIs)
- [ ] App runs: `/` route works
- [ ] App runs: `/nodes` route works
- [ ] Node CRUD operations work
- [ ] Legacy/Node architecture toggle works
- [ ] Graph database operations work

## Dependency Graph (Final)

```
                    ┌─────────────────┐
                    │   nxus-core     │  (main app)
                    │  - AppManager   │
                    │  - Route mount  │
                    └────────┬────────┘
                             │ depends on
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐
    │ nxus-workbench  │ │    nxus-db      │ │   nxus-ui   │
    │  - NodeBrowser  │ │  - schemas      │ │ - shadcn/ui │
    │  - /nodes route │ │  - node.service │ │ - utils     │
    └────────┬────────┘ │  - db clients   │ └─────────────┘
             │          └─────────────────┘        ▲
             │ depends on        ▲                 │
             └───────────────────┴─────────────────┘
```

No circular dependencies: nxus-core → nxus-workbench → nxus-db, and all packages can depend on nxus-ui.
