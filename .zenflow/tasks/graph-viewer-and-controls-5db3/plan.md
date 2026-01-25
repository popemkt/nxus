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

### [x] Step: Create Provider Types and Interfaces
<!-- chat-id: 5115a515-66c4-42a0-a17a-d4eeacb7bc4f -->

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

**Completed**: Created comprehensive type definitions including:
- `GraphNode` with id, label, type, isVirtual, supertag, connection metrics, and state flags
- `GraphEdge` with id, source, target, type, direction, and state flags
- `GraphData` with nodes, edges, supertagColors map, and stats
- `GraphStats` for graph statistics (totalNodes, totalEdges, orphanCount, connectedComponents)
- `GraphDataOptions` for provider configuration
- `LocalGraphOptions` for BFS traversal settings
- `EdgeExtractionContext` and `EdgeExtractor` for modular edge extraction
- Default option constants

---

### [x] Step: Implement Edge Extractors
<!-- chat-id: 561f46f5-ab84-4fc7-b6e5-f68ede947199 -->

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

**Completed**: Implemented all 4 edge extractors with comprehensive unit tests (24 tests passing):

1. **dependency-extractor.ts**: Extracts edges from `field:dependencies` property
   - Handles single ID, array of IDs, and JSON-encoded arrays
   - Validates targets exist in graph before creating edges

2. **backlink-extractor.ts**: Finds incoming references using pre-computed backlink map
   - `buildBacklinkMap()` scans all nodes once for O(n) backlink detection
   - Excludes explicit relationship fields (dependencies, parent, tags, etc.)
   - Uses UUID pattern matching to identify node references

3. **reference-extractor.ts**: Extracts edges from generic node-type properties
   - Skips fields handled by dedicated extractors
   - Supports known reference fields (commands, requires, target)
   - Uses UUID pattern detection for reference identification

4. **hierarchy-extractor.ts**: Extracts parent-child relationships
   - Supports both `field:parent` property and `ownerId` field
   - `buildChildrenMap()` utility for reverse lookups
   - Deduplicates when both parent sources point to same node

5. **index.ts**: Barrel export with `extractAllEdges()` orchestration
   - Pre-computes backlink map for efficiency
   - Deduplicates edges by ID
   - Respects `includeRefs` and `includeHierarchy` options
   - `createExtractionContext()` utility for building context from nodes

---

### [x] Step: Implement Graph Data Provider Hook
<!-- chat-id: 53f241a5-6af3-4532-91e5-da263f1c5509 -->

Create the main hook that transforms AssembledNode[] into GraphData.

**Tasks**:
1. Create `packages/nxus-workbench/src/features/graph/provider/use-graph-data.ts`:
   - Accept `AssembledNode[]` and `GraphDataOptions`
   - Transform nodes to `GraphNode[]` with supertag info and metrics
   - Use extractors to generate `GraphEdge[]`
   - Generate consistent supertag color palette
   - Compute graph stats (total nodes, edges, orphans, components)
   - **Handle tag nodes**: When `includeTags: true`, synthesize virtual tag nodes
   - Return `GraphData` object
2. Create `packages/nxus-workbench/src/features/graph/provider/utils/`:
   - `color-palette.ts` - Generate consistent colors for supertags
   - `graph-stats.ts` - Compute graph statistics
   - `tag-synthesizer.ts` - Create virtual tag nodes and edges
3. **Performance consideration**: Add threshold check (>500 nodes) for Web Worker offloading (stub for now)

**Verification**:
- Unit test with sample AssembledNode data
- Correct node/edge counts
- Colors are consistent across renders
- Virtual tag nodes created when includeTags=true
- Tag nodes have `isVirtual: true` flag

**Completed**: Implemented the Graph Data Provider Hook with 3 utility files and comprehensive unit tests (93 total tests passing):

1. **use-graph-data.ts**: Main hook implementation
   - `transformToGraphData()` - Core transformation function for AssembledNode[] → GraphData
   - `useGraphData()` - React hook with memoization based on all options
   - `isLargeGraph()` - Threshold check (>500 nodes) for future Web Worker offloading
   - Supports filtering by supertag, search query highlighting, and orphan filtering
   - Integrates with edge extractors from previous step

2. **utils/color-palette.ts**: Consistent supertag colors
   - `getSupertagColor()` - Deterministic color from djb2 hash of ID
   - `generateSupertagColorMap()` - Pre-compute colors for all supertags
   - `adjustBrightness()`, `getDimmedColor()`, `getHighlightedColor()` - Color variants for states
   - 12-color default palette with good visual separation

