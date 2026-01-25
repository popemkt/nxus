# Technical Specification: Graph Viewer and Controls for Workbench

## Task Difficulty Assessment: **Medium-Hard**

This is a medium-to-hard task because:
- Extends an existing well-architected graph view system
- Requires integration with a new data source (workbench nodes)
- Involves multiple components (graph canvas, controls, layout algorithms)
- Needs careful UX consideration to match Obsidian/Tana patterns
- Performance considerations for potentially large graphs

---

## 1. Technical Context

### Language & Framework
- **Language**: TypeScript 5.7+
- **Framework**: React 19 with Vite 7
- **State Management**: Zustand 5.0
- **Routing**: TanStack Router

### Key Dependencies
- **@xyflow/react** (v12.10.0) - React Flow for graph rendering
- **dagre** (v0.8.5) - Hierarchical layout algorithm
- **d3-force** (v3.0.0) - Force-directed layout simulation
- **@phosphor-icons/react** - Icon library
- **TailwindCSS v4** - Styling

### Existing Graph Implementation
The codebase already has a robust graph view in `packages/nxus-core/src/components/features/gallery/item-views/graph-view/`:
- `graph-canvas.tsx` - Main React Flow wrapper (762 lines)
- `graph-controls.tsx` - Control panel UI
- `components/item-node.tsx`, `simple-node.tsx`, `command-node.tsx` - Node types
- `components/dependency-edge.tsx`, `force-arrow-edge.tsx` - Edge types
- `hooks/use-graph-nodes.ts`, `use-graph-layout.ts` - Layout utilities
- `stores/view-mode.store.ts` - Persisted graph options (Zustand)

### Target Package: nxus-workbench
Located at `packages/nxus-workbench/`, this is a Tana-inspired node exploration interface with:
- `NodeBrowser` - List/search panel
- `NodeInspector` - Detail panel
- `SupertagSidebar` - Filter sidebar
- Node-based data model with `AssembledNode` type

---

## 2. Research Summary: Obsidian, Tana, and Anytype Graph Views

### Obsidian Graph View Features
- **Rendering**: Pixi.js (WebGL) for performance (previously D3.js)
- **Dual modes**: Global graph (all notes) + Local graph (connections to current note)
- **Force physics controls**:
  - Center force (~0.48) - compactness
  - Repel force (~16.41) - node separation
  - Link force (~0.44) - connection tightness
  - Link distance (~198) - target spacing
- **Filtering**: Search files, show/hide tags, attachments, orphans, existing-only
- **Visual**: Node size by backlink count, color groups, directional arrows
- **Local graph**: Depth control (1st/2nd degree), link type filtering (incoming/outgoing/neighbor)

### Tana-Helper Visualizer
- **Library**: 3D Force-Directed Graph (vasturiano/3d-force-graph)
- **Approach**: Server-side processing, client-side rendering
- **Data**: Converts Tana JSON exports to `nodes[]` and `links[]`
- **Features**: File upload, browser filtering, 3D navigation

### Anytype Graph
- **Model**: Objects as nodes, Relations as edges
- **Features**: Type-based grouping, Flow mode (before/after links), icon/title display
- **Controls**: Drag to rearrange, filter by type, toggle unlinked

### Key Patterns to Adopt
1. **Physics controls** - Expose force simulation parameters (center, repel, link force, distance)
2. **Node sizing by importance** - Size by connection count (existing: dependents count)
3. **Local graph mode** - Focus on single node + N-degree connections
4. **Filter modes** - By supertag, by search, show orphans toggle
5. **Color coding** - By supertag or custom groups
6. **Smooth transitions** - Animate layout changes

---

## 3. Implementation Approach

### Strategy: Extend Existing Graph Infrastructure

Rather than building from scratch, we will:
1. Create workbench-specific adaptations of the existing graph components
2. Extend the GraphOptions store for workbench-specific settings
3. Add new features inspired by Obsidian (physics controls, local graph)

### Architecture Overview

```
packages/nxus-workbench/
├── src/
│   ├── components/
│   │   ├── graph-view/                     # NEW: Graph view for workbench
│   │   │   ├── WorkbenchGraphCanvas.tsx    # Main graph component
│   │   │   ├── WorkbenchGraphControls.tsx  # Enhanced controls
│   │   │   ├── components/
│   │   │   │   ├── workbench-node.tsx      # Node component
│   │   │   │   └── relation-edge.tsx       # Edge component
│   │   │   ├── hooks/
│   │   │   │   ├── use-workbench-graph.ts  # Node/edge creation
│   │   │   │   └── use-local-graph.ts      # Local graph filtering
│   │   │   └── index.ts
│   │   └── ... (existing components)
│   ├── stores/
│   │   └── workbench-graph.store.ts        # NEW: Graph-specific state
│   └── route.tsx                           # Update to include graph view
```

---

## 4. Source Code Structure Changes

### New Files to Create

