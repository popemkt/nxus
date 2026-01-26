# Performance Guide

Optimization strategies and scaling guidelines.

## Node Count Thresholds

| Nodes | Performance | Approach |
|-------|-------------|----------|
| < 100 | Excellent | All features enabled |
| 100-500 | Good | Default settings |
| 500-1000 | Moderate | Use lightweight endpoint |
| 1000-2000 | Acceptable | Local graph mode, static edges |
| > 2000 | May struggle | Consider clustering |

## Renderer Comparison

| Aspect | 2D (React Flow) | 3D (3d-force-graph) |
|--------|-----------------|---------------------|
| Max Nodes | ~2000 | ~3000+ |
| Initial Load | Fast | Slower (WebGL) |
| Memory | Lower | Higher |
| Best For | Detail work | Exploration |

---

## Current Optimizations

### 1. Lazy 3D Loading

3D dependencies (~500KB) load only when needed:

```typescript
const ForceGraph3D = await import('3d-force-graph')
```

### 2. Lightweight Endpoint

For large graphs, minimal data is fetched:

```typescript
// Full: ~2-5KB/node
// Lightweight: ~200 bytes/node
interface LightweightGraphNode {
  id, label, supertagId, supertagName, ownerId
}
```

### 3. Position Caching

Layout positions persist across filter/display changes.

### 4. Edge Deduplication

Edges are deduplicated by ID during extraction.

### 5. Union-Find

O(n * α(n)) for connected component counting.

### 6. Backlink Pre-computation

Single O(n) pass instead of O(n²).

---

## Scaling Guidelines

### 500-1000 Nodes

```tsx
// Use lightweight view
import { LightweightGraphView } from '.../LightweightGraphView'

<LightweightGraphView limit={1000} />
```

```typescript
// Reduce animation
setDisplay({ edgeStyle: 'solid' })

// Use local graph
setLocalGraph({ enabled: true, depth: 2 })
```

### 1000-2000 Nodes

```typescript
// Lower physics complexity
setPhysics({ repelForce: 100, linkForce: 0.2 })

// Use hierarchical layout
setView({ layout: 'hierarchical' })

// Filter aggressively
setFilter({ showOrphans: false, supertagFilter: ['important'] })
```

### 2000+ Nodes

Consider:
- Server-side clustering
- Viewport culling
- WebGL-only renderer (Sigma.js)

---

## Troubleshooting

### Slow Initial Load

- Check node count, use lightweight endpoint if > 500
- Disable animations during layout
- Use hierarchical layout

### Laggy Interactions

- Reduce nodes with filters
- Use static edges
- Pause simulation after settling

### High Memory

- Use lightweight endpoint
- Avoid multiple graph views
- Clear position cache: `layout.clearCache()`

### Layout Jumping

- Ensure position cache enabled
- Pin important nodes: `layout.pinNode(id)`
- Let simulation settle

---

## Configuration

### For Performance

```typescript
{
  physics: { centerForce: 0.3, repelForce: 100, linkForce: 0.2, linkDistance: 80 },
  display: { nodeLabels: 'hover', nodeSize: 'uniform', edgeStyle: 'solid' },
  filter: { includeTags: false, showOrphans: false },
  view: { renderer: '2d', layout: 'force' }
}
```

### For Visuals

```typescript
{
  physics: { centerForce: 0.5, repelForce: 200, linkForce: 0.4, linkDistance: 100 },
  display: { nodeLabels: 'hover', nodeSize: 'connections', edgeStyle: 'animated' },
  filter: { includeTags: true, includeRefs: true, showOrphans: true },
  view: { renderer: '3d', layout: 'force' }
}
```

---

## Future Optimizations

| Optimization | Status |
|--------------|--------|
| Web Worker for transforms | Stubbed |
| Viewport culling | Planned |
| Level of detail | Planned |
| Incremental updates | Planned |
