# Technical Specification: Modular Graph System for Workbench

## Task Difficulty Assessment: **Hard**

This is a hard task because:
- Requires designing a modular, extensible architecture from scratch
- Multiple renderers (2D and 3D) sharing a common data layer
- Complex data transformations (nodes, edges, backlinks, refs)
- Performance considerations for large graphs
- Rich UX with physics controls, filtering, local graph mode

---

## 1. Technical Context

### Language & Framework
- **Language**: TypeScript 5.7+
- **Framework**: React 19 with Vite 7
- **State Management**: Zustand 5.0
- **Routing**: TanStack Router

### Existing Dependencies (to reuse)
- **@xyflow/react** (v12.10.0) - 2D graph rendering
- **dagre** (v0.8.5) - Hierarchical layout
- **d3-force** (v3.0.0) - Force-directed simulation

### New Dependency
- **3d-force-graph** - 3D WebGL graph rendering (~50KB)

### Reference Implementations Studied
1. **Obsidian** - Pixi.js, physics controls, local/global graph
2. **Tana-Helper** - 3d-force-graph, include tags toggle, refs as connections
3. **Anytype** - Type-based coloring, Flow mode

---

## 2. Architecture Overview

### Core Principle: Separation of Concerns

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
│  - Display: colorBy, showLabels, showOrphans                    │
│  - Filter: includeTags, includeRefs, supertagFilter             │
│  - LocalGraph: enabled, focusNodeId, depth, linkTypes           │
│  - Renderer: '2d' | '3d'                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        ┌──────────────┐              ┌──────────────┐
        │   2D View    │              │   3D View    │
        │  (@xyflow)   │              │ (3d-force)   │
        │              │              │              │
        │ - ReactFlow  │              │ - WebGL      │
        │ - Dagre      │              │ - 3D camera  │
        │ - D3-force   │              │ - Orbit ctrl │
        └──────────────┘              └──────────────┘
```

### Design Principles

1. **Provider is renderer-agnostic**: Returns plain `GraphNode[]` and `GraphEdge[]` that any renderer can consume
2. **Store is shared**: Both 2D and 3D read from the same Zustand store
3. **Controls are shared**: Single control panel works for both renderers
4. **Renderers are pluggable**: Easy to add new renderers (future: WebGPU, AR, etc.)

---

## 3. Data Model

### Core Types (`provider/types.ts`)

```typescript
// ============================================================================
// Graph Node (renderer-agnostic)
// ============================================================================
export interface GraphNode {
  id: string
  label: string
  type: 'node' | 'tag' | 'supertag'  // For include tags feature

  // Metadata
  supertag: {
    id: string
    name: string
    color: string
  } | null

  // Metrics (for sizing/importance)
  outgoingCount: number   // Dependencies
  incomingCount: number   // Backlinks
  totalConnections: number

  // State
  isOrphan: boolean
  isMatched: boolean      // Search/filter match
  isFocused: boolean      // Local graph focus
  isInLocalGraph: boolean // Within N degrees of focus

  // Original data reference
  sourceNode: AssembledNode
}

// ============================================================================
// Graph Edge (renderer-agnostic)
// ============================================================================
export interface GraphEdge {
  id: string
  source: string          // Node ID
  target: string          // Node ID

  // Edge metadata
  type: 'dependency' | 'backlink' | 'reference' | 'hierarchy' | 'tag'
  label?: string          // Optional label (field name)

  // Direction semantics
  direction: 'outgoing' | 'incoming'  // Relative to source

  // State
  isHighlighted: boolean  // Part of focused node's connections
  isInLocalGraph: boolean
}

// ============================================================================
// Graph Data (complete graph state)
// ============================================================================
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]

  // Computed metadata
  supertagColors: Map<string, string>  // Consistent color mapping
  stats: {
    totalNodes: number
    totalEdges: number
    orphanCount: number
    connectedComponents: number
  }
}

// ============================================================================
// Provider Options
// ============================================================================
export interface GraphDataOptions {
  // What to include
  includeTags: boolean        // Show tags as separate nodes
  includeRefs: boolean        // Treat references as connections
  includeHierarchy: boolean   // Show parent/child edges

  // Filtering
  supertagFilter: string[]    // Only show nodes with these supertags
  searchQuery: string         // Highlight matching nodes
  showOrphans: boolean        // Include disconnected nodes

  // Local graph
  localGraph: {
    enabled: boolean
    focusNodeId: string | null
    depth: 1 | 2 | 3
    linkTypes: ('outgoing' | 'incoming' | 'both')[]
  }
}
```

### Store Types (`store/types.ts`)

```typescript
export interface GraphPhysicsOptions {
  // Force simulation parameters (Obsidian-style)
  centerForce: number      // 0-1, default 0.5 - pull toward center
  repelForce: number       // 0-500, default 200 - push nodes apart
  linkForce: number        // 0-1, default 0.4 - connection tightness
  linkDistance: number     // 50-300, default 100 - target edge length
}

