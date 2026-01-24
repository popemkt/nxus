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

### [x] Step: Phase 0 - Create @nxus/ui Package
<!-- chat-id: 4410879a-ec34-4c11-87ba-be246738a5f0 -->
<!-- agent: claude-code -->

> **Rationale**: Without extracting shared UI components first, nxus-workbench would need to depend on nxus-core for UI components while nxus-core depends on nxus-workbench for routes. This creates a circular dependency. Extracting @nxus/ui first establishes a clean dependency graph:
> ```
> nxus-core → nxus-workbench → nxus-db
>     ↓              ↓
>     └──────→ nxus-ui ←──────┘
> ```

#### Tasks:

- [x] **0.1**: Generate nxus-ui Package Structure
  - Used existing scaffold in `packages/nxus-ui`
  - Created directory structure: `components/`, `lib/`, `hooks/`

- [x] **0.2**: Move Shared UI Components to @nxus/ui
  - Used `git mv` to move: `nxus-core/src/components/ui/*` → `nxus-ui/src/components/`
  - Used `git mv` to move: `nxus-core/src/lib/utils.ts` → `nxus-ui/src/lib/utils.ts`
  - Note: `use-mobile.tsx` did not exist in the codebase
  - Created `src/index.ts` barrel export for all UI components
  - Updated internal imports within moved files (changed `@/lib/utils` to relative imports)

- [x] **0.3**: Configure TypeScript Paths for @nxus/ui
  - Using pnpm workspace protocol - TypeScript paths not needed in bundler mode
  - Created standalone tsconfig.lib.json with proper React/bundler configuration
  - Added `@types/react` and `@types/react-dom` as devDependencies
  - Added `framer-motion` dependency for decode-text and glitch-text components

- [x] **0.4**: Update nxus-core to Use @nxus/ui
  - Added `"@nxus/ui": "workspace:*"` to nxus-core/package.json
  - Ran `pnpm install`
  - Global find/replace: `from '@/components/ui/...'` → `from '@nxus/ui'`
  - Global find/replace: `from '@/lib/utils'` → `from '@nxus/ui'`
  - Deleted the now-empty `components/ui/` directory from nxus-core

**Verification:**
- [x] `nx typecheck @nxus/ui` succeeds
- [x] `nx typecheck nxus-core` succeeds
- [x] `pnpm run build` (nxus-core) succeeds - built in 4m 41s

---

### [x] Step: Phase 1 - Create @nxus/db Package
<!-- chat-id: 2000e613-1a3a-4b5f-adca-5a2b0a9f4c7f -->
<!-- agent: claude-code -->

Create the foundation database package that will be shared across mini-apps.

#### Tasks:

- [x] **1.1**: Generate nxus-db Package Structure
  - Created `packages/nxus-db/` directory structure manually
  - Created directory structure: `schemas/`, `services/`, `client/`, `types/`
  - Created `package.json` with dependencies: better-sqlite3, drizzle-orm, surrealdb, uuidv7, zod
  - Created `tsconfig.json` extending base config

- [x] **1.2**: Move Schemas to @nxus/db
  - Used `git mv`: `nxus-core/src/db/schema.ts` → `nxus-db/src/schemas/item-schema.ts`
  - Used `git mv`: `nxus-core/src/db/node-schema.ts` → `nxus-db/src/schemas/node-schema.ts`
  - Used `git mv`: `nxus-core/src/db/columns.ts` → `nxus-db/src/schemas/columns.ts`
  - Used `git mv`: `nxus-core/src/db/ephemeral-schema.ts` → `nxus-db/src/schemas/ephemeral-schema.ts`
  - Created `schemas/index.ts` barrel export
  - Fixed internal import paths (added `.js` extensions for ESM)
  - Renamed conflicting Drizzle types: `Item` → `DbItem`, `ItemCommand` → `DbItemCommand`, etc.

- [x] **1.3**: Move Types to @nxus/db
  - Used `git mv` for: `item.ts`, `workflow.ts`, `command.ts`, `command-params.ts`
  - Created `types/index.ts` barrel export
  - Fixed internal import paths (added `.js` extensions)

- [x] **1.4**: Move Database Clients to @nxus/db
  - Used `git mv`: `client.ts` → `client/master-client.ts`
  - Used `git mv`: `graph-client.ts` → `client/graph-client.ts`
  - Updated imports to use local schema paths
  - Created `client/index.ts` barrel export

- [x] **1.5**: Move Node Service to @nxus/db
  - Used `git mv`: `node.service.ts` → `nxus-db/src/services/node.service.ts`
  - Updated imports to use local paths
  - Created `services/index.ts` barrel export

- [x] **1.6**: Create Ephemeral DB Factory
  - Note: Ephemeral schema moved to `@nxus/db` and exported via main entry
  - Factory pattern already exists in master-client.ts

- [x] **1.7**: Constants Module
  - SYSTEM_SUPERTAGS, SYSTEM_FIELDS remain in node-schema.ts and are exported

- [x] **1.8**: Create Public API
  - Created dual entry points for client/server separation:
    - `src/index.ts`: Exports schemas and types (safe for browser)
    - `src/server.ts`: Exports everything including database clients (Node.js only)
  - Updated `package.json` with exports field for both entry points

- [x] **1.9**: Configure TypeScript & Update Imports
  - Using pnpm workspace protocol - no tsconfig paths needed
  - Updated 60+ files in nxus-core to use `@nxus/db` (types) or `@nxus/db/server` (db clients)
  - Updated 13 script files in nxus-core/scripts/

**Verification:**
- [x] `pnpm exec tsc --noEmit -p packages/nxus-db/tsconfig.json` succeeds
- [x] `pnpm run build` (nxus-core) succeeds - built in 5m 28s

---

