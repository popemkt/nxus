# Graph Viewer and Controls

A comprehensive, modular graph visualization system for the Nxus Workbench. Visualize and explore your knowledge graph with 2D and 3D renderers, interactive controls, and powerful filtering capabilities.

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Installation](#installation)

---

## Quick Start

```tsx
import { GraphView } from '@nxus/workbench/features/graph'

function MyComponent() {
  const { data: nodes } = useNodes()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <GraphView
      nodes={nodes}
      selectedNodeId={selectedId}
      onNodeClick={(id) => setSelectedId(id)}
      onNodeDoubleClick={(id) => navigate(`/nodes/${id}`)}
    />
  )
}
```

---

## Features

### Dual Renderers
- **2D (React Flow)**: Force-directed and hierarchical layouts, animated edges, minimap
- **3D (3d-force-graph)**: WebGL rendering, orbit camera, depth perception

### Interactive Controls
- **Physics Sliders**: Center force, repel force, link force, link distance
- **Display Options**: Color by supertag, label visibility, node sizing, edge animation
- **Filtering**: Show/hide tags, references, hierarchy, orphans
- **Local Graph Mode**: BFS traversal with 1-3 degrees of separation

### Visual Feedback
- **Edge Direction**: Teal for outgoing, violet for incoming
- **Animated Particles**: Show data flow direction
- **Supertag Colors**: Consistent palette across views
- **Connection-based Sizing**: More connected = larger

### Performance
- **Lazy 3D Loading**: WebGL dependencies loaded on demand
- **Lightweight Endpoint**: Optimized queries for 500+ nodes
- **Position Caching**: Smooth transitions between layouts

---

## Architecture

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

### Design Principles

1. **Provider is renderer-agnostic**: Returns plain `GraphNode[]` and `GraphEdge[]`
2. **Store is shared**: Both renderers read from the same Zustand store
3. **Controls are shared**: Single control panel works for both renderers
4. **Renderers are pluggable**: Easy to add timeline, matrix, or other views

---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](./api-reference.md) | Complete API documentation for all exports |
| [User Guide](./user-guide.md) | How to use the graph viewer features |
| [Developer Guide](./developer-guide.md) | Architecture, extending, and contributing |
| [Performance Guide](./performance-guide.md) | Optimization strategies and scaling |

---

## Installation

The graph feature is part of `@nxus/workbench`. No additional installation needed.

### Dependencies Used

| Package | Purpose |
|---------|---------|
| @xyflow/react | 2D graph rendering |
| dagre | Hierarchical layout |
| d3-force | Force-directed simulation |
| 3d-force-graph | 3D WebGL graph |
| three | WebGL engine |

---

## File Structure

```
packages/nxus-workbench/src/features/graph/
├── provider/                      # Data layer (renderer-agnostic)
│   ├── types.ts                   # GraphNode, GraphEdge, GraphData
│   ├── use-graph-data.ts          # Main transformation hook
│   ├── use-local-graph.ts         # BFS filtering for local graph
│   ├── use-lightweight-graph.ts   # Hook for 500+ node graphs
│   ├── extractors/                # Edge extraction modules
│   └── utils/                     # Color, stats, tag utilities
│
├── store/                         # State management
│   ├── types.ts                   # Store types
│   ├── graph.store.ts             # Zustand store with persist
│   └── defaults.ts                # Default values
│
├── renderers/
│   ├── graph-2d/                  # React Flow renderer
│   │   ├── Graph2D.tsx
│   │   ├── nodes/                 # DetailedNode, SimpleNode
│   │   ├── edges/                 # AnimatedEdge, StaticEdge
│   │   └── layouts/               # Dagre, D3-force
│   │
│   └── graph-3d/                  # 3d-force-graph renderer
│       ├── Graph3D.tsx
│       ├── lazy-loader.ts
│       └── node/edge-renderer.ts
│
├── controls/                      # UI controls
│   ├── GraphControls.tsx          # Main control panel
│   ├── RendererSwitcher.tsx       # 2D/3D toggle
│   ├── GraphLegend.tsx            # Supertag colors
│   └── sections/                  # Physics, Filter, Display, LocalGraph
│
├── GraphView.tsx                  # Main orchestrator
├── LightweightGraphView.tsx       # For large graphs
└── index.ts                       # Barrel exports
```