#### 4.1 `packages/nxus-workbench/src/stores/workbench-graph.store.ts`
Graph state management for workbench:
```typescript
interface WorkbenchGraphOptions {
  // Layout
  layout: 'force' | 'hierarchical'

  // Physics controls (Obsidian-inspired)
  centerForce: number      // 0-1, default 0.5
  repelForce: number       // 0-500, default 200
  linkForce: number        // 0-1, default 0.4
  linkDistance: number     // 50-300, default 100

  // Display
  nodeStyle: 'detailed' | 'simple'
  showLabels: boolean
  colorBy: 'supertag' | 'none'
  nodeSizing: 'uniform' | 'connections'

  // Filtering
  showOrphans: boolean
  filterMode: 'highlight' | 'show-only'

  // Local graph
  localGraphMode: boolean
  localGraphDepth: 1 | 2 | 3
  localGraphLinkTypes: ('outgoing' | 'incoming' | 'both')[]

  // Interaction
  nodesLocked: boolean
}
```

#### 4.2 `packages/nxus-workbench/src/components/graph-view/WorkbenchGraphCanvas.tsx`
Main graph component adapted for AssembledNode data:
- Convert `AssembledNode[]` to React Flow nodes/edges
- Extract relationships from node properties (field:dependencies, backlinks)
- Support local graph mode (filter to N-degree connections)
- Expose physics parameters to D3 force simulation

#### 4.3 `packages/nxus-workbench/src/components/graph-view/WorkbenchGraphControls.tsx`
Enhanced control panel with:
- Physics sliders (center, repel, link force, distance)
- Local graph toggle + depth selector
- Supertag color legend
- Orphan visibility toggle
- Layout switcher

#### 4.4 `packages/nxus-workbench/src/components/graph-view/components/workbench-node.tsx`
Node component showing:
- Content (title)
- Supertag badge with color
- Connection count indicator
- Hover state with full details

#### 4.5 `packages/nxus-workbench/src/components/graph-view/components/relation-edge.tsx`
Edge component showing:
- Directional arrows
- Optional label (relation type)
- Animated state for force layout

#### 4.6 `packages/nxus-workbench/src/components/graph-view/hooks/use-workbench-graph.ts`
Hook to transform AssembledNode data:
```typescript
function useWorkbenchGraph(nodes: AssembledNode[], options: WorkbenchGraphOptions) {
  // Extract edges from node properties
  // - field:dependencies -> dependency edges
  // - Backlinks via property value matching
  // - field:parent -> hierarchy edges

  // Return: { flowNodes, flowEdges, supertagColors }
}
```

#### 4.7 `packages/nxus-workbench/src/components/graph-view/hooks/use-local-graph.ts`
Hook for local graph filtering:
```typescript
function useLocalGraph(
  allNodes: AssembledNode[],
  allEdges: Edge[],
  focusNodeId: string | null,
  depth: number,
  linkTypes: string[]
) {
  // BFS from focus node to depth N
  // Filter by link type (incoming/outgoing/both)
  // Return filtered nodes and edges
}
```

### Files to Modify

#### 4.8 `packages/nxus-workbench/src/route.tsx`
Add graph view as a fourth panel option or toggle:
- Add view mode switcher (list | graph)
- Render `WorkbenchGraphCanvas` when in graph mode
- Pass selected node for local graph focus

#### 4.9 `packages/nxus-workbench/src/server/search-nodes.server.ts`
May need to add endpoint for fetching node relationships:
- Get backlinks for a node
- Get N-degree connected nodes efficiently

---

## 5. Data Model / API Changes

### Node-to-Graph Mapping

| AssembledNode Property | Graph Representation |
|------------------------|---------------------|
| `id` | Node ID |
| `content` | Node label |
| `supertags[0]` | Node color/group |
| `properties['dependencies']` | Outgoing edges |
| Backlinks (query) | Incoming edges |
| `properties['parent']` | Hierarchy edge |

### Edge Types
1. **dependency** - From `field:dependencies` property
2. **backlink** - Reverse lookup (nodes referencing this node)
3. **hierarchy** - From `field:parent` property

### Backlink Query
To find backlinks, query `node_properties` where:
- `value` contains the target node's ID
- `fieldNodeId` is a node-type field (dependencies, parent, etc.)

---

## 6. Verification Approach

### Unit Tests
1. `use-workbench-graph.test.ts` - Test node/edge creation from AssembledNode
2. `use-local-graph.test.ts` - Test BFS filtering at various depths
3. `workbench-graph.store.test.ts` - Test state persistence

### Integration Tests
1. Graph renders with sample nodes
2. Local graph filters correctly when node selected
3. Physics controls update simulation
4. Layout switching works smoothly

### Manual Verification
1. Navigate to workbench route
2. Switch to graph view
3. Verify nodes display with correct supertag colors
4. Click node to enable local graph
5. Adjust physics sliders and observe changes
6. Switch between hierarchical and force layouts
7. Test search/filter integration

### Commands
```bash
# Type checking
pnpm typecheck

# Unit tests
pnpm test --filter=nxus-workbench

# Lint
pnpm lint

# Build
pnpm build
```

---

## 7. Implementation Steps

See updated `plan.md` for detailed breakdown.

---

## 8. Risk Assessment

### Technical Risks
1. **Performance with large graphs** - Mitigate with pagination, culling, simplified nodes
2. **Backlink query performance** - May need index optimization or caching
3. **React Flow + D3 force interaction** - Already solved in existing code

### UX Risks
1. **Complexity overload** - Start with simple controls, add advanced in dropdown
2. **Layout instability** - Use proper alpha decay and velocity damping

---

## 9. Future Enhancements (Out of Scope)

- 3D graph view (like tana-helper)
- Graph export/import
- Custom relationship types
- Graph-based node creation
- Mini-map enhancements
- Keyboard shortcuts for graph navigation
