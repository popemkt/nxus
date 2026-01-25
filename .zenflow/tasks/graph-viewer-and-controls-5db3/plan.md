# Graph Viewer and Controls - Implementation Plan

## Configuration
- **Artifacts Path**: `.zenflow/tasks/graph-viewer-and-controls-5db3`
- **Difficulty**: Hard
- **Architecture**: Modular graph system with isolated data provider and pluggable renderers

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
- Modular architecture design with isolated data provider
- Pluggable renderer system (2D and 3D)
- Data model: GraphNode, GraphEdge, GraphData types
- Edge direction UX (animated particles, color coding)
- Discord-style sidebar design

**Output**: `spec.md`

---

## Phase 1: Foundation

### [ ] Step: Create Provider Types and Interfaces

Define the core data types for the renderer-agnostic graph system.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/provider/types.ts`:
   - `GraphNode` interface (id, label, supertag, metrics, state)
   - `GraphEdge` interface (id, source, target, type, direction, state)
   - `GraphData` interface (nodes, edges, supertagColors, stats)
   - `GraphDataOptions` interface (includeTags, includeRefs, filters, localGraph)
2. Create `packages/nxus-workbench/src/features/graph/provider/index.ts` barrel export

**Verification**:
- TypeScript compiles without errors
- Types can be imported from other modules

---

### [ ] Step: Implement Edge Extractors

Create modular functions to extract edges from different relationship types.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/provider/extractors/`:
   - `dependency-extractor.ts` - Extract from `field:dependencies` property
   - `backlink-extractor.ts` - Find nodes that reference the target (requires node map)
   - `reference-extractor.ts` - Extract from generic node-type properties
   - `hierarchy-extractor.ts` - Extract from `field:parent` property
   - `index.ts` - Barrel export with unified `extractAllEdges` function
2. Each extractor returns `GraphEdge[]` and is independently testable

**Verification**:
- Unit tests for each extractor with mock data
- Extractors correctly identify edge direction

---

### [ ] Step: Implement Graph Data Provider Hook

Create the main hook that transforms AssembledNode[] into GraphData.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/provider/use-graph-data.ts`:
   - Accept `AssembledNode[]` and `GraphDataOptions`
   - Transform nodes to `GraphNode[]` with supertag info and metrics
   - Use extractors to generate `GraphEdge[]`
   - Generate consistent supertag color palette
   - Compute graph stats (total nodes, edges, orphans, components)
   - Return `GraphData` object
2. Create `packages/nxus-workbench/src/features/graph/provider/utils/`:
   - `color-palette.ts` - Generate consistent colors for supertags
   - `graph-stats.ts` - Compute graph statistics

**Verification**:
- Unit test with sample AssembledNode data
- Correct node/edge counts
- Colors are consistent across renders

---

### [ ] Step: Implement Local Graph Filtering

Create the BFS-based local graph filtering hook.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/provider/use-local-graph.ts`:
   - Accept `GraphData`, `focusNodeId`, `depth`, `linkTypes`
   - Implement BFS traversal from focus node
   - Support filtering by link direction (outgoing/incoming/both)
   - Mark nodes and edges with `isInLocalGraph` flag
   - Return filtered `GraphData` or annotated full graph
2. Handle edge cases:
   - No focus node (return all)
   - Focus node has no connections
   - Circular references

**Verification**:
- Unit test BFS at depth 1, 2, 3
- Test direction filtering (outgoing only, incoming only, both)
- Test circular reference handling

---

### [ ] Step: Create Graph Store

Create the Zustand store for shared graph options.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/store/types.ts`:
   - `GraphPhysicsOptions` (centerForce, repelForce, linkForce, linkDistance)
   - `GraphDisplayOptions` (colorBy, nodeLabels, edgeLabels, nodeSize, edgeStyle)
   - `GraphFilterOptions` (includeTags, includeRefs, showOrphans, supertagFilter, searchQuery)
   - `GraphLocalGraphOptions` (enabled, focusNodeId, depth, linkTypes)
   - `GraphViewOptions` (renderer, layout)
   - `WorkbenchGraphState` (all options + actions)
2. Create `packages/nxus-workbench/src/features/graph/store/defaults.ts`:
   - Default values for all options (Obsidian-inspired physics defaults)
3. Create `packages/nxus-workbench/src/features/graph/store/graph.store.ts`:
   - Zustand store with persist middleware
   - Actions for updating each option group
   - `resetToDefaults` action
4. Create `packages/nxus-workbench/src/features/graph/store/index.ts` barrel export

**Verification**:
- Store initializes with defaults
- Options persist to localStorage
- Actions update state correctly

---

## Phase 2: 2D Renderer

### [ ] Step: Create 2D Node Components

Build the React Flow node components.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/renderers/graph-2d/nodes/`:
   - `DetailedNode.tsx` - Card-style with label, supertag badge, connection count
   - `SimpleNode.tsx` - Colored dot with optional label, sized by connections
   - `index.ts` - Export node types map
