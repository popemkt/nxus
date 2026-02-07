# API Reference

Complete API documentation for the Graph Viewer feature.

---

## Table of Contents

- [Main Components](#main-components)
- [Data Provider](#data-provider)
- [State Management](#state-management)
- [Controls](#controls)
- [2D Renderer](#2d-renderer)
- [3D Renderer](#3d-renderer)

---

## Main Components

### `GraphView`

The main orchestrator component that renders the graph visualization.

```tsx
import { GraphView } from '@nxus/workbench/features/graph'

<GraphView
  nodes={nodes}
  selectedNodeId={selectedId}
  onNodeClick={(id) => setSelectedId(id)}
  onNodeDoubleClick={(id) => navigate(`/nodes/${id}`)}
  onBackgroundClick={() => setSelectedId(null)}
  loading={isLoading}
/>
```

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `nodes` | `AssembledNode[]` | Yes | Array of nodes to visualize |
| `selectedNodeId` | `string \| null` | No | Currently selected node ID |
| `onNodeClick` | `(id: string) => void` | No | Called when a node is clicked |
| `onNodeDoubleClick` | `(id: string) => void` | No | Called when a node is double-clicked |
| `onBackgroundClick` | `() => void` | No | Called when background is clicked |
| `loading` | `boolean` | No | Show loading state |

---

### `LightweightGraphView`

Optimized component for large graphs (500+ nodes). Fetches minimal data directly from server.

```tsx
// Import directly to avoid bundling server dependencies
import { LightweightGraphView } from '@nxus/workbench/features/graph/LightweightGraphView'

<LightweightGraphView
  supertagSystemId={currentSupertag?.systemId}
  selectedNodeId={selectedId}
  onNodeClick={handleNodeClick}
  limit={1000}
/>
```

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `supertagSystemId` | `string` | No | Filter to specific supertag |
| `limit` | `number` | No | Maximum nodes to fetch (default: 500) |
| `selectedNodeId` | `string \| null` | No | Currently selected node ID |
| `onNodeClick` | `(id: string) => void` | No | Node click handler |
| `onNodeDoubleClick` | `(id: string) => void` | No | Node double-click handler |

---

## Data Provider

### Core Types

#### `GraphNode`

A node in the graph visualization.

```typescript
interface GraphNode {
  id: string
  label: string
  type: 'node' | 'tag' | 'supertag'
  isVirtual: boolean

  supertag: {
    id: string
    name: string
    color: string
  } | null

  // Connection metrics
  outgoingCount: number
  incomingCount: number
  totalConnections: number

  // State flags
  isOrphan: boolean
  isMatched: boolean
  isFocused: boolean
  isInLocalGraph: boolean

  // Original data (null for virtual nodes)
  sourceNode: AssembledNode | null
}
```

#### `GraphEdge`

An edge (connection) between two nodes.

```typescript
interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label?: string
  direction: EdgeDirection

  // State flags
  isHighlighted: boolean
  isInLocalGraph: boolean
}

type EdgeType = 'dependency' | 'backlink' | 'reference' | 'hierarchy' | 'tag'
type EdgeDirection = 'outgoing' | 'incoming'
```

#### `GraphData`

Complete graph data structure returned by the provider.

```typescript
interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  supertagColors: Map<string, string>
  stats: GraphStats
}

interface GraphStats {
  totalNodes: number
  totalEdges: number
  orphanCount: number
  connectedComponents: number
}
```

---

### Hooks

#### `useGraphData`

Transform AssembledNode[] to GraphData.

```typescript
import { useGraphData } from '@nxus/workbench/features/graph'

const graphData = useGraphData(nodes, {
  includeTags: false,
  includeRefs: true,
  includeHierarchy: true,
  supertagFilter: [],
  searchQuery: '',
  showOrphans: true,
  localGraph: {
    enabled: false,
    focusNodeId: null,
    depth: 1,
    linkTypes: ['outgoing', 'incoming'],
  },
})
```

#### `useLocalGraph`

Apply BFS traversal for local graph mode.

```typescript
import { useLocalGraph } from '@nxus/workbench/features/graph'

// Annotate mode - marks nodes/edges with isInLocalGraph flag
const annotatedData = useLocalGraph(graphData, {
  focusNodeId: selectedId,
  depth: 2,
  linkTypes: ['outgoing', 'incoming'],
  mode: 'annotate',
})

// Filter mode - returns only nodes within local graph
const filteredData = useLocalGraph(graphData, {
  focusNodeId: selectedId,
  depth: 2,
  linkTypes: ['both'],
  mode: 'filter',
})
```

#### `useLightweightGraph`

Fetch minimal graph data from server for large graphs.

```typescript
// Import directly to avoid server dependency bundling
import { useLightweightGraph } from '@nxus/workbench/features/graph/provider/use-lightweight-graph'

const { data, isLoading, error, refetch } = useLightweightGraph({
  supertagSystemId: 'task',
  limit: 1000,
  includeHierarchy: true,
  includeReferences: true,
})
```

---

### Edge Extractors

Modular functions to extract edges from different relationship types.

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

// Create context
const context = createExtractionContext(graphNodes, assembledNodes)

// Extract all edges
const edges = extractAllEdges(assembledNodes, context, {
  includeRefs: true,
  includeHierarchy: true,
})

// Or extract specific types
const depEdges = extractDependencyEdges(node, context)
const backlinkEdges = extractBacklinkEdges(node, context, backlinkMap)
```

---

### Utilities

#### Color Palette

```typescript
import {
  getSupertagColor,
  generateSupertagColorMap,
  getDimmedColor,
  getHighlightedColor,
  DEFAULT_SUPERTAG_COLORS,
} from '@nxus/workbench/features/graph'

// Get color for a supertag
const color = getSupertagColor('supertag-id')

// Generate colors for all supertags
const colorMap = generateSupertagColorMap(supertags)

// Get dimmed/highlighted variants
const dimmed = getDimmedColor(color)      // 50% opacity
const highlighted = getHighlightedColor(color)  // Brighter
```

#### Graph Statistics

```typescript
import {
  computeGraphStats,
  countConnectedComponents,
  computeConnectionMetrics,
  getMostConnectedNodes,
  getEdgeTypeDistribution,
} from '@nxus/workbench/features/graph'

const stats = computeGraphStats(nodes, edges)
// { totalNodes: 100, totalEdges: 250, orphanCount: 5, connectedComponents: 3 }

const components = countConnectedComponents(nodes, edges)
// 3

const topNodes = getMostConnectedNodes(nodes, 10)
// Top 10 most connected nodes

const distribution = getEdgeTypeDistribution(edges)
// { dependency: 50, backlink: 100, reference: 80, hierarchy: 20 }
```

---

## State Management

### Store Hooks

```typescript
import {
  useGraphStore,
  useGraphPhysics,
  useGraphDisplay,
  useGraphFilter,
  useGraphLocalGraph,
  useGraphView,
} from '@nxus/workbench/features/graph'

// Full store access
const store = useGraphStore()
store.setPhysics({ centerForce: 0.7 })

// Individual option groups
const { physics, setPhysics } = useGraphPhysics()
const { display, setDisplay } = useGraphDisplay()
const { filter, setFilter } = useGraphFilter()
const { localGraph, setLocalGraph } = useGraphLocalGraph()
const { view, setView } = useGraphView()
```

### Store Types

#### `GraphPhysicsOptions`

```typescript
interface GraphPhysicsOptions {
  centerForce: number    // 0-1, default 0.5
  repelForce: number     // 0-500, default 200
  linkForce: number      // 0-1, default 0.4
  linkDistance: number   // 50-300, default 100
}
```

#### `GraphDisplayOptions`

```typescript
interface GraphDisplayOptions {
  colorBy: 'supertag' | 'type' | 'none'
  nodeLabels: 'always' | 'hover' | 'never'
  edgeLabels: 'always' | 'hover' | 'never'
  nodeSize: 'uniform' | 'connections'
  edgeStyle: 'solid' | 'animated'
}
```

#### `GraphFilterOptions`

```typescript
interface GraphFilterOptions {
  includeTags: boolean
  includeRefs: boolean
  includeHierarchy: boolean
  showOrphans: boolean
  supertagFilter: string[]
  searchQuery: string
}
```

#### `GraphLocalGraphOptions`

```typescript
interface GraphLocalGraphOptions {
  enabled: boolean
  focusNodeId: string | null
  depth: 1 | 2 | 3
  linkTypes: ('outgoing' | 'incoming' | 'both')[]
}
```

#### `GraphViewOptions`

```typescript
interface GraphViewOptions {
  renderer: '2d' | '3d'
  layout: 'force' | 'hierarchical'
}
```

### Service (Outside React)

```typescript
import { graphStoreService } from '@nxus/workbench/features/graph'

// Get current state
const state = graphStoreService.getState()

// Update from outside React
graphStoreService.setPhysics({ repelForce: 300 })
graphStoreService.enableLocalGraph('node-123', 2)
graphStoreService.toggleRenderer()
```

---

## Controls

### `GraphControls`

Floating control panel with all settings.

```typescript
import { GraphControls } from '@nxus/workbench/features/graph'

<GraphControls
  defaultOpen={false}
  className="custom-class"
/>
```

### `RendererSwitcher`

2D/3D toggle buttons.

```typescript
import { RendererSwitcher } from '@nxus/workbench/features/graph'

<RendererSwitcher size="md" />  // 'sm' | 'md'
```

### `GraphLegend`

Supertag color legend with click-to-filter.

```typescript
import { GraphLegend } from '@nxus/workbench/features/graph'

<GraphLegend
  supertagColors={graphData.supertagColors}
  supertagNames={supertagNameMap}
  defaultExpanded={true}
/>
```

### Individual Sections

```typescript
import {
  CollapsibleSection,
  PhysicsSection,
  DisplaySection,
  FilterSection,
  LocalGraphSection,
} from '@nxus/workbench/features/graph'

// Use sections individually for custom layouts
<CollapsibleSection title="Physics" icon={Atom} defaultExpanded>
  <PhysicsSection />
</CollapsibleSection>
```

---

## 2D Renderer

### `Graph2D`

React Flow-based 2D graph renderer.

```typescript
import { Graph2D } from '@nxus/workbench/features/graph'

<Graph2D
  data={graphData}
  onNodeClick={handleClick}
  onNodeDoubleClick={handleDoubleClick}
  onBackgroundClick={handleBgClick}
/>
```

### Node Components

```typescript
import {
  graphNodeTypes,
  DetailedNode,
  SimpleNode,
  calculateNodeSize,
  shouldShowLabel,
} from '@nxus/workbench/features/graph'

// Node types for React Flow
const nodeTypes = graphNodeTypes  // { detailed: DetailedNode, simple: SimpleNode }

// Calculate node size based on connections
const size = calculateNodeSize(node, { nodeSize: 'connections' })

// Determine if label should show
const show = shouldShowLabel(node, { labelVisibility: 'hover', isHovered: true })
```

### Edge Components

```typescript
import {
  graphEdgeTypes,
  AnimatedEdge,
  StaticEdge,
  EDGE_DIRECTION_COLORS_2D,
  getEdgeColor2D,
  getEdgeOpacity2D,
} from '@nxus/workbench/features/graph'

// Edge types for React Flow
const edgeTypes = graphEdgeTypes  // { animated: AnimatedEdge, static: StaticEdge }

// Colors
EDGE_DIRECTION_COLORS_2D.outgoing  // '#14b8a6' (teal)
EDGE_DIRECTION_COLORS_2D.incoming  // '#8b5cf6' (violet)
```

### Layout Hooks

```typescript
import {
  useGraphLayout,
  useDagreLayout,
  useForceLayout,
} from '@nxus/workbench/features/graph'

// Unified hook (recommended)
const layout = useGraphLayout(reactFlowInstance, setNodes, {
  type: 'force',  // 'force' | 'hierarchical'
  physics: {
    centerForce: 0.5,
    repelForce: 200,
    linkForce: 0.4,
    linkDistance: 100,
  },
})

// Run layout
layout.runLayout(nodes, edges)

// Force-specific methods
if (layout.isForce) {
  layout.startSimulation(nodes, edges)
  layout.pauseSimulation()
  layout.resumeSimulation()
  layout.reheatSimulation()
  layout.updatePhysics(newPhysics)
  layout.pinNode('node-id')
  layout.unpinNode('node-id')
}

// Dagre-specific methods
if (layout.isDagre) {
  layout.setDirection('TB')  // 'TB' | 'BT' | 'LR' | 'RL'
}
```

---

## 3D Renderer

### `Graph3D`

3d-force-graph WebGL renderer with lazy loading.

```typescript
import { Graph3D } from '@nxus/workbench/features/graph'

<Graph3D
  data={graphData}
  onNodeClick={handleClick}
  onNodeDoubleClick={handleDoubleClick}
  onBackgroundClick={handleBgClick}
/>
```

### Lazy Loading

```typescript
import {
  loadForceGraph3D,
  isForceGraph3DLoaded,
  preloadForceGraph3D,
  useLazyForceGraph,
} from '@nxus/workbench/features/graph'

// Preload on hover
<button onMouseEnter={() => preloadForceGraph3D()}>
  Switch to 3D
</button>

// Hook for loading state
const { ForceGraph3D, state, error, preload } = useLazyForceGraph({
  autoLoad: false,
  onLoad: () => console.log('3D loaded'),
  onError: (err) => console.error(err),
})

// state: 'idle' | 'loading' | 'loaded' | 'error'
```

### Node Rendering

```typescript
import {
  NODE_COLORS,
  getNodeColor,
  getNodeSize,
  getNodeOpacity,
  computeNodeVisuals,
  createNodeObject,
} from '@nxus/workbench/features/graph'

const visuals = computeNodeVisuals(node, {
  colorBy: 'supertag',
  nodeSize: 'connections',
  isHighlighted: false,
  isDimmed: false,
})
// { color: '#14b8a6', size: 8, opacity: 1 }
```

### Edge Rendering

```typescript
import {
  EDGE_DIRECTION_COLORS_3D,
  getEdgeColor3D,
  getEdgeWidth,
  getParticleCount,
  getParticleSpeed,
} from '@nxus/workbench/features/graph'

// Particle animation settings
PARTICLE_SETTINGS.count       // 2
PARTICLE_SETTINGS.speed       // 0.003
PARTICLE_SETTINGS.highlighted.count  // 3
PARTICLE_SETTINGS.highlighted.speed  // 0.005
```

### Graph Instance Control

```typescript
import { use3DGraph } from '@nxus/workbench/features/graph'

const graph = use3DGraph(containerRef, {
  data: graphData,
  physics: physicsOptions,
  onNodeClick: handleClick,
  onNodeHover: handleHover,
})

// Camera control
graph.focusOnNode('node-id')
graph.resetCamera()

// Simulation control
graph.pauseSimulation()
graph.resumeSimulation()
graph.reheatSimulation()
```

---

## Default Values

```typescript
import {
  DEFAULT_PHYSICS,
  DEFAULT_DISPLAY,
  DEFAULT_FILTER,
  DEFAULT_LOCAL_GRAPH,
  DEFAULT_VIEW,
  PHYSICS_CONSTRAINTS,
} from '@nxus/workbench/features/graph'

DEFAULT_PHYSICS
// { centerForce: 0.5, repelForce: 200, linkForce: 0.4, linkDistance: 100 }

DEFAULT_DISPLAY
// { colorBy: 'supertag', nodeLabels: 'hover', edgeLabels: 'hover',
//   nodeSize: 'connections', edgeStyle: 'animated' }

DEFAULT_FILTER
// { includeTags: false, includeRefs: true, includeHierarchy: true,
//   showOrphans: true, supertagFilter: [], searchQuery: '' }

PHYSICS_CONSTRAINTS
// { centerForce: { min: 0, max: 1, step: 0.05 }, ... }
```
