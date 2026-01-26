# API Reference

## Main Components

### GraphView

Main orchestrator component for graph visualization.

```tsx
import { GraphView } from '@nxus/workbench/features/graph'

<GraphView
  nodes={nodes}                              // AssembledNode[]
  selectedNodeId={selectedId}                // string | null
  onNodeClick={(id) => ...}                  // (id: string) => void
  onNodeDoubleClick={(id) => ...}            // (id: string) => void
  onBackgroundClick={() => ...}              // () => void
  loading={isLoading}                        // boolean
/>
```

### LightweightGraphView

Optimized for large graphs (500+ nodes). Import directly to avoid server bundling:

```tsx
import { LightweightGraphView } from '@nxus/workbench/features/graph/LightweightGraphView'

<LightweightGraphView
  supertagSystemId={currentSupertag?.systemId}
  selectedNodeId={selectedId}
  onNodeClick={handleNodeClick}
  limit={1000}
/>
```

---

## Data Provider

### Types

```typescript
// Core node type
interface GraphNode {
  id: string
  label: string
  type: 'node' | 'tag' | 'supertag'
  isVirtual: boolean
  supertag: { id: string; name: string; color: string } | null
  outgoingCount: number
  incomingCount: number
  totalConnections: number
  isOrphan: boolean
  isMatched: boolean
  isFocused: boolean
  isInLocalGraph: boolean
  sourceNode: AssembledNode | null
}

// Core edge type
interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType        // 'dependency' | 'backlink' | 'reference' | 'hierarchy' | 'tag'
  direction: EdgeDirection  // 'outgoing' | 'incoming'
  label?: string
  isHighlighted: boolean
  isInLocalGraph: boolean
}

// Complete graph data
interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  supertagColors: Map<string, string>
  stats: GraphStats
}
```

### Hooks

```typescript
import {
  useGraphData,
  useLocalGraph,
  useLocalGraphResult,
} from '@nxus/workbench/features/graph'

// Transform nodes to graph data
const graphData = useGraphData(nodes, {
  includeTags: false,
  includeRefs: true,
  includeHierarchy: true,
  showOrphans: true,
  supertagFilter: [],
  searchQuery: '',
  localGraph: { enabled: false, focusNodeId: null, depth: 1, linkTypes: ['outgoing', 'incoming'] }
})

// Apply local graph filtering
const filtered = useLocalGraph(graphData, {
  focusNodeId: 'node-id',
  depth: 2,
  linkTypes: ['both'],
  mode: 'filter'  // or 'annotate'
})
```

### Edge Extractors

```typescript
import {
  extractAllEdges,
  extractDependencyEdges,
  extractBacklinkEdges,
  extractReferenceEdges,
  extractHierarchyEdges,
  createExtractionContext,
  buildBacklinkMap,
} from '@nxus/workbench/features/graph'
```

### Utilities

```typescript
import {
  // Colors
  getSupertagColor,
  generateSupertagColorMap,
  getDimmedColor,
  getHighlightedColor,

  // Statistics
  computeGraphStats,
  countConnectedComponents,
  getMostConnectedNodes,
  getEdgeTypeDistribution,

  // Tags
  synthesizeTags,
  mergeTagSynthesis,
} from '@nxus/workbench/features/graph'
```

---

## State Management

### Store Hooks

```typescript
import {
  useGraphStore,      // Full store access
  useGraphPhysics,    // Physics options
  useGraphDisplay,    // Display options
  useGraphFilter,     // Filter options
  useGraphLocalGraph, // Local graph options
  useGraphView,       // View options (renderer, layout)
  graphStoreService,  // Imperative access outside React
} from '@nxus/workbench/features/graph'

// Example usage
const { physics, setPhysics } = useGraphPhysics()
setPhysics({ centerForce: 0.7, repelForce: 250 })

const { display, setDisplay } = useGraphDisplay()
setDisplay({ edgeStyle: 'animated', nodeLabels: 'hover' })
```

### Option Types

```typescript
interface GraphPhysicsOptions {
  centerForce: number    // 0-1, default 0.5
  repelForce: number     // 0-500, default 200
  linkForce: number      // 0-1, default 0.4
  linkDistance: number   // 50-300, default 100
}

interface GraphDisplayOptions {
  colorBy: 'supertag' | 'type' | 'none'
  nodeLabels: 'always' | 'hover' | 'never'
  edgeLabels: 'always' | 'hover' | 'never'
  nodeSize: 'uniform' | 'connections'
  edgeStyle: 'solid' | 'animated'
}

interface GraphFilterOptions {
  includeTags: boolean
  includeRefs: boolean
  includeHierarchy: boolean
  showOrphans: boolean
  supertagFilter: string[]
  searchQuery: string
}

interface GraphLocalGraphOptions {
  enabled: boolean
  focusNodeId: string | null
  depth: 1 | 2 | 3
  linkTypes: ('outgoing' | 'incoming' | 'both')[]
}

interface GraphViewOptions {
  renderer: '2d' | '3d'
  layout: 'force' | 'hierarchical'
}
```

---

## Controls

```typescript
import {
  GraphControls,       // Main floating panel
  RendererSwitcher,    // 2D/3D toggle
  GraphLegend,         // Supertag color legend

  // Individual sections
  PhysicsSection,
  DisplaySection,
  FilterSection,
  LocalGraphSection,
  CollapsibleSection,
} from '@nxus/workbench/features/graph'

<GraphControls defaultOpen={false} />
<RendererSwitcher size="md" />
<GraphLegend supertagColors={colors} supertagNames={names} />
```

---

## 2D Renderer

```typescript
import {
  Graph2D,

  // Node components
  graphNodeTypes,
  DetailedNode,
  SimpleNode,

  // Edge components
  graphEdgeTypes,
  AnimatedEdge,
  StaticEdge,

  // Layout hooks
  useGraphLayout,
  useDagreLayout,
  useForceLayout,

  // Constants
  EDGE_DIRECTION_COLORS_2D,  // { outgoing: '#14b8a6', incoming: '#8b5cf6' }
} from '@nxus/workbench/features/graph'
```

---

## 3D Renderer

```typescript
import {
  Graph3D,
  Graph3DLoading,

  // Lazy loading
  loadForceGraph3D,
  isForceGraph3DLoaded,
  preloadForceGraph3D,
  useLazyForceGraph,

  // Graph instance
  use3DGraph,

  // Rendering utilities
  getNodeColor,
  getNodeSize,
  getEdgeColor3D,
  getParticleCount,

  // Constants
  EDGE_DIRECTION_COLORS_3D,
  NODE_COLORS,
  PARTICLE_SETTINGS,
} from '@nxus/workbench/features/graph'
```

---

## Defaults

```typescript
import {
  DEFAULT_PHYSICS,
  DEFAULT_DISPLAY,
  DEFAULT_FILTER,
  DEFAULT_LOCAL_GRAPH,
  DEFAULT_VIEW,
  DEFAULT_GRAPH_DATA_OPTIONS,
  PHYSICS_CONSTRAINTS,  // { centerForce: { min, max, step }, ... }
} from '@nxus/workbench/features/graph'
```
