# Developer Guide

Architecture, extension points, and contribution guidelines.

## Architecture

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

### Design Principles

1. **Provider is renderer-agnostic**: Returns `GraphNode[]` and `GraphEdge[]`
2. **Store is shared**: Both renderers use same Zustand store
3. **Renderers are pluggable**: Same interface, different implementations
4. **Edge extraction is modular**: Add relationship types without modifying core

---

## Adding Features

### New Edge Type

1. Create extractor in `provider/extractors/`:

```typescript
// my-edge-extractor.ts
export function extractMyEdges(
  node: AssembledNode,
  context: EdgeExtractionContext
): GraphEdge[] {
  const edges: GraphEdge[] = []
  const targetId = node.properties['field:myRelation']

  if (targetId && context.nodeMap.has(targetId)) {
    edges.push({
      id: `${node.id}-mytype-${targetId}`,
      source: node.id,
      target: targetId,
      type: 'mytype',
      direction: 'outgoing',
      isHighlighted: false,
      isInLocalGraph: true,
    })
  }
  return edges
}
```

2. Update `EdgeType` in `provider/types.ts`
3. Register in `extractors/index.ts`

### New Store Option

1. Add type in `store/types.ts`
2. Add default in `store/defaults.ts`
3. Use via hooks: `const { display, setDisplay } = useGraphDisplay()`

### New Control Section

```typescript
// controls/sections/MySection.tsx
export function MySection() {
  const { display, setDisplay } = useGraphDisplay()
  return (
    <CollapsibleSection title="My Settings" icon={MyIcon}>
      <SelectControl
        label="My Option"
        value={display.myOption}
        onChange={(v) => setDisplay({ myOption: v })}
        options={[...]}
      />
    </CollapsibleSection>
  )
}
```

---

## Creating Custom Renderers

Any renderer must accept `GraphData`:

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
export function Timeline({ data, onNodeClick }: TimelineProps) {
  const { display } = useGraphDisplay()

  return (
    <div className="timeline">
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

Register:
1. Add to `RendererType` in `store/types.ts`
2. Add to switch in `GraphView.tsx`
3. Update `RendererSwitcher`

---

## Testing

```bash
# Run all tests
pnpm test --filter=nxus-workbench

# Run specific file
pnpm test --filter=nxus-workbench -- use-graph-data.test.ts
```

### Test Structure

```
provider/
├── extractors/extractors.test.ts
├── use-graph-data.test.ts
├── use-local-graph.test.ts
└── utils/utils.test.ts
store/
└── graph.store.test.ts
```

---

## Best Practices

### Keep Provider Pure

```typescript
// Good - pure transformation
export function transformToGraphData(nodes, options): GraphData { ... }

// Bad - side effects
export function transformToGraphData(...) {
  localStorage.setItem(...)  // No!
}
```

### Use Selector Hooks

```typescript
// Good - specific selector
const { physics } = useGraphPhysics()

// Bad - subscribes to everything
const store = useGraphStore()
```

### Memoize Expensive Work

```typescript
const graphData = useMemo(
  () => transformToGraphData(nodes, options),
  [nodes, ...optionDeps]
)
```

### Avoid Server Imports in Client

```typescript
// Good - types only
import type { LightweightGraphNode } from '../server/graph.types'

// Bad - imports server code
import { getGraphStructureServerFn } from '../server/graph.server'
```

---

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `GraphView.tsx` |
| Hooks | camelCase + `use-` | `use-graph-data.ts` |
| Utilities | kebab-case | `color-palette.ts` |
| Tests | `.test.ts` suffix | `use-graph-data.test.ts` |