export interface GraphDisplayOptions {
  colorBy: 'supertag' | 'type' | 'none'
  nodeLabels: 'always' | 'hover' | 'never'
  edgeLabels: 'always' | 'hover' | 'never'
  nodeSize: 'uniform' | 'connections'  // Size by connection count
  edgeStyle: 'solid' | 'animated'      // Animated = directional particles
}

export interface GraphFilterOptions {
  includeTags: boolean
  includeRefs: boolean
  showOrphans: boolean
  supertagFilter: string[]  // Empty = show all
  searchQuery: string
}

export interface GraphLocalGraphOptions {
  enabled: boolean
  focusNodeId: string | null
  depth: 1 | 2 | 3
  linkTypes: ('outgoing' | 'incoming' | 'both')[]
}

export interface GraphViewOptions {
  renderer: '2d' | '3d'
  layout: 'force' | 'hierarchical'  // 2D only
}

export interface WorkbenchGraphState {
  physics: GraphPhysicsOptions
  display: GraphDisplayOptions
  filter: GraphFilterOptions
  localGraph: GraphLocalGraphOptions
  view: GraphViewOptions

  // Actions
  setPhysics: (options: Partial<GraphPhysicsOptions>) => void
  setDisplay: (options: Partial<GraphDisplayOptions>) => void
  setFilter: (options: Partial<GraphFilterOptions>) => void
  setLocalGraph: (options: Partial<GraphLocalGraphOptions>) => void
  setView: (options: Partial<GraphViewOptions>) => void
  resetToDefaults: () => void
}
```

---

## 4. File Structure

```
packages/nxus-workbench/src/
├── features/
│   └── graph/
│       │
│       ├── provider/                      # Data layer (renderer-agnostic)
│       │   ├── types.ts                   # GraphNode, GraphEdge, GraphData
│       │   ├── use-graph-data.ts          # Main transformation hook
│       │   ├── use-local-graph.ts         # BFS filtering for local graph
│       │   ├── use-graph-filter.ts        # Search/tag/orphan filtering
│       │   ├── extractors/
│       │   │   ├── dependency-extractor.ts   # field:dependencies
│       │   │   ├── backlink-extractor.ts     # Reverse lookups
│       │   │   ├── reference-extractor.ts    # Generic node refs
│       │   │   ├── hierarchy-extractor.ts    # field:parent
│       │   │   └── index.ts
│       │   ├── utils/
│       │   │   ├── color-palette.ts       # Consistent supertag colors
│       │   │   └── graph-stats.ts         # Compute stats
│       │   └── index.ts
│       │
│       ├── store/
│       │   ├── types.ts                   # Store interfaces
│       │   ├── graph.store.ts             # Zustand store
│       │   ├── defaults.ts                # Default option values
│       │   └── index.ts
│       │
│       ├── renderers/
│       │   ├── graph-2d/
│       │   │   ├── Graph2D.tsx            # Main 2D component
│       │   │   ├── nodes/
│       │   │   │   ├── DetailedNode.tsx   # Card-style node
│       │   │   │   ├── SimpleNode.tsx     # Dot node
│       │   │   │   └── index.ts
│       │   │   ├── edges/
│       │   │   │   ├── AnimatedEdge.tsx   # With directional particles
│       │   │   │   ├── StaticEdge.tsx     # Simple line
│       │   │   │   └── index.ts
│       │   │   ├── layouts/
│       │   │   │   ├── use-dagre-layout.ts
│       │   │   │   ├── use-force-layout.ts
│       │   │   │   └── index.ts
│       │   │   └── index.ts
│       │   │
│       │   ├── graph-3d/
│       │   │   ├── Graph3D.tsx            # Main 3D component
│       │   │   ├── use-3d-graph.ts        # 3d-force-graph wrapper
│       │   │   ├── node-renderer.ts       # Custom 3D node sprites
│       │   │   ├── edge-renderer.ts       # Custom 3D edge lines
│       │   │   └── index.ts
│       │   │
│       │   └── index.ts                   # Re-exports both
│       │
│       ├── controls/
│       │   ├── GraphControls.tsx          # Main control panel container
│       │   ├── sections/
│       │   │   ├── PhysicsSection.tsx     # Force sliders
│       │   │   ├── FilterSection.tsx      # Tags, refs, orphans toggles
│       │   │   ├── DisplaySection.tsx     # Labels, colors, sizing
│       │   │   ├── LocalGraphSection.tsx  # Focus node, depth, link types
│       │   │   └── index.ts
│       │   ├── RendererSwitcher.tsx       # 2D/3D toggle
│       │   ├── GraphLegend.tsx            # Supertag color legend
│       │   └── index.ts
│       │
│       ├── GraphView.tsx                  # Main container (orchestrates all)
│       └── index.ts
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                    # Discord-style icon sidebar
│   │   ├── SidebarIcon.tsx                # Individual icon button
│   │   └── index.ts
│   └── ... (existing components)
│
├── routes/
│   └── workbench.tsx                      # Updated route with sidebar
│
└── ... (existing files)
```

---

## 5. Edge Direction UX Design

### Visual Language

**Edges show data flow direction:**
- **Arrow markers** at the target end of each edge
- **Animated particles** flowing along the edge (like data packets)
  - Outgoing: particles flow from source → target
  - Incoming: particles flow from target → source

**On node hover/focus:**
- Outgoing edges: highlighted in **teal/cyan** (#06b6d4)
- Incoming edges: highlighted in **violet** (#8b5cf6)
- Unrelated edges: dimmed to 20% opacity

**In local graph mode:**
- Edges within the local graph: full opacity
- Edges outside: hidden or very faint

### Implementation

```typescript
// Edge component receives direction context
interface EdgeProps {
  edge: GraphEdge
  isHighlighted: boolean
  highlightType: 'outgoing' | 'incoming' | null
}

