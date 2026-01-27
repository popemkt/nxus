# Developer Guide

Architecture details, extension points, and contribution guidelines.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Flow](#data-flow)
- [Adding New Features](#adding-new-features)
- [Creating Custom Renderers](#creating-custom-renderers)
- [Testing](#testing)
- [Best Practices](#best-practices)

---

## Architecture Overview

The graph system follows a strict separation of concerns:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Data Source    │────▶│    Provider      │────▶│    Renderer      │
│ (AssembledNode)  │     │  (GraphData)     │     │   (2D/3D/...)    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                │
                                ▼
                         ┌──────────────────┐
                         │     Store        │
                         │ (Zustand/Persist)│
                         └──────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Provider** | Data transformation, edge extraction, filtering | `provider/` |
| **Store** | Shared state, persistence, actions | `store/` |
| **Renderer** | Visual rendering, interactions | `renderers/` |
| **Controls** | UI for adjusting store settings | `controls/` |
| **Orchestrator** | Wiring everything together | `GraphView.tsx` |

### Key Design Decisions

1. **Provider is renderer-agnostic**: Returns `GraphNode[]` and `GraphEdge[]` that any renderer can consume
2. **Store is shared**: Both 2D and 3D read from the same Zustand store
3. **Renderers are pluggable**: Same interface, different implementations
4. **Edge extraction is modular**: Add new relationship types without modifying core

---

## Data Flow

### 1. Input: AssembledNode[]

```typescript
// From database/server
const nodes: AssembledNode[] = await fetchNodes()
```

### 2. Transformation: Provider

```typescript
// useGraphData transforms to renderer-agnostic format
const graphData = useGraphData(nodes, options)

// graphData structure:
{
  nodes: GraphNode[],      // Transformed nodes
  edges: GraphEdge[],      // Extracted edges
  supertagColors: Map,     // Consistent color mapping
  stats: GraphStats        // Computed statistics
}
```

### 3. Filtering: Local Graph (Optional)

```typescript
// Apply BFS filtering if local graph enabled
const filteredData = useLocalGraph(graphData, localGraphOptions)
```

### 4. Rendering

```typescript
// Renderer consumes GraphData
{view.renderer === '2d' && <Graph2D data={filteredData} />}
{view.renderer === '3d' && <Graph3D data={filteredData} />}
```

---

## Adding New Features

### Adding a New Edge Type

1. **Create extractor** in `provider/extractors/`:

```typescript
// my-edge-extractor.ts
import type { AssembledNode } from '@nxus/db'
import type { GraphEdge, EdgeExtractionContext } from '../types'

export function extractMyEdges(
  node: AssembledNode,
  context: EdgeExtractionContext
): GraphEdge[] {
  const edges: GraphEdge[] = []

  // Your extraction logic
  const targetId = node.properties['field:myRelation']
  if (targetId && context.nodeMap.has(targetId)) {
    edges.push({
      id: `${node.id}-mytype-${targetId}`,
      source: node.id,
      target: targetId,
      type: 'mytype',  // Add to EdgeType union
      direction: 'outgoing',
      isHighlighted: false,
      isInLocalGraph: true,
    })
  }

  return edges
}
```

2. **Update types** in `provider/types.ts`:

```typescript
export type EdgeType = 'dependency' | 'backlink' | 'reference' | 'hierarchy' | 'tag' | 'mytype'
```

3. **Register in extractors** `provider/extractors/index.ts`:

```typescript
import { extractMyEdges } from './my-edge-extractor'

export function extractAllEdges(...) {
  // ... existing extractors
  edges.push(...extractMyEdges(node, context))
}
```

### Adding a Store Option

1. **Add type** in `store/types.ts`:

```typescript
export interface GraphDisplayOptions {
  // ... existing
  myNewOption: 'value1' | 'value2'
}
```

2. **Add default** in `store/defaults.ts`:

```typescript
export const DEFAULT_DISPLAY: GraphDisplayOptions = {
  // ... existing
  myNewOption: 'value1',
}
```

3. **Use in components**:

```typescript
const { display, setDisplay } = useGraphDisplay()
setDisplay({ myNewOption: 'value2' })
```

### Adding a Control Section

1. **Create component** in `controls/sections/`:

```typescript
// MySection.tsx
export function MySection() {
  const { display, setDisplay } = useGraphDisplay()

  return (
    <CollapsibleSection title="My Settings" icon={MyIcon}>
      <SelectControl
        label="My Option"
        value={display.myNewOption}
        onChange={(value) => setDisplay({ myNewOption: value })}
        options={[
          { value: 'value1', label: 'Value 1' },
          { value: 'value2', label: 'Value 2' },
        ]}
      />
    </CollapsibleSection>
  )
}
```

2. **Add to GraphControls**:

```typescript
// controls/GraphControls.tsx
import { MySection } from './sections/MySection'

<MySection />
```

---

## Creating Custom Renderers

### Renderer Interface

Any renderer must accept `GraphData` and handle callbacks:

```typescript
interface GraphRendererProps {
  data: GraphData
  onNodeClick?: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onBackgroundClick?: () => void
}
```

### Example: Timeline Renderer

```typescript
// renderers/graph-timeline/Timeline.tsx
import type { GraphData } from '../../provider/types'
import { useGraphDisplay, useGraphPhysics } from '../../store'

export interface TimelineProps {
  data: GraphData
  onNodeClick?: (nodeId: string) => void
}

export function Timeline({ data, onNodeClick }: TimelineProps) {
  const { display } = useGraphDisplay()

  // Your timeline rendering logic
  // data.nodes has all the information you need

  return (
    <div className="timeline-container">
      {data.nodes.map(node => (
        <TimelineNode
          key={node.id}
          node={node}
          color={node.supertag?.color}
          onClick={() => onNodeClick?.(node.id)}
        />
      ))}
    </div>
  )
}
```

### Registering the Renderer

1. **Add to RendererType**:

```typescript
// store/types.ts
export type RendererType = '2d' | '3d' | 'timeline'
```

2. **Add to GraphView**:

```typescript
// GraphView.tsx
{view.renderer === 'timeline' && <Timeline data={graphData} ... />}
```

3. **Update RendererSwitcher**:

```typescript
// Add timeline button to the switcher
```

### Lazy Loading (Recommended for Heavy Renderers)

```typescript
// Use lazy loading for renderers with large dependencies
const Timeline = lazy(() => import('./renderers/graph-timeline/Timeline'))

// In GraphView:
<Suspense fallback={<LoadingSpinner />}>
  {view.renderer === 'timeline' && <Timeline data={graphData} />}
</Suspense>
```

---

## Testing

### Test Structure

```
provider/
├── extractors/
│   └── extractors.test.ts    # Edge extraction tests
├── use-graph-data.test.ts    # Data transformation tests
├── use-local-graph.test.ts   # BFS traversal tests
└── utils/
    └── utils.test.ts         # Utility function tests

store/
└── graph.store.test.ts       # Store tests
```

### Writing Tests

#### Provider Tests

```typescript
import { describe, it, expect } from 'vitest'
import { transformToGraphData } from './use-graph-data'

describe('transformToGraphData', () => {
  it('should transform nodes correctly', () => {
    const nodes = [/* mock AssembledNode[] */]
    const result = transformToGraphData(nodes, DEFAULT_GRAPH_DATA_OPTIONS)

    expect(result.nodes).toHaveLength(nodes.length)
    expect(result.edges).toBeDefined()
    expect(result.stats.totalNodes).toBe(nodes.length)
  })
})
```

#### Store Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from './graph.store'

describe('graph store', () => {
  beforeEach(() => {
    useGraphStore.getState().resetToDefaults()
  })

  it('should update physics options', () => {
    const { setPhysics } = useGraphStore.getState()
    setPhysics({ centerForce: 0.8 })

    expect(useGraphStore.getState().physics.centerForce).toBe(0.8)
  })
})
```

### Running Tests

```bash
# Run all tests
pnpm test --filter=nxus-workbench

# Run specific test file
pnpm test --filter=nxus-workbench -- provider/use-graph-data.test.ts

# Run with coverage
pnpm test --filter=nxus-workbench -- --coverage
```

---

## Best Practices

### 1. Keep Provider Pure

The provider should be pure data transformation:

```typescript
// ✅ Good - pure transformation
export function transformToGraphData(
  nodes: AssembledNode[],
  options: GraphDataOptions
): GraphData {
  // Pure transformation logic
}

// ❌ Bad - side effects in provider
export function transformToGraphData(...) {
  localStorage.setItem('lastGraph', ...) // Side effect!
  fetchMoreData() // Side effect!
}
```

### 2. Use Selector Hooks

Don't subscribe to entire store:

```typescript
// ✅ Good - specific selector
const { physics } = useGraphPhysics()

// ❌ Bad - subscribes to everything
const store = useGraphStore()
const physics = store.physics
```

### 3. Memoize Expensive Computations

```typescript
// In hooks
const graphData = useMemo(
  () => transformToGraphData(nodes, options),
  [nodes, options.includeTags, options.includeRefs, ...]
)

// In components
const expensiveValue = useMemo(
  () => computeExpensiveThing(data),
  [data]
)
```

### 4. Handle Edge Cases

```typescript
// Always handle empty/null states
if (!data.nodes.length) {
  return <EmptyState message="No nodes to display" />
}

if (!focusNodeId) {
  return data // Return full graph if no focus
}
```

### 5. Type Everything

```typescript
// ✅ Good - explicit types
interface MyComponentProps {
  data: GraphData
  onSelect: (id: string) => void
}

// ❌ Bad - implicit any
function MyComponent({ data, onSelect }) { ... }
```

### 6. Avoid Server Imports in Client

```typescript
// ✅ Good - types only
import type { LightweightGraphNode } from '../server/graph.types'

// ❌ Bad - imports server code
import { getGraphStructureServerFn } from '../server/graph.server'
```

---

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `GraphView.tsx` |
| Hooks | camelCase with `use-` | `use-graph-data.ts` |
| Utilities | kebab-case | `color-palette.ts` |
| Types | PascalCase | `types.ts` |
| Tests | Same as source + `.test` | `use-graph-data.test.ts` |
| Indexes | `index.ts` | `index.ts` |

---

## Common Patterns

### Compound Components

```typescript
// Export related components as a namespace
export const GraphControls = {
  Root: GraphControlsRoot,
  Section: CollapsibleSection,
  Physics: PhysicsSection,
  Display: DisplaySection,
  // ...
}

// Usage
<GraphControls.Root>
  <GraphControls.Physics />
  <GraphControls.Display />
</GraphControls.Root>
```

### Render Props for Flexibility

```typescript
interface GraphViewProps {
  renderNode?: (node: GraphNode) => ReactNode
  renderEdge?: (edge: GraphEdge) => ReactNode
}
```

### Factory Functions for Callbacks

```typescript
// 3D renderer uses factory pattern for callbacks
export function createLinkColorCallback(options: EdgeRenderOptions) {
  return (link: Graph3DLink) => getEdgeColor(link, options)
}
```