2. Support states: normal, dimmed, highlighted, focused
3. Use supertag color for styling

**Verification**:
- Components render without errors
- States display correctly
- Responsive to hover

---

### [ ] Step: Create 2D Edge Components

Build the React Flow edge components with direction visualization.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/renderers/graph-2d/edges/`:
   - `AnimatedEdge.tsx` - With directional particles flowing along path
   - `StaticEdge.tsx` - Simple line with arrow marker
   - `index.ts` - Export edge types map
2. Implement particle animation using CSS keyframes or requestAnimationFrame
3. Support highlight colors: teal for outgoing, violet for incoming
4. Support dimmed state for non-connected edges

**Verification**:
- Edges render correctly
- Particles animate in correct direction
- Highlight colors work on hover

---

### [ ] Step: Implement 2D Layout Hooks

Create layout hooks for hierarchical and force-directed layouts.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/renderers/graph-2d/layouts/`:
   - `use-dagre-layout.ts` - Hierarchical layout using dagre
   - `use-force-layout.ts` - Force-directed using d3-force with physics params
   - `index.ts` - Export layout selector hook
2. Force layout should accept physics params from store:
   - `centerForce` → forceCenter strength
   - `repelForce` → forceManyBody strength
   - `linkForce` → forceLink strength
   - `linkDistance` → forceLink distance
3. Support smooth transitions between layouts

**Verification**:
- Dagre positions nodes correctly
- Force simulation responds to physics params
- Layout transitions are smooth

---

### [ ] Step: Build Graph2D Component

Create the main 2D graph component.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/renderers/graph-2d/Graph2D.tsx`:
   - Accept `GraphData` from provider
   - Convert `GraphNode[]` to React Flow nodes
   - Convert `GraphEdge[]` to React Flow edges
   - Register custom node and edge types
   - Add Background, MiniMap, Controls
   - Connect to store for physics and display options
   - Handle node click for local graph focus
   - Handle node double-click for navigation
2. Create `packages/nxus-workbench/src/features/graph/renderers/graph-2d/index.ts`

**Verification**:
- Graph renders with sample data
- Nodes and edges display correctly
- Interactions work (click, double-click, drag)
- Physics changes update simulation

---

## Phase 3: Controls

### [ ] Step: Build Control Sections

Create individual control panel sections.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/controls/sections/`:
   - `PhysicsSection.tsx` - Sliders for center, repel, link force, link distance
   - `FilterSection.tsx` - Toggles for includeTags, includeRefs, showOrphans
   - `DisplaySection.tsx` - Dropdowns for colorBy, nodeLabels, nodeSize, edgeStyle
   - `LocalGraphSection.tsx` - Toggle, depth selector, link type checkboxes
   - `index.ts`
2. Each section connects to store via hooks
3. Use collapsible panels for space efficiency

**Verification**:
- Sliders update store values
- Toggles reflect and update state
- Sections collapse/expand

---

### [ ] Step: Build GraphControls Container

Create the main control panel container.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/controls/GraphControls.tsx`:
   - Floating panel (top-right or docked)
   - Contains all control sections
   - "Reset to defaults" button
2. Create `packages/nxus-workbench/src/features/graph/controls/RendererSwitcher.tsx`:
   - 2D/3D toggle buttons
   - Updates `view.renderer` in store
3. Create `packages/nxus-workbench/src/features/graph/controls/GraphLegend.tsx`:
   - Shows supertag colors
   - Click to filter by supertag
4. Create `packages/nxus-workbench/src/features/graph/controls/index.ts`

**Verification**:
- Controls render correctly
- All sections functional
- Renderer switcher updates view

---

## Phase 4: 3D Renderer

### [ ] Step: Add 3D Force Graph Dependency

Install and configure 3d-force-graph.

**Tasks**:
1. Add dependency: `pnpm add 3d-force-graph --filter=nxus-workbench`
2. Update `.gitignore` if needed
3. Verify bundle size impact

**Verification**:
- Dependency installs correctly
- No type errors

---

### [ ] Step: Build Graph3D Component

Create the 3D graph renderer.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/renderers/graph-3d/`:
   - `use-3d-graph.ts` - Wrapper hook for 3d-force-graph instance
   - `node-renderer.ts` - Custom 3D node sprites (colored spheres with labels)
   - `edge-renderer.ts` - Custom 3D edge lines with arrows
   - `Graph3D.tsx` - Main component
   - `index.ts`
