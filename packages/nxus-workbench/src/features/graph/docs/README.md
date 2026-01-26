# Graph Viewer

Interactive graph visualization for exploring nodes and their relationships.

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

## Features

- **Dual Renderers**: 2D (React Flow) and 3D (3d-force-graph/WebGL)
- **Interactive Controls**: Physics, display, filtering, local graph mode
- **Edge Direction Visualization**: Animated particles, color-coded (teal=outgoing, violet=incoming)
- **Local Graph Mode**: BFS traversal with 1-3 degrees of separation
- **Supertag Colors**: Consistent palette with click-to-filter legend
- **Lazy 3D Loading**: WebGL dependencies loaded on demand
- **Lightweight Endpoint**: Optimized queries for 500+ nodes

## Documentation

- [API Reference](./api-reference.md) - Complete API documentation
- [User Guide](./user-guide.md) - How to use the graph viewer
- [Developer Guide](./developer-guide.md) - Architecture and extending
- [Performance Guide](./performance-guide.md) - Optimization and scaling

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Graph Data Provider                         │
│  AssembledNode[] → GraphNode[], GraphEdge[]                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Graph Options Store (Zustand)               │
│  Physics | Display | Filter | LocalGraph | View                 │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        ┌──────────────┐              ┌──────────────┐
        │  2D Renderer │              │  3D Renderer │
        │  (React Flow)│              │  (WebGL)     │
        └──────────────┘              └──────────────┘
```

## File Structure

```
features/graph/
├── provider/           # Data transformation (renderer-agnostic)
│   ├── types.ts
│   ├── use-graph-data.ts
│   ├── use-local-graph.ts
│   ├── extractors/     # Edge extraction modules
│   └── utils/          # Color, stats, tags
├── store/              # Zustand state management
├── renderers/
│   ├── graph-2d/       # React Flow renderer
│   └── graph-3d/       # 3d-force-graph renderer
├── controls/           # UI control components
├── GraphView.tsx       # Main orchestrator
└── docs/               # This documentation
```
