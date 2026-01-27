# Graph Viewer and Controls - Implementation Report

## Summary

This document reports on the implementation of a comprehensive graph visualization system for the Nxus Workbench. The system enables users to visualize and explore their data as an interactive knowledge graph, inspired by tools like Obsidian, Tana-helper, and Anytype.

### Key Features Implemented

1. **Dual Renderer Support**: 2D (React Flow) and 3D (3d-force-graph/Three.js) visualizations
2. **Modular Data Provider**: Renderer-agnostic transformation of AssembledNode[] to GraphData
3. **Edge Extractors**: Automatic extraction of dependencies, backlinks, references, and hierarchies
4. **Local Graph Mode**: BFS-based ego network exploration with configurable depth (1-3 degrees)
5. **Interactive Controls**: Physics sliders, filter toggles, display options, and legend
6. **Discord-style Sidebar**: View switching between list and graph modes
7. **Focus Synchronization**: Bidirectional selection sync between NodeBrowser, Graph, and Inspector
8. **Lazy 3D Loading**: 3d-force-graph loaded only when needed to reduce initial bundle size
9. **Lightweight Graph Endpoint**: Optimized server endpoint for graphs with 500+ nodes

---

## Architecture

### Design Principles

The implementation follows a strict separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Graph Data Provider                         │
│  (Pure data transformation - renderer agnostic)                 │
│  - AssembledNode[] → GraphNode[], GraphEdge[]                   │
│  - Edge extraction: dependencies, backlinks, refs               │
│  - Filtering: supertags, search, orphans                        │
│  - Local graph: BFS traversal with depth control                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Graph Options Store                         │
│  (Shared state for all renderers - Zustand)                     │
│  - Physics: centerForce, repelForce, linkForce, linkDistance    │
│  - Display: colorBy, showLabels, nodeSize, edgeStyle            │
│  - Filter: includeTags, includeRefs, showOrphans                │
│  - LocalGraph: enabled, focusNodeId, depth, linkTypes           │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        ┌──────────────┐              ┌──────────────┐
        │   2D View    │              │   3D View    │
        │  (@xyflow)   │              │ (3d-force)   │
        │ - ReactFlow  │              │ - WebGL      │
        │ - Dagre      │              │ - 3D camera  │
        │ - D3-force   │              │ - Orbit ctrl │
        └──────────────┘              └──────────────┘