3. **utils/graph-stats.ts**: Graph statistics computation
   - `computeGraphStats()` - Main stats computation (nodes, edges, orphans, components)
   - `countConnectedComponents()` - Union-Find (DSU) algorithm for O(n * α(n)) performance
   - `computeConnectionMetrics()` - Update node in/out/total counts and isOrphan flags
   - `getMostConnectedNodes()`, `getEdgeTypeDistribution()` - Additional analytics

4. **utils/tag-synthesizer.ts**: Virtual tag nodes
   - `synthesizeTags()` - Create virtual GraphNodes and GraphEdges for tags
   - `mergeTagSynthesis()` - Integrate virtual nodes/edges into existing graph
   - Extracts tag IDs from field:tags property, skips existing real nodes

5. **Updated provider/index.ts**: Barrel exports for all new functionality

---

### [x] Step: Implement Local Graph Filtering
<!-- chat-id: 238d0961-be13-4784-a3c3-db7971d50a80 -->

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

**Completed**: Implemented the Local Graph Filtering hook with comprehensive unit tests (32 local graph tests, 126 total tests passing):

1. **use-local-graph.ts**: BFS-based local graph traversal
   - `buildAdjacencyLists()` - Pre-compute bidirectional adjacency for efficient traversal
   - `bfsTraversal()` - BFS with configurable depth and link direction filtering
   - `filterLocalGraph()` - Annotate full graph with isInLocalGraph, isFocused, isHighlighted flags
   - `getLocalGraphOnly()` - Return filtered graph containing only local nodes/edges
   - `useLocalGraph()` - React hook with memoization, supports annotate and filter modes
   - `useLocalGraphResult()` - Hook returning detailed result with distances and ID sets

2. **Key Features**:
   - Supports depth 1-3 traversal from focus node
   - Direction filtering: 'outgoing', 'incoming', 'both', or any combination
   - Handles circular references without infinite loops
   - Handles isolated nodes (no connections)
   - Marks direct connections as isHighlighted for visual emphasis
   - Records distance from focus node for each included node

3. **LocalGraphResult** type provides:
   - `data` - Annotated GraphData
   - `localNodeIds` - Set of node IDs within local graph
   - `localEdgeIds` - Set of edge IDs within local graph
   - `focusNode` - The focus node (or null)
   - `nodeDistances` - Map of node ID to distance from focus

4. **Exported from provider/index.ts** for use by renderers

---

### [x] Step: Create Graph Store
<!-- chat-id: ab552e16-c13b-44c2-8b4f-471854d00db9 -->

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

**Completed**: Implemented the Graph Store with Zustand + persist middleware (24 unit tests passing, 150 total tests):

1. **store/types.ts**: Complete type definitions
   - `GraphPhysicsOptions` with centerForce, repelForce, linkForce, linkDistance
   - `GraphDisplayOptions` with colorBy, nodeLabels, edgeLabels, nodeSize, edgeStyle
   - `GraphFilterOptions` with includeTags, includeRefs, includeHierarchy, showOrphans, supertagFilter, searchQuery
   - `GraphLocalGraphOptions` with enabled, focusNodeId, depth, linkTypes
   - `GraphViewOptions` with renderer ('2d' | '3d') and layout ('force' | 'hierarchical')
   - `WorkbenchGraphStore` combining state and actions

2. **store/defaults.ts**: Obsidian-inspired default values
   - Physics: centerForce=0.5, repelForce=200, linkForce=0.4, linkDistance=100
   - Display: colorBy='supertag', nodeLabels='hover', edgeStyle='animated', nodeSize='connections'
   - Filter: includeTags=false, includeRefs=true, includeHierarchy=true, showOrphans=true
   - `PHYSICS_CONSTRAINTS` for slider bounds (min, max, step)

3. **store/graph.store.ts**: Zustand store implementation
   - `useGraphStore` main hook with persist middleware (key: 'nxus-graph-options')
   - Selector hooks: `useGraphPhysics`, `useGraphDisplay`, `useGraphFilter`, `useGraphLocalGraph`, `useGraphView`
   - `graphStoreService` for imperative access outside React components
   - Convenience methods: `enableLocalGraph`, `disableLocalGraph`, `toggleRenderer`, `setFocusNode`

4. **store/index.ts**: Barrel export for all types, defaults, and hooks

