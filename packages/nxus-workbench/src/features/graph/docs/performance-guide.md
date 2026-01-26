# Performance Guide

Optimization strategies and scaling guidelines for the Graph Viewer.

---

## Table of Contents

- [Performance Characteristics](#performance-characteristics)
- [Current Optimizations](#current-optimizations)
- [Scaling Guidelines](#scaling-guidelines)
- [Troubleshooting](#troubleshooting)
- [Future Optimizations](#future-optimizations)

---

## Performance Characteristics

### Node Count Thresholds

| Nodes | Performance | Recommended Approach |
|-------|-------------|---------------------|
| < 100 | Excellent | Full features, all animations |
| 100-500 | Good | Default settings work well |
| 500-1000 | Moderate | Use lightweight endpoint, consider reducing animations |
| 1000-2000 | Acceptable | Local graph mode, static edges, reduce physics |
| > 2000 | May struggle | Consider clustering or alternative approaches |

### Renderer Comparison

| Aspect | 2D (React Flow) | 3D (3d-force-graph) |
|--------|-----------------|---------------------|
| **Max Nodes** | ~2000 | ~3000+ |
| **Initial Load** | Fast | Slower (WebGL init) |
| **Memory** | Lower | Higher |
| **Interactions** | Precise | Immersive |
| **Best For** | Detail work | Exploration |

---

## Current Optimizations

### 1. Lazy 3D Loading

The 3D renderer and its dependencies (~500KB) are only loaded when needed:

```typescript
// Lazy loader implementation
let cachedModule: ForceGraph3DModule | null = null

export async function loadForceGraph3D() {
  if (cachedModule) return cachedModule
  cachedModule = await import('3d-force-graph')
  return cachedModule
}
```

**Benefit**: Initial page load unaffected by 3D dependencies.

### 2. Lightweight Server Endpoint

For large graphs, minimal data is fetched:

```typescript
// Full node: ~2-5KB each
interface AssembledNode {
  id, label, type, properties, tags, permissions, ...
}

// Lightweight node: ~200 bytes each
interface LightweightGraphNode {
  id, label, supertagId, supertagName, ownerId
}
```

**Benefit**: 10-20x reduction in data transfer for large graphs.

### 3. Position Caching

Layout positions are cached to avoid recalculation:

```typescript
// Force layout maintains position cache
const positionCache = new Map<string, { x: number; y: number }>()

// Positions persist across:
// - Filter changes
// - Display option changes
// - Local graph toggling
```

**Benefit**: Smooth transitions, no layout jumping.

### 4. Edge Deduplication

Edges are deduplicated by ID during extraction:

```typescript
export function extractAllEdges(...): GraphEdge[] {
  const edgeMap = new Map<string, GraphEdge>()

  for (const edge of allExtractedEdges) {
    if (!edgeMap.has(edge.id)) {
      edgeMap.set(edge.id, edge)
    }
  }

  return Array.from(edgeMap.values())
}
```

**Benefit**: No duplicate edge rendering.

### 5. Union-Find for Components

Connected component counting uses efficient Union-Find:

```typescript
// O(n * α(n)) instead of O(n²) for DFS approach
export function countConnectedComponents(
  nodes: GraphNode[],
  edges: GraphEdge[]
): number {
  // Disjoint Set Union implementation
  const parent = new Map<string, string>()
  // ... union-find logic
}
```

**Benefit**: Fast stats computation even for large graphs.

### 6. Memoization

Heavy computations are memoized:

```typescript
// In useGraphData
const graphData = useMemo(
  () => transformToGraphData(nodes, options),
  [nodes, optionsDeps...]
)

// In useLocalGraph
const localGraphResult = useMemo(
  () => filterLocalGraph(data, options),
  [data, focusNodeId, depth, linkTypes]
)
```

**Benefit**: Avoids recalculation on unrelated state changes.

### 7. Backlink Map Pre-computation

Backlinks are pre-computed in single pass:

```typescript
// O(n) to build map instead of O(n²) for per-node scan
export function buildBacklinkMap(
  nodes: AssembledNode[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()

  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.properties)) {
      // Find UUID references in value
      // Add to backlink map
    }
  }

  return map
}
```

---

## Scaling Guidelines

### For 500-1000 Nodes

1. **Use LightweightGraphView**:
```tsx
import { LightweightGraphView } from '@nxus/workbench/features/graph/LightweightGraphView'

<LightweightGraphView
  supertagSystemId={currentSupertag}
  limit={1000}
  onNodeClick={handleClick}
/>
```

2. **Reduce Animation**:
```typescript
setDisplay({ edgeStyle: 'solid' })  // Disable particle animation
```

3. **Use Local Graph Mode**:
```typescript
setLocalGraph({
  enabled: true,
  focusNodeId: selectedId,
  depth: 2  // Show only 2 degrees
})
```

### For 1000-2000 Nodes

1. **Use Simple Node Style**:
```typescript
// SimpleNode is lighter than DetailedNode
// It renders as colored dots instead of cards
```

2. **Reduce Physics Complexity**:
```typescript
setPhysics({
  repelForce: 100,   // Lower repel = fewer calculations
  linkForce: 0.2,    // Weaker links = faster settling
})
```

3. **Consider Hierarchical Layout**:
```typescript
setView({ layout: 'hierarchical' })  // Static layout, no simulation
```

4. **Filter Aggressively**:
```typescript
setFilter({
  showOrphans: false,     // Hide isolated nodes
  includeTags: false,     // Don't synthesize tag nodes
  supertagFilter: ['important-type']  // Show only one type
})
```

### For 2000+ Nodes

Consider these approaches:

1. **Server-Side Clustering**: Group related nodes before sending to client
2. **Viewport Culling**: Only render visible portion
3. **Level of Detail**: Simplify distant nodes
4. **Alternative Renderer**: WebGL-only libraries (Sigma.js) for 10k+ nodes

---

## Troubleshooting

### Slow Initial Load

**Symptom**: Graph takes several seconds to appear

**Solutions**:
1. Check node count - use lightweight endpoint if > 500
2. Disable animations during initial layout
3. Use hierarchical layout for faster initial positioning

### Laggy Interactions

**Symptom**: Pan/zoom/drag feels sluggish

**Solutions**:
1. Reduce node count with filters
2. Switch to static edge style
3. In 3D, reduce particle count
4. Pause force simulation after layout settles

### High Memory Usage

**Symptom**: Browser tab using excessive RAM

**Solutions**:
1. Use lightweight endpoint (reduces node object size)
2. Avoid keeping multiple graph views open
3. Clear position cache when switching contexts:
```typescript
layout.clearCache()
```

### Layout Jumping

**Symptom**: Nodes jump around unexpectedly

**Solutions**:
1. Ensure position cache is enabled
2. Pin important nodes:
```typescript
layout.pinNode('important-node-id')
```
3. Let simulation settle before interacting

### 3D Loading Slow

**Symptom**: 3D view takes long to initialize

**Solutions**:
1. Preload on hover over 3D button (already implemented)
2. Show loading indicator during init (already implemented)
3. Consider 2D for quick tasks

---

## Future Optimizations

### Planned

| Optimization | Benefit | Status |
|--------------|---------|--------|
| Web Worker for data transform | Unblock main thread | Stubbed |
| Viewport culling (2D) | Render only visible | Not started |
| Level of detail | Simplify at zoom out | Not started |
| Incremental updates | Update only changes | Not started |

### Web Worker Implementation (Stubbed)

```typescript
// Current stub in use-graph-data.ts
export const LARGE_GRAPH_THRESHOLD = 500

export function isLargeGraph(nodeCount: number): boolean {
  return nodeCount > LARGE_GRAPH_THRESHOLD
}

// Future: Move transformation to worker
if (isLargeGraph(nodes.length)) {
  // Offload to Web Worker
  return await graphWorker.transform(nodes, options)
}
```

### Viewport Culling

Only render nodes in view:

```typescript
// Concept
const visibleNodes = nodes.filter(node => {
  const { x, y } = node.position
  return (
    x >= viewport.x - buffer &&
    x <= viewport.x + viewport.width + buffer &&
    y >= viewport.y - buffer &&
    y <= viewport.y + viewport.height + buffer
  )
})
```

### Clustering

Auto-group nodes by supertag or community detection:

```typescript
// Concept
interface Cluster {
  id: string
  label: string
  nodes: GraphNode[]
  expanded: boolean
}

// Collapsed cluster shows as single large node
// Click to expand and see contained nodes
```

---

## Benchmarking

### Measuring Performance

```typescript
// In development, measure transform time
console.time('transformToGraphData')
const graphData = transformToGraphData(nodes, options)
console.timeEnd('transformToGraphData')

// Measure render time
console.time('graphRender')
// ... render
console.timeEnd('graphRender')
```

### Key Metrics

| Metric | Target | Acceptable |
|--------|--------|------------|
| Transform time | < 100ms | < 500ms |
| Initial render | < 500ms | < 2s |
| Interaction latency | < 16ms | < 50ms |
| Memory per 100 nodes | < 5MB | < 20MB |

### Browser DevTools

1. **Performance Tab**: Record and analyze frame times
2. **Memory Tab**: Check for leaks during navigation
3. **Network Tab**: Verify lightweight endpoint usage
4. **React DevTools**: Check for unnecessary re-renders

---

## Configuration Recommendations

### For Best Performance

```typescript
// Store configuration for large graphs
{
  physics: {
    centerForce: 0.3,
    repelForce: 100,
    linkForce: 0.2,
    linkDistance: 80
  },
  display: {
    colorBy: 'supertag',
    nodeLabels: 'hover',
    edgeLabels: 'never',
    nodeSize: 'uniform',
    edgeStyle: 'solid'
  },
  filter: {
    includeTags: false,
    includeRefs: true,
    includeHierarchy: true,
    showOrphans: false,
    supertagFilter: []
  },
  view: {
    renderer: '2d',
    layout: 'force'  // or 'hierarchical' for static
  }
}
```

### For Best Visuals

```typescript
{
  physics: {
    centerForce: 0.5,
    repelForce: 200,
    linkForce: 0.4,
    linkDistance: 100
  },
  display: {
    colorBy: 'supertag',
    nodeLabels: 'hover',
    edgeLabels: 'hover',
    nodeSize: 'connections',
    edgeStyle: 'animated'
  },
  filter: {
    includeTags: true,
    includeRefs: true,
    includeHierarchy: true,
    showOrphans: true
  },
  view: {
    renderer: '3d',  // or '2d' for precision
    layout: 'force'
  }
}
```
