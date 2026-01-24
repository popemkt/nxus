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

### [ ] Step: Phase 0 - Create @nxus/ui Package
<!-- agent: claude-code -->

> **Rationale**: Without extracting shared UI components first, nxus-workbench would need to depend on nxus-core for UI components while nxus-core depends on nxus-workbench for routes. This creates a circular dependency. Extracting @nxus/ui first establishes a clean dependency graph:
> ```
> nxus-core → nxus-workbench → nxus-db
>     ↓              ↓
>     └──────→ nxus-ui ←──────┘
> ```

#### Tasks:

- [ ] **0.1**: Generate nxus-ui Package Structure
  - Run: `nx g @nx/react:library nxus-ui --directory=packages/nxus-ui --bundler=vite --unitTestRunner=vitest --importPath=@nxus/ui`
  - Clean up generated boilerplate files
  - Create directory structure: `components/`, `lib/`, `hooks/`

- [ ] **0.2**: Move Shared UI Components to @nxus/ui
  - Use `git mv` to move: `nxus-core/src/components/ui/` → `nxus-ui/src/components/`
  - Use `git mv` to move: `nxus-core/src/lib/utils.ts` → `nxus-ui/src/lib/utils.ts`
  - Use `git mv` to move: `nxus-core/src/hooks/use-mobile.tsx` → `nxus-ui/src/hooks/use-mobile.tsx`
  - Create `src/index.ts` barrel export for all UI components
  - Update internal imports within moved files

- [ ] **0.3**: Configure TypeScript Paths for @nxus/ui
  - Update `tsconfig.base.json` to add: `"@nxus/ui": ["packages/nxus-ui/src/index.ts"]`
  - Verify Nx project.json configuration is correct

- [ ] **0.4**: Update nxus-core to Use @nxus/ui
  - Add `"@nxus/ui": "workspace:*"` to nxus-core/package.json
  - Run `pnpm install`
  - Global find/replace: `from '@/components/ui/...'` → `from '@nxus/ui'`
  - Global find/replace: `from '@/lib/utils'` → `from '@nxus/ui'`
  - Delete the now-empty `components/ui/` directory from nxus-core

**Verification:**
- `nx build nxus-ui` succeeds
- `nx build nxus-core` succeeds
- App runs, all UI renders correctly

---

### [ ] Step: Phase 1 - Create @nxus/db Package
<!-- agent: claude-code -->

Create the foundation database package that will be shared across mini-apps.

#### Tasks:

- [ ] **1.1**: Generate nxus-db Package Structure
  - Run: `nx g @nx/js:library nxus-db --directory=packages/nxus-db --bundler=tsc --unitTestRunner=vitest --importPath=@nxus/db`
  - Clean up generated boilerplate files
  - Create directory structure: `schemas/`, `services/`, `client/`, `types/`, `constants/`

- [ ] **1.2**: Move Schemas to @nxus/db
  - Use `git mv`: `nxus-core/src/db/schema.ts` → `nxus-db/src/schemas/item-schema.ts`
  - Use `git mv`: `nxus-core/src/db/node-schema.ts` → `nxus-db/src/schemas/node-schema.ts`
  - Use `git mv`: `nxus-core/src/db/columns.ts` → `nxus-db/src/schemas/columns.ts`
  - Create `schemas/index.ts` barrel export
  - Fix internal import paths within moved files

- [ ] **1.3**: Move Types to @nxus/db
  - Use `git mv`: `nxus-core/src/types/item.ts` → `nxus-db/src/types/item.ts`
  - Use `git mv`: `nxus-core/src/types/workflow.ts` → `nxus-db/src/types/workflow.ts`
  - Use `git mv`: `nxus-core/src/types/command.ts` → `nxus-db/src/types/command.ts`
  - Use `git mv`: `nxus-core/src/types/command-params.ts` → `nxus-db/src/types/command-params.ts`
  - Create `types/index.ts` barrel export

- [ ] **1.4**: Move Database Clients to @nxus/db
  - Use `git mv`: `nxus-core/src/db/client.ts` → `nxus-db/src/client/master-client.ts`
  - Use `git mv`: `nxus-core/src/db/graph-client.ts` → `nxus-db/src/client/graph-client.ts`
  - Update imports to use local schema paths
  - Create `client/index.ts` barrel export

- [ ] **1.5**: Move Node Service to @nxus/db
  - Use `git mv`: `nxus-core/src/services/nodes/node.service.ts` → `nxus-db/src/services/node.service.ts`
  - Update imports to use local paths
  - Create `services/index.ts` barrel export

- [ ] **1.6**: Create Ephemeral DB Factory
  - Create `client/ephemeral-factory.ts` with `EphemeralDbConfig` interface and `createEphemeralDb<T>()` factory function
  - Export from client barrel

- [ ] **1.7**: Create Constants Module
  - Create `constants/system.ts` with SYSTEM_SUPERTAGS, SYSTEM_FIELDS
  - Move any constants from node-schema.ts or node.service.ts
  - Create `constants/index.ts` barrel export

- [ ] **1.8**: Create Public API (index.ts)
  - Create `src/index.ts` exporting: all schemas, all types, NodeService, database clients, createEphemeralDb factory, system constants

- [ ] **1.9**: Configure TypeScript Paths
  - Update `tsconfig.base.json` to add: `"@nxus/db": ["packages/nxus-db/src/index.ts"]`

**Verification:**
- `nx build nxus-db` succeeds
- Check dist output has all expected exports

---

### [ ] Step: Phase 2 - Integrate @nxus/db into nxus-core
<!-- agent: claude-code -->

Wire up the new @nxus/db package into nxus-core and clean up moved files.

#### Tasks:

- [ ] **2.1**: Add @nxus/db Dependency to nxus-core
  - Add `"@nxus/db": "workspace:*"` to nxus-core/package.json
  - Run `pnpm install`

- [ ] **2.2**: Update Import Paths in nxus-core Services
  - Update all files importing from moved locations to use `@nxus/db`
  - Files to update: `services/apps/apps.server.ts`, `services/apps/apps-mutations.server.ts`, `services/tag.server.ts`, etc.

- [ ] **2.3**: Rename Ephemeral DB to ephemeral-items
  - Create `db/ephemeral-items/` directory
  - Move/rename ephemeral.ts → ephemeral-items/schema.ts
  - Update all imports referencing ephemeral schema

- [ ] **2.4**: Delete Moved Files from nxus-core
  - Delete: `db/schema.ts`, `db/node-schema.ts`, `db/columns.ts`, `db/client.ts`, `db/graph-client.ts`
  - Delete: `types/item.ts`, `types/workflow.ts`, `types/command.ts`, `types/command-params.ts`
  - Delete: `services/nodes/node.service.ts`

**Verification:**
- `nx build nxus-core` succeeds
- App runs, / route works

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