2. Graph3D should:
   - Accept same `GraphData` as Graph2D
   - Convert to 3d-force-graph format
   - Apply physics params from store
   - Handle click for local graph focus
   - Support orbit camera controls
3. Match visual style with 2D version (colors, sizing)

**Verification**:
- 3D graph renders
- Camera controls work
- Physics params affect simulation
- Node interactions work

---

## Phase 5: Integration

### [ ] Step: Create Sidebar Component

Build the Discord-style icon sidebar.

**Tasks**:
1. Create `packages/nxus-workbench/src/components/layout/`:
   - `SidebarIcon.tsx` - Individual icon button with tooltip
   - `Sidebar.tsx` - Vertical icon bar container
   - `index.ts`
2. Icons using Phosphor:
   - `List` - NodeBrowser view
   - `Graph` - Graph view
3. Active state styling (indicator bar, background)
4. Hover tooltips

**Verification**:
- Sidebar renders on left
- Icons show tooltips
- Active state displays correctly

---

### [ ] Step: Build GraphView Orchestrator

Create the main GraphView component that orchestrates everything.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/GraphView.tsx`:
   - Fetch nodes from server (reuse existing query)
   - Use `useGraphData` hook to transform data
   - Use `useLocalGraph` if local graph enabled
   - Render Graph2D or Graph3D based on store
   - Render GraphControls
   - Handle node selection callback
2. Create `packages/nxus-workbench/src/features/graph/index.ts`

**Verification**:
- GraphView renders with real data
- Switches between 2D and 3D
- Controls affect both renderers
- Local graph works

---

### [ ] Step: Update Workbench Route

Integrate sidebar and graph view into workbench.

**Tasks**:
1. Modify `packages/nxus-workbench/src/route.tsx`:
   - Add view mode state ('list' | 'graph')
   - Add Sidebar component on left
   - Conditionally render NodeBrowser or GraphView
   - Pass selected node between views
2. Ensure supertag sidebar remains functional
3. Handle navigation from graph to node inspector

**Verification**:
- Sidebar navigation works
- Views switch correctly
- Node selection syncs between views
- Supertag sidebar still works

---

### [ ] Step: Add Backlink Query Support

Implement server-side backlink query for complete edge data.

**Tasks**:
1. Modify `packages/nxus-workbench/src/server/search-nodes.server.ts`:
   - Add `getBacklinksServerFn` function
   - Query `node_properties` where value contains target node ID
   - Filter to node-type fields only
   - Return list of referencing nodes
2. Integrate into graph data provider
3. Consider caching strategy

**Verification**:
- Backlinks query returns correct results
- Edges appear bidirectionally in graph
- Performance acceptable

---

## Phase 6: Polish

### [ ] Step: Testing and Bug Fixes

Comprehensive testing and bug fixing.

**Tasks**:
1. Run type check: `pnpm typecheck`
2. Run linter: `pnpm lint`
3. Run tests: `pnpm test --filter=nxus-workbench`
4. Manual testing:
   - Test with 10, 50, 100, 500 nodes
   - Test all physics sliders
   - Test local graph at all depths
   - Test filter combinations (tags, refs, orphans)
   - Test 2D ↔ 3D switching
   - Test edge direction highlighting
   - Test sidebar navigation
5. Fix discovered bugs
6. Optimize performance if needed

**Verification**:
- All tests pass
- No lint errors
- Smooth performance with 100+ nodes

---

### [ ] Step: Write Implementation Report

Document the implementation.

**Tasks**:
1. Write `report.md` with:
   - Summary of implemented features
   - Architecture decisions and rationale
   - Testing approach and results
   - Challenges encountered and solutions
   - Performance considerations
   - Future improvement suggestions

**Output**: `report.md`