```

### File Structure

```
packages/nxus-workbench/src/features/graph/
├── provider/                      # Data layer (renderer-agnostic)
│   ├── types.ts                   # GraphNode, GraphEdge, GraphData
│   ├── use-graph-data.ts          # Main transformation hook
│   ├── use-local-graph.ts         # BFS filtering for local graph
│   ├── use-lightweight-graph.ts   # Hook for 500+ node graphs
│   ├── extractors/
│   │   ├── dependency-extractor.ts
│   │   ├── backlink-extractor.ts
│   │   ├── reference-extractor.ts
│   │   ├── hierarchy-extractor.ts
│   │   └── index.ts
│   └── utils/
│       ├── color-palette.ts
│       ├── graph-stats.ts
│       └── tag-synthesizer.ts
│
├── store/
│   ├── types.ts
│   ├── graph.store.ts             # Zustand store with persist
│   └── defaults.ts
│
├── renderers/
│   ├── graph-2d/
│   │   ├── Graph2D.tsx
│   │   ├── nodes/ (DetailedNode, SimpleNode)
│   │   ├── edges/ (AnimatedEdge, StaticEdge)
│   │   └── layouts/ (use-dagre-layout, use-force-layout)
│   │
│   └── graph-3d/
│       ├── Graph3D.tsx
│       ├── lazy-loader.ts
│       ├── use-3d-graph.ts
│       ├── node-renderer.ts
│       └── edge-renderer.ts
│
├── controls/
│   ├── GraphControls.tsx
│   ├── RendererSwitcher.tsx
│   ├── GraphLegend.tsx
│   └── sections/ (Physics, Filter, Display, LocalGraph)
│
├── GraphView.tsx                  # Main orchestrator
├── LightweightGraphView.tsx       # For large graphs
└── index.ts                       # Barrel exports
```

---

## Implementation Details

### Phase 1: Foundation

**Provider Types** (`provider/types.ts`)
- `GraphNode`: id, label, type, supertag, connection metrics, state flags
- `GraphEdge`: id, source, target, type, direction, state flags
- `GraphData`: nodes, edges, supertagColors map, stats

**Edge Extractors** (`provider/extractors/`)
- `dependency-extractor.ts`: Extracts from `field:dependencies` property
- `backlink-extractor.ts`: Finds incoming references using pre-computed backlink map
- `reference-extractor.ts`: Generic node-type properties with UUID pattern matching
- `hierarchy-extractor.ts`: Parent-child from `field:parent` and `ownerId`

**Data Provider Hook** (`provider/use-graph-data.ts`)
- Transforms AssembledNode[] to GraphData
- Supports filtering by supertag, search query, orphan visibility
- Computes connection metrics and graph statistics

**Local Graph Hook** (`provider/use-local-graph.ts`)
- BFS traversal with configurable depth (1-3)
- Direction filtering: outgoing, incoming, or both
- Annotates nodes/edges with `isInLocalGraph`, `isFocused`, `isHighlighted`

**Zustand Store** (`store/graph.store.ts`)
- Persists to localStorage with key `nxus-graph-options`
- Selector hooks for each option group
- Service methods for imperative access

### Phase 2: 2D Renderer

**Node Components** (`renderers/graph-2d/nodes/`)
- `DetailedNode`: Card-style with supertag badge and connection counts
- `SimpleNode`: Minimalist dot sized by connections

**Edge Components** (`renderers/graph-2d/edges/`)
- `AnimatedEdge`: SVG `<animateMotion>` particles along bezier path
- `StaticEdge`: Simple bezier with arrow marker
- Color-coded: teal (#14b8a6) for outgoing, violet (#8b5cf6) for incoming

**Layout Hooks** (`renderers/graph-2d/layouts/`)
- `use-dagre-layout.ts`: Hierarchical layout (TB, BT, LR, RL)
- `use-force-layout.ts`: d3-force simulation with physics params
- `useGraphLayout`: Unified hook that switches between layouts

### Phase 3: Controls

**Control Sections** (`controls/sections/`)
- `PhysicsSection`: Sliders for center/repel/link force and distance
- `FilterSection`: Toggles for tags, refs, hierarchy, orphans
- `DisplaySection`: Dropdowns for color, labels, size, edge style
- `LocalGraphSection`: Enable toggle, depth selector, link type checkboxes

**Container Components**
- `GraphControls`: Floating panel with all sections and reset button
- `RendererSwitcher`: 2D/3D segmented toggle with preload on hover
- `GraphLegend`: Supertag colors with click-to-filter

### Phase 4: 3D Renderer

**Lazy Loading** (`renderers/graph-3d/lazy-loader.ts`)
- Dynamic import: `await import('3d-force-graph')`
- Module caching (singleton pattern)
- `preloadForceGraph3D()` for background loading

**3D Graph Component** (`renderers/graph-3d/Graph3D.tsx`)
- Full physics integration with store parameters
- Node hover tooltip with supertag info
- Direction legend matching 2D colors
- Simulation pause/resume controls

### Phase 5: Integration

**Sidebar** (`components/layout/Sidebar.tsx`)
- Discord-style vertical icon bar (64px width)
- List and Graph icons with Phosphor
- Active state indicator bar

**GraphView Orchestrator** (`features/graph/GraphView.tsx`)
- Transforms AssembledNode[] using provider hooks
- Applies local graph filtering
- Renders Graph2D or Graph3D based on store
- Overlays RendererSwitcher, GraphControls, GraphLegend

**Route Integration** (`route.tsx`)
- View mode state ('list' | 'graph')
- Focus synchronization handlers
- Bidirectional selection sync

**Server Endpoints** (`server/graph.server.ts`)
- `getGraphStructureServerFn`: Lightweight endpoint for 500+ nodes
- `getBacklinksWithDepthServerFn`: Recursive backlinks with BFS
- `getEdgesBetweenNodesServerFn`: Edge-only queries

---

## Testing Results

All **150 unit tests** pass:

| Test Suite | Tests | Description |
|------------|-------|-------------|
| `extractors.test.ts` | 24 | Edge extraction logic |
| `use-graph-data.test.ts` | 27 | Data transformation |
| `use-local-graph.test.ts` | 33 | BFS traversal |
| `graph.store.test.ts` | 24 | Zustand store |
| `utils.test.ts` | 27 | Color, stats utilities |
| `adapters.test.ts` | 15 | Server adapters |

```
 Test Files  6 passed (6)
      Tests  150 passed (150)
   Duration  883ms