// Particle animation via CSS or requestAnimationFrame
// - Small circles moving along path
// - Speed indicates "data flow"
```

---

## 6. Sidebar Design (Discord-style)

### Layout

```
┌──────┬────────────────────────────────────────────────────┐
│ ICON │                                                    │
│ BAR  │              MAIN CONTENT AREA                     │
│      │                                                    │
│ [📋] │  ┌──────────────┐  ┌─────────────────────────────┐ │
│ [🔗] │  │  Supertag    │  │                             │ │
│ [⚙️] │  │  Sidebar     │  │     NodeBrowser / Graph     │ │
│      │  │  (existing)  │  │                             │ │
│      │  │              │  │                             │ │
│      │  └──────────────┘  └─────────────────────────────┘ │
│      │                                                    │
└──────┴────────────────────────────────────────────────────┘

Icons:
📋 = List view (NodeBrowser)
🔗 = Graph view
⚙️ = Settings (optional)
```

### Sidebar Icons

| Icon | View | Description |
|------|------|-------------|
| `List` (Phosphor) | NodeBrowser | Current list/search view |
| `GraphIcon` (Phosphor) | GraphView | 2D/3D graph visualization |
| `GearSix` (Phosphor) | Settings | Optional: global settings |

---

## 7. Implementation Steps

### Phase 1: Foundation (Provider + Store)
1. Create provider types and interfaces
2. Implement edge extractors (dependency, backlink, reference)
3. Implement `useGraphData` hook
4. Create Zustand store with persistence

### Phase 2: 2D Renderer
5. Create 2D node components (Detailed, Simple)
6. Create 2D edge components (Animated, Static)
7. Implement layout hooks (Dagre, D3-force)
8. Build Graph2D main component

### Phase 3: Controls
9. Build control sections (Physics, Filter, Display, LocalGraph)
10. Create GraphControls container
11. Add RendererSwitcher and Legend

### Phase 4: 3D Renderer
12. Add 3d-force-graph dependency
13. Create Graph3D component
14. Implement custom node/edge renderers

### Phase 5: Integration
15. Create Sidebar component
16. Build GraphView orchestrator
17. Update workbench route
18. Add server-side backlink query

### Phase 6: Polish
19. Testing and bug fixes
20. Performance optimization
21. Documentation

---

## 8. Verification Approach

### Unit Tests
- Provider: Test data transformation with mock AssembledNode data
- Extractors: Test each edge type extraction
- Local graph: Test BFS at different depths
- Store: Test state updates and persistence

### Integration Tests
- 2D graph renders correctly
- 3D graph renders correctly
- Controls update both renderers
- Sidebar navigation works

### Manual Testing
- Test with 10, 50, 100, 500 nodes
- Test all physics sliders
- Test local graph at all depths
- Test filter combinations
- Test 2D ↔ 3D switching
- Test edge direction highlighting

### Commands
```bash
pnpm typecheck
pnpm lint
pnpm test --filter=nxus-workbench
pnpm build
```

---

## 9. Performance Considerations

### Large Graph Handling
- **Culling**: Only render nodes in viewport (2D)
- **LOD**: Simplify nodes when zoomed out
- **Pagination**: Limit initial load, fetch more on demand
- **Web Workers**: Offload force simulation to worker thread

### 3D Specific
- **Instanced rendering**: Reuse geometries for similar nodes
- **Texture atlases**: Combine node textures
- **Frustum culling**: Built into three.js

---

## 10. Future Extensibility

The modular architecture supports:
- **New renderers**: VR/AR, WebGPU, static export (SVG/PNG)
- **New edge types**: Custom relationship types
- **Plugins**: Third-party graph enhancements
- **AI features**: Auto-clustering, similarity edges