### [x] Step: Phase 2 - Integrate @nxus/db into nxus-core
<!-- agent: claude-code -->

Wire up the new @nxus/db package into nxus-core and clean up moved files.

> **Note**: This phase was completed as part of Phase 1 since the integration was necessary to verify the build.

#### Tasks:

- [x] **2.1**: Add @nxus/db Dependency to nxus-core
  - Added `"@nxus/db": "workspace:*"` to nxus-core/package.json
  - Ran `pnpm install`

- [x] **2.2**: Update Import Paths in nxus-core Services
  - Updated 60+ files in src/ to use `@nxus/db` or `@nxus/db/server`
  - Updated 13 script files in scripts/
  - Server files (*.server.ts) import from `@nxus/db/server`
  - Client files (components, hooks, stores) import from `@nxus/db` (types only)

- [x] **2.3**: Ephemeral Schema Handling
  - Ephemeral schema (`ephemeral-schema.ts`) was moved to `@nxus/db`
  - App-specific types (dependency.ts, tag.ts) remain in nxus-core/src/types/

- [x] **2.4**: Moved Files Cleanup
  - Files were moved via `git mv`, so originals are automatically cleaned up
  - nxus-core/src/db/ directory is now empty (can be deleted)
  - nxus-core/src/services/nodes/node.service.ts was moved to @nxus/db
  - services/nodes/index.ts updated to re-export from @nxus/db/server

**Verification:**
- [x] `pnpm run build` (nxus-core) succeeds
- [x] Build completed in 5m 28s

---

### [ ] Step: Phase 3 - Create @nxus/workbench Package
<!-- agent: claude-code -->

Create the workbench package containing node management UI components.

#### Tasks:

- [ ] **3.1**: Generate nxus-workbench Package Structure
  - Run: `nx g @nx/react:library nxus-workbench --directory=packages/nxus-workbench --bundler=vite --unitTestRunner=vitest --importPath=@nxus/workbench`
  - Clean up generated boilerplate
  - Create directory structure: `components/`, `components/shared/`, `server/`, `hooks/`
  - Add dependencies: `@nxus/db` and `@nxus/ui`

- [ ] **3.2**: Move Node Components to @nxus/workbench
  - Use `git mv` to move: `components/features/nodes/node-browser/`, `node-inspector/`, `supertag-sidebar/`, `shared/`
  - Update imports to use `@nxus/db` and `@nxus/ui`

- [ ] **3.3**: Move Node Server Functions to @nxus/workbench
  - Use `git mv`: `services/nodes/nodes.server.ts` → `nxus-workbench/src/server/nodes.server.ts`
  - Use `git mv`: `services/nodes/search-nodes.server.ts` → `nxus-workbench/src/server/search-nodes.server.ts`
  - Update imports to use @nxus/db
  - Create `server/index.ts` barrel export

- [ ] **3.4**: Move Node Hooks to @nxus/workbench
  - Identify and move node-specific hooks
  - Update imports to use @nxus/db and @nxus/ui
  - Create `hooks/index.ts` barrel export

- [ ] **3.5**: Create NodeWorkbenchRoute Export
  - Create `src/route.tsx` that composes NodeBrowser, NodeInspector, SupertagSidebar
  - Export as `NodeWorkbenchRoute`

- [ ] **3.6**: Create Public API (index.ts)
  - Export: `NodeWorkbenchRoute`, server functions, individual components

- [ ] **3.7**: Configure TypeScript Paths for @nxus/workbench
  - Update `tsconfig.base.json` to add: `"@nxus/workbench": ["packages/nxus-workbench/src/index.ts"]`

**Verification:**
- `nx build nxus-workbench` succeeds
- No cross-package source imports exist

---

### [ ] Step: Phase 4 - Final Integration
<!-- agent: claude-code -->

Wire up workbench package in nxus-core and verify everything works.

#### Tasks:

- [ ] **4.1**: Update nxus-core Routes to Use @nxus/workbench
  - Add `"@nxus/workbench": "workspace:*"` to nxus-core/package.json
  - Update `routes/nodes.tsx` to import `NodeWorkbenchRoute` from `@nxus/workbench`

- [ ] **4.2**: Delete Moved Node Files from nxus-core
  - Delete: `components/features/nodes/` (entire directory)
  - Delete: `services/nodes/nodes.server.ts`, `services/nodes/search-nodes.server.ts`

- [ ] **4.3**: Full Build and Runtime Verification
  - `nx run-many -t build` - all packages build
  - `nx run-many -t typecheck` - no type errors
  - `nx run-many -t lint` - no lint errors
  - Manual testing: `/` route, `/nodes` route, CRUD operations

**Verification:**
- All checks pass
- App fully functional

---

### [ ] Step: Phase 5 - Testing & Documentation
<!-- agent: claude-code -->

Add tests and documentation for the new packages.

#### Tasks:

- [ ] **5.1**: Add Unit Tests to @nxus/db
  - Convert `packages/nxus-core/scripts/test-node-service.ts` into Vitest unit tests
  - Add tests for `node.service.ts` methods
  - Add tests for `ephemeral-factory.ts`

- [ ] **5.2**: Add Integration Tests
  - Test @nxus/workbench server functions
  - Test route integration works
  - Test imports from @nxus/db work correctly

- [ ] **5.3**: Create Mini-App Example
  - Add example showing how to import from @nxus/db, create ephemeral DB, query nodes

- [ ] **5.4**: Document Public APIs
  - Document @nxus/db exports in README or TSDoc
  - Document @nxus/workbench exports
  - Add usage examples

**Verification:**
- `nx test nxus-db` passes
- `nx test nxus-workbench` passes
- Documentation exists and is accurate

---

## Final Verification Checklist

After all steps complete, verify:

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