```

---

## Challenges and Solutions

### 1. Edge Direction Visualization

**Challenge**: Clearly showing data flow direction in a crowded graph.

**Solution**:
- Animated SVG particles flowing along edges
- Color coding: teal for outgoing, violet for incoming
- Arrow markers at target end
- Dimming unrelated edges on hover

### 2. 3D Bundle Size

**Challenge**: three.js and 3d-force-graph add ~500KB to the bundle.

**Solution**:
- Lazy loading via dynamic import
- Module caching to avoid re-importing
- Preload on hover over 3D button
- Loading indicator during first load

### 3. Large Graph Performance

**Challenge**: Full AssembledNode objects are expensive for 500+ nodes.

**Solution**:
- `LightweightGraphView` component
- `getGraphStructureServerFn` returns minimal data
- Only id, label, supertagId for nodes
- Only source, target, type for edges

### 4. Focus Synchronization

**Challenge**: Selection state must sync between multiple views.

**Solution**:
- Single source of truth: `selectedNodeId` in route
- Handlers update both selection and local graph focus
- useEffect auto-sets focus node when local graph is enabled

### 5. React Flow + D3-Force Integration

**Challenge**: Combining React Flow's managed state with d3-force simulation.

**Solution**:
- `useForceLayout` hook manages simulation lifecycle
- Updates React Flow nodes via `setNodes` on each tick
- `pinNode()`/`unpinNode()` for drag handling
- `updatePhysics()` for live parameter changes

---

## Performance Considerations

### Implemented

1. **Lazy 3D Loading**: 3d-force-graph loads only when needed
2. **Lightweight Endpoint**: Minimal data for large graphs
3. **Position Caching**: Layout positions cached across renders
4. **Memoization**: useGraphData and useLocalGraph heavily memoized
5. **Edge Deduplication**: extractAllEdges deduplicates by ID
6. **Union-Find**: O(n * α(n)) for connected component counting

### Future Optimization (Stubbed)

1. **Web Worker**: Threshold check at 500 nodes for offloading
2. **Viewport Culling**: Only render visible nodes in 2D
3. **Level of Detail**: Simplify nodes when zoomed out
4. **Incremental Updates**: Update only changed portions

---

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| @xyflow/react | ^12.10.0 | 2D graph rendering |
| dagre | ^0.8.5 | Hierarchical layout |
| d3-force | ^3.0.0 | Force-directed simulation |
| 3d-force-graph | ^1.79.0 | 3D WebGL graph |
| three | ^0.182.0 | WebGL engine |
| @types/dagre | ^0.7.x | TypeScript types |
| @types/d3-force | ^3.0.x | TypeScript types |
| @types/three | ^0.182.x | TypeScript types |

---

## Code Statistics

- **Files**: 57 TypeScript/TSX files
- **Lines of Code**: ~11,590 lines
- **Test Coverage**: 150 unit tests across 6 test suites
- **Components**: 15+ React components
- **Hooks**: 12+ custom hooks
- **Store Slices**: 5 option groups

---

## Future Improvements

### Short-term

1. **Keyboard Navigation**: Arrow keys to navigate nodes
2. **Export**: PNG/SVG export of current view
3. **Search Highlighting**: Visual emphasis on search matches
4. **Zoom Presets**: Quick zoom to fit, 100%, focus node

### Medium-term

1. **Web Worker**: Move data transformation off main thread
2. **Graph Algorithms**: Shortest path, centrality measures
3. **Custom Layouts**: Radial, circular, clustered
4. **Time-based View**: Show graph evolution over time

### Long-term

1. **Shared Package**: Extract to `@nxus/graph-core` for app-wide use
2. **AI Clustering**: Auto-group related nodes
3. **VR/AR Renderer**: Immersive graph exploration
4. **Collaborative**: Real-time multi-user graph editing

---

## Conclusion

The Graph Viewer and Controls feature provides a robust, performant, and extensible graph visualization system. The modular architecture with separated data provider, store, and renderers allows for easy maintenance and future enhancements. The dual 2D/3D renderer support gives users flexibility in how they explore their knowledge graph, while the comprehensive controls enable fine-tuned customization of the visualization.

The implementation successfully achieves the goal of creating a minimalistic yet powerful graph visualization tool, taking inspiration from Obsidian's clean design while adding unique features like animated directional edges and a Discord-style sidebar for view switching.