5. **store/graph.store.test.ts**: Comprehensive unit tests (24 tests)
   - Initial state verification
   - Partial update testing for all option groups
   - Reset to defaults testing
   - Service method testing

---

## Phase 2: 2D Renderer

### [x] Step: Create 2D Node Components
<!-- chat-id: e9f3d323-3755-4eaa-819e-f8b2028db064 -->

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

**Completed**: Implemented 2D Node Components with React Flow integration:

1. **Installed @xyflow/react** dependency in nxus-workbench

2. **nodes/types.ts**: Shared types and utilities
   - `GraphNodeData` - Extends GraphNode with display options (nodeSize, labelVisibility, isHovered)
   - `GraphNodeProps` - Standard props interface for node components
   - `calculateNodeSize()` - Size nodes based on connections (0.8x - 2.5x base size)
   - `shouldShowLabel()` - Determine label visibility based on hover/focus state

3. **nodes/DetailedNode.tsx**: Card-style node component
   - Left border colored by supertag
   - Type indicator icon (Hash for tags, Circle for nodes)
   - Supertag badge with color styling
   - Connection counts (outgoing → teal, incoming ← violet)
   - Orphan indicator
   - States: selected (primary ring), focused (amber ring), highlighted, dimmed

4. **nodes/SimpleNode.tsx**: Minimalist dot-style node
   - Colored circle based on supertag
   - Size scales with connection count
   - Virtual node indicator (dashed inner ring)
   - Orphan indicator (dashed outer ring)
   - Centered handles for force-directed layout
   - Local hover state for label visibility
   - States: selected, focused, highlighted, dimmed

5. **nodes/index.ts**: Barrel export
   - `graphNodeTypes` map for React Flow registration
   - `GraphNodeType` type alias ('detailed' | 'simple')
   - All utility functions exported
- States display correctly
- Responsive to hover

---

### [x] Step: Create 2D Edge Components
<!-- chat-id: b44bfb3b-13df-4ee9-9ae3-3dcaea48b867 -->

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

**Completed**: Implemented 2D Edge Components with React Flow integration:

1. **edges/types.ts**: Shared types and utilities
   - `GraphEdgeData` - Extends GraphEdge with display options (edgeStyle, labelVisibility, isHovered)
   - `GraphEdgeProps` - Standard props interface for edge components
   - `EDGE_DIRECTION_COLORS` - Teal (#14b8a6) for outgoing, violet (#8b5cf6) for incoming
   - `EDGE_TYPE_COLORS` - Color mapping for dependency, backlink, reference, hierarchy, tag
   - `getEdgeColor()` - Get color based on direction or type
   - `getEdgeOpacity()` - Calculate opacity (1.0 highlighted, 0.6 normal, 0.15 dimmed)
   - `getEdgeStrokeWidth()` - 2.5px highlighted, 1.5px normal
   - `shouldShowEdgeLabel()` - Label visibility based on hover/highlight state

2. **edges/AnimatedEdge.tsx**: Edge with directional particle animation
   - Animated particles flowing along bezier path using SVG `<animateMotion>`
   - 2 particles normally, 3 when highlighted
   - Animation duration: 2s normal, 1.5s highlighted
   - Arrow marker at target end
   - Color-coded by direction (teal outgoing, violet incoming)
   - Opacity states: normal, highlighted, dimmed
   - Optional edge label with EdgeLabelRenderer

3. **edges/StaticEdge.tsx**: Simple static edge with arrow marker
   - Bezier path with arrow marker at target end
   - No animation - better performance for large graphs
   - Same color coding and opacity states as AnimatedEdge
   - Optional edge label

4. **edges/index.ts**: Barrel export
   - `graphEdgeTypes` map for React Flow registration
   - `GraphEdgeType` type alias ('animated' | 'static')
   - All utility functions and constants exported

**Tests**: All 150 tests passing

---

### [x] Step: Implement 2D Layout Hooks
<!-- chat-id: dde42521-76b1-4880-ad12-7bbc784ef1db -->

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

**Completed**: Implemented 2D Layout Hooks with dagre and d3-force integration:

1. **Added dependencies**: `d3-force`, `dagre`, `@types/d3-force`, `@types/dagre` to nxus-workbench

2. **use-dagre-layout.ts**: Hierarchical layout using dagre
   - `computeLayout()` - Static layout computation without updating React Flow
   - `runLayout()` - Compute and apply layout with fitView animation
   - Supports 4 directions: TB (top-bottom), BT, LR (left-right), RL
   - Configurable nodeSep, rankSep, margins
   - Handle positions auto-adjust based on direction
   - Position caching for smooth transitions

3. **use-force-layout.ts**: Force-directed layout using d3-force
   - Full physics integration with store parameters:
     - `centerForce` → forceCenter + forceX/forceY strength
     - `repelForce` → forceManyBody strength (negated)
     - `linkForce` → forceLink strength
     - `linkDistance` → forceLink distance
   - `computeLayout()` - Static mode (runs N iterations)
   - `startSimulation()` / `stopSimulation()` - Continuous mode with tick updates
   - `reheatSimulation()` - Restart simulation with high alpha
   - `updatePhysics()` - Live update physics on running simulation
   - `pinNode()` / `unpinNode()` - Fix node positions
   - Collision force prevents node overlap
   - Position caching across layout changes

4. **index.ts**: Unified layout selector hook
   - `useGraphLayout()` - Switches between dagre and force based on LayoutType
   - Common interface: `computeLayout()`, `runLayout()`, `clearCache()`
   - Exposes force-specific methods (simulation control, physics updates)
   - Exposes dagre-specific methods (direction control)
   - `layoutInfo` object with type and convenience booleans

**Tests**: All 150 existing tests pass

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

### [ ] Step: Add 3D Force Graph Dependency (Lazy-Loaded)

Install and configure 3d-force-graph with lazy loading to avoid bundle bloat.

**Tasks**:
1. Add dependency: `pnpm add 3d-force-graph --filter=nxus-workbench`
2. **Configure lazy loading**:
   - Use dynamic import: `const ForceGraph3D = await import('3d-force-graph')`
   - Only load when user switches to 3D view
   - Show loading indicator during import
3. Verify bundle size impact (3d-force-graph + three.js should not affect initial load)

**Verification**:
- Dependency installs correctly
- No type errors
- 3D dependencies NOT in initial bundle (check with bundle analyzer)
- Loading indicator shows during first 3D switch

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

Integrate sidebar and graph view into workbench with proper focus synchronization.

**Tasks**:
1. Modify `packages/nxus-workbench/src/route.tsx`:
   - Add view mode state ('list' | 'graph')
   - Add Sidebar component on left
   - Conditionally render NodeBrowser or GraphView
   - Pass selected node between views
2. **Implement focus synchronization**:
   - `selectedNodeId` is single source of truth
   - Selecting node in NodeBrowser → updates graph local focus
   - Clicking node in Graph → updates NodeBrowser selection + NodeInspector
   - Toggling local graph ON → uses current selectedNodeId as focus
3. Ensure supertag sidebar remains functional
4. Handle navigation from graph to node inspector

**Verification**:
- Sidebar navigation works
- Views switch correctly
- **Node selection syncs bidirectionally** (Browser ↔ Graph ↔ Inspector)
- Supertag sidebar still works
- Local graph focus follows selection

---

### [ ] Step: Integrate Existing Backlink Query & Add Lightweight Endpoint

Leverage existing server functions and add optimized endpoint for large graphs.

**Tasks**:
1. **Use existing `getBacklinksServerFn`** (already in `search-nodes.server.ts:210-256`):
   - Integrate into backlink-extractor.ts
   - Consider adding optional depth parameter for recursive backlinks
2. **Add lightweight graph structure endpoint** for performance:
   - Create `getGraphStructureServerFn` returning only `{ id, label, supertagId }` for nodes
   - Return edges as `{ source, target, type }` without full node assembly
   - Use for global graph view with 500+ nodes
3. Update Provider to choose between full/lightweight fetch based on node count

**Verification**:
- Backlinks integrate correctly with existing endpoint
- Lightweight endpoint returns correct structure
- Global graph performs well with 500+ nodes

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

---

## Future Work (Out of Scope)

### Code Consolidation with nxus-core
Once this implementation is stable, consider:
1. Extract `graph/provider` and `graph/store` to shared package (`@nxus/graph-core`)
2. Refactor `nxus-core/components/features/gallery/item-views/graph-view/` to use shared provider
3. Benefit: Consistent physics, visuals, and behavior across the entire app

### Additional Enhancements
- Web Worker for data transformation (when >500 nodes)
- Global graph with lightweight endpoint
- VR/AR renderer
- Graph export (SVG/PNG)
- AI-powered clustering
