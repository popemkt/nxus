# Graph Viewer and Controls - Implementation Plan

## Configuration
- **Artifacts Path**: `.zenflow/tasks/graph-viewer-and-controls-5db3`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

**Status**: Complete

Created comprehensive technical specification covering:
- Research on Obsidian, Tana-helper, and Anytype graph implementations
- Analysis of existing graph view code in nxus-core
- Architecture design for workbench graph integration
- Data model mapping from AssembledNode to graph nodes/edges

**Output**: `spec.md`

---

### [ ] Step: Create Workbench Graph Store

Create the Zustand store for workbench graph state management.

**Tasks**:
1. Create `packages/nxus-workbench/src/stores/workbench-graph.store.ts`
2. Define `WorkbenchGraphOptions` interface with:
   - Layout options (force/hierarchical)
   - Physics controls (centerForce, repelForce, linkForce, linkDistance)
   - Display options (nodeStyle, showLabels, colorBy, nodeSizing)
   - Filter options (showOrphans, filterMode)
   - Local graph options (localGraphMode, localGraphDepth, localGraphLinkTypes)
   - Interaction options (nodesLocked)
3. Implement persisted store with Zustand persist middleware
4. Export store and related types

**Verification**:
- TypeScript compiles without errors
- Store can be imported and used

---

### [ ] Step: Implement Graph Data Transformation Hook

Create the hook that transforms AssembledNode data into React Flow format.

**Tasks**:
1. Create `packages/nxus-workbench/src/components/graph-view/hooks/use-workbench-graph.ts`
2. Implement node creation from AssembledNode:
   - Extract content as label
   - Map supertags to colors
   - Calculate connection counts for sizing
3. Implement edge extraction:
   - Parse `field:dependencies` property values
   - Parse `field:parent` for hierarchy edges
4. Generate consistent supertag color palette
5. Export `useWorkbenchGraph` hook

**Verification**:
- Unit test with sample AssembledNode data
- Correct node/edge count output

---

### [ ] Step: Implement Local Graph Filtering Hook

Create the hook for filtering graph to N-degree connections from a focus node.

**Tasks**:
1. Create `packages/nxus-workbench/src/components/graph-view/hooks/use-local-graph.ts`
2. Implement BFS traversal from focus node:
   - Track visited nodes at each depth level
   - Support configurable max depth (1-3)
   - Filter by link direction (incoming/outgoing/both)
3. Return filtered nodes and edges
4. Handle edge case: no focus node (return all)

**Verification**:
- Unit test BFS at depth 1, 2, 3
- Test direction filtering

---

### [ ] Step: Create Node and Edge Components

Build the React Flow node and edge components for workbench.

**Tasks**:
1. Create `packages/nxus-workbench/src/components/graph-view/components/workbench-node.tsx`:
   - Detailed mode: Card with content, supertag badge, connection count
   - Simple mode: Colored dot with optional label
   - Support dimmed/highlighted states
2. Create `packages/nxus-workbench/src/components/graph-view/components/relation-edge.tsx`:
   - Animated edge for force layout
   - Directional arrow marker
   - Optional relation type label

**Verification**:
- Components render without errors
- Visual appearance matches design

---

### [ ] Step: Build Main Graph Canvas Component

Create the main WorkbenchGraphCanvas component.

**Tasks**:
1. Create `packages/nxus-workbench/src/components/graph-view/WorkbenchGraphCanvas.tsx`
2. Integrate React Flow with:
   - Custom node types (workbench-node)
   - Custom edge types (relation-edge)
   - Background grid
   - MiniMap
3. Implement Dagre hierarchical layout
4. Implement D3 force simulation with configurable physics:
   - forceCenter with centerForce parameter
   - forceManyBody with repelForce parameter
   - forceLink with linkForce and linkDistance parameters
   - forceCollide for overlap prevention
5. Handle layout transitions smoothly
6. Connect to workbench graph store

**Verification**:
- Graph renders with sample data
- Force simulation runs
- Hierarchical layout positions correctly

---

### [ ] Step: Build Graph Controls Component

Create the enhanced controls panel with Obsidian-inspired physics sliders.

**Tasks**:
1. Create `packages/nxus-workbench/src/components/graph-view/WorkbenchGraphControls.tsx`
2. Implement control groups:
   - **Layout**: Force/Hierarchical toggle buttons
   - **Physics** (collapsible): Sliders for center, repel, link force, link distance
   - **Display**: Node style toggle, labels toggle, color by dropdown
   - **Filter**: Orphans toggle, filter mode selector
   - **Local Graph**: Toggle, depth selector (1/2/3)
   - **Actions**: Fit view, run layout buttons
3. Add supertag color legend (bottom panel)
4. Connect all controls to store

**Verification**:
- Controls render correctly
- Slider changes update store
- Physics changes affect simulation

---

### [ ] Step: Integrate Graph View into Workbench Route

Add graph view mode to the existing workbench layout.

**Tasks**:
1. Modify `packages/nxus-workbench/src/route.tsx`:
   - Add view mode state (list | graph)
   - Add view mode switcher in header
   - Conditionally render NodeBrowser or WorkbenchGraphCanvas
2. Pass selected node ID for local graph focus
3. Handle node selection from graph (double-click navigates to inspector)
4. Ensure search/filter integration works with graph

**Verification**:
- Can switch between list and graph views
- Graph shows correct nodes based on filters
- Node selection works bidirectionally

---

### [ ] Step: Add Backlink Query Support

Enhance the server to support backlink queries for complete graph edges.

**Tasks**:
1. Review `packages/nxus-workbench/src/server/search-nodes.server.ts`
2. Add `getBacklinksServerFn` function:
   - Query node_properties where value contains node ID
   - Return list of nodes that reference the target
3. Integrate backlinks into graph edge creation
4. Consider caching for performance

**Verification**:
- Backlinks query returns correct results
- Edges appear for both directions

---

### [ ] Step: Testing and Polish

Final testing, bug fixes, and polish.

**Tasks**:
1. Run full type check: `pnpm typecheck`
2. Run linter: `pnpm lint`
3. Run tests: `pnpm test --filter=nxus-workbench`
4. Manual testing:
   - Test with various node counts (10, 50, 100+)
   - Test all control interactions
   - Test local graph at all depths
   - Test layout transitions
   - Test filter/search integration
5. Fix any bugs discovered
6. Optimize performance if needed (culling, reduced updates)

**Verification**:
- All tests pass
- No lint errors
- Smooth performance with 100+ nodes

---

### [ ] Step: Write Implementation Report

Document what was implemented and any challenges.

**Tasks**:
1. Write `report.md` with:
   - Summary of implemented features
   - Architecture decisions made
   - Testing approach and results
   - Challenges encountered and solutions
   - Future improvement suggestions

**Output**: `report.md`
