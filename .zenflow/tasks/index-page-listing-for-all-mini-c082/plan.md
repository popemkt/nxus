# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 0f2e3e2f-8232-411d-82af-133fa8aee6d5 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification

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

Replaced the Implementation step below with concrete tasks based on `{@artifacts_path}/spec.md`.

### [ ] Step: Restructure monorepo to apps/ and libs/

Move existing packages to follow Nx conventions using `git mv` (preserves history).

1. Create `apps/` and `libs/` directories
2. `git mv packages/nxus-core apps/nxus-core`
3. `git mv packages/nxus-db libs/nxus-db`
4. `git mv packages/nxus-ui libs/nxus-ui`
5. `git mv packages/nxus-workbench libs/nxus-workbench`
6. Update `pnpm-workspace.yaml` to include `apps/*` and `libs/*` (keep `packages/*` for `_commands`/`repos`)
7. Update `nx.json` plugin `exclude`/`include` patterns from `packages/nxus-ui/*` to `libs/nxus-ui/*`
8. Update `apps/nxus-core/tsconfig.json` references from `../nxus-*` to `../../libs/nxus-*`
9. Update `apps/nxus-core/vite.config.ts` watch ignore paths if referencing `packages/repos` by relative path
10. Run `pnpm install` to re-link workspace packages
11. Verify: `nx graph` shows correct deps, `nx run nxus-core:dev` starts, `nx run nxus-core:typecheck` passes

### [ ] Step: Decouple workbench from nxus-core

Remove the `/nodes` route and `@nxus/workbench` dependency from nxus-core.

1. Delete `apps/nxus-core/src/routes/nodes.tsx`
2. Remove `"@nxus/workbench": "workspace:*"` from `apps/nxus-core/package.json`
3. Remove `@nxus/workbench` from `optimizeDeps.exclude` and `ssr.noExternal` in `apps/nxus-core/vite.config.ts`
4. Remove the workbench reference from `apps/nxus-core/tsconfig.json`
5. Search for and remove any remaining `@nxus/workbench` imports in `apps/nxus-core/src/`
6. Run `pnpm install`
7. Verify: `nx run nxus-core:dev` works, all routes except `/nodes` function correctly

### [ ] Step: Create nxus-workbench app shell

Create a thin TanStack Start app in `apps/nxus-workbench/` that mounts the workbench library.

1. Create `apps/nxus-workbench/` directory structure: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`, `src/styles.css`
2. `package.json`: name `@nxus/workbench-app`, port 3002, deps on `@nxus/workbench`, `@nxus/db`, `@nxus/ui`, TanStack Start, Vite, React, Tailwind, Nitro
3. `vite.config.ts`: TanStack Start + Nitro + Tailwind + tsconfig paths, SSR noExternal for `@nxus/db` and `@nxus/workbench`
4. `__root.tsx`: Minimal root with QueryClientProvider, theme support (reuse nxus-core's theme inline script and ThemeProvider pattern)
5. `index.tsx`: Mount `NodeWorkbenchRoute` from `@nxus/workbench`
6. `tsconfig.json`: Same pattern as nxus-core, with references to `../../libs/nxus-workbench`, `../../libs/nxus-ui`, `../../libs/nxus-db`
7. `styles.css`: Import Tailwind and `@nxus/ui` theme styles (copy relevant parts from nxus-core's styles.css)
8. Run `pnpm install`
9. Verify: `nx run @nxus/workbench-app:dev` starts, workbench renders with node browser, graph view, query builder all functional

### [ ] Step: Create nxus-gateway app

Create the gateway landing page app in `apps/nxus-gateway/`.

1. Create `apps/nxus-gateway/` directory structure: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`, `src/styles.css`, `src/config/mini-apps.ts`
2. `package.json`: name `@nxus/gateway`, port 3001, deps on `@nxus/ui`, TanStack Start, Vite, React, Tailwind, Nitro (NO database or workbench deps)
3. `mini-apps.ts`: Static manifest listing nxus-core and nxus-workbench with name, description, icon, path
4. `__root.tsx`: Minimal root with theme support (same pattern as workbench app)
5. `index.tsx`: Gateway landing page — grid of mini-app cards using `@nxus/ui` components, each card links via `<a href>` to the mini-app's path
6. Style the gateway page: clean, minimal design consistent with the nxus theme system
7. Run `pnpm install`
8. Verify: `nx run @nxus/gateway:dev` starts, shows mini-app cards, links point to `/core` and `/workbench`

### [ ] Step: Configure base paths and multi-app dev experience

Set up base path routing for each app and a unified dev experience.

1. Configure nxus-core's TanStack Router with `basePath: '/core'` in `apps/nxus-core/src/router.tsx`
2. Configure workbench app's TanStack Router with `basePath: '/workbench'` in `apps/nxus-workbench/src/router.tsx`
3. Gateway stays at `/` (no basePath needed)
4. Add root `package.json` scripts: `dev` (run-many for all apps), `dev:gateway`, `dev:core`, `dev:workbench`
5. Add a "home" link/icon in nxus-core and nxus-workbench root layouts that navigates back to `/` (the gateway)
6. Verify each app independently: gateway at :3001, core at :3000/core, workbench at :3002/workbench
7. Verify `nx graph` shows the full dependency graph correctly
8. Test: navigate from gateway to core and workbench, verify "home" link returns to gateway
