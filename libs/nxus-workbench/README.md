# @nxus/workbench

Node management UI components for Nxus applications. Provides a complete workbench for browsing, inspecting, and managing nodes.

## Installation

```bash
pnpm add @nxus/workbench
```

## Dependencies

- `@nxus/db` - Database layer
- `@nxus/ui` - UI components
- `react` / `react-dom` - Peer dependencies

## Usage

### Client Components

Import the workbench route or individual components:

```tsx
import {
  NodeWorkbenchRoute,
  NodeBrowser,
  NodeInspector,
  SupertagSidebar,
} from '@nxus/workbench'

// Full workbench route (includes all components)
function NodesPage() {
  return (
    <NodeWorkbenchRoute
      supertags={supertags}
      nodes={nodes}
      selectedNode={selectedNode}
      // ... props
    />
  )
}

// Or use individual components
function CustomLayout() {
  return (
    <div className="flex">
      <SupertagSidebar supertags={supertags} />
      <NodeBrowser nodes={nodes} />
      <NodeInspector node={selectedNode} />
    </div>
  )
}
```

### Server Functions

Import server functions from `/server`:

```typescript
import {
  // Node CRUD
  getNodeServerFn,
  getNodesBySupertagServerFn,
  updateNodeContentServerFn,

  // Search
  searchNodesServerFn,
  getSupertagsServerFn,
  getAllNodesServerFn,
  getBacklinksServerFn,

  // Legacy adapters
  nodeToItem,
  nodeToTag,
  nodeToCommand,
} from '@nxus/workbench/server'
```

## Components

### NodeWorkbenchRoute

Full-featured workbench combining all node management components.

```tsx
<NodeWorkbenchRoute
  supertags={AssembledNode[]}
  nodes={AssembledNode[]}
  selectedNode={AssembledNode | null}
  selectedSupertag={string | null}
  searchQuery={string}
  onSelectNode={(nodeId: string) => void}
  onSelectSupertag={(systemId: string | null) => void}
  onSearch={(query: string) => void}
  onUpdateContent={(nodeId: string, content: string) => void}
/>
```

### NodeBrowser

Grid/list view for browsing nodes.

```tsx
<NodeBrowser
  nodes={AssembledNode[]}
  selectedNodeId={string | null}
  onSelectNode={(nodeId: string) => void}
/>
```

### NodeInspector

Detailed view and editor for a single node.

```tsx
<NodeInspector
  node={AssembledNode}
  onUpdateContent={(nodeId: string, content: string) => void}
/>
```

### SupertagSidebar

Sidebar for filtering nodes by supertag.

```tsx
<SupertagSidebar
  supertags={AssembledNode[]}
  selectedSupertag={string | null}
  onSelectSupertag={(systemId: string | null) => void}
/>
```

### Shared Components

```tsx
import { NodeBadge, NodeLink, SupertagChip } from '@nxus/workbench'

<NodeBadge node={node} />
<NodeLink nodeId={nodeId} />
<SupertagChip supertag={supertag} />
```

## Server Functions

### Node Operations

```typescript
// Get a single node
const node = await getNodeServerFn({ nodeId: 'uuid-here' })

// Get nodes by supertag
const items = await getNodesBySupertagServerFn({
  supertagSystemId: 'supertag:item'
})

// Update node content
await updateNodeContentServerFn({
  nodeId: 'uuid-here',
  content: 'New content',
})
```

### Search Operations

```typescript
// Search nodes
const results = await searchNodesServerFn({ query: 'search term' })

// Get all supertags
const supertags = await getSupertagsServerFn()

// Get backlinks to a node
const backlinks = await getBacklinksServerFn({ nodeId: 'uuid-here' })
```

### Legacy Adapters

Convert nodes to legacy Item/Tag/Command types:

```typescript
import { nodeToItem, nodeToTag, nodeToCommand } from '@nxus/workbench/server'

// Convert a node to legacy Item type
const item = nodeToItem(node, {
  resolveTagRefs: (tagNodeIds) => [...],
  resolveCommands: (itemId) => [...],
})

// Convert a node to legacy Tag type
const tag = nodeToTag(node, {
  resolveParentId: (nodeId) => parentLegacyId,
})

// Convert a node to legacy ItemCommand type
const command = nodeToCommand(node)

// Batch convert with resolved references
const items = nodesToItems(nodes, tagLookup, commandsByItemId)
```

## Graph Viewer

Interactive graph visualization for exploring nodes and relationships.

```tsx
import { GraphView } from '@nxus/workbench/features/graph'

<GraphView
  nodes={nodes}
  selectedNodeId={selectedId}
  onNodeClick={(id) => setSelectedId(id)}
  onNodeDoubleClick={(id) => navigate(`/nodes/${id}`)}
/>
```

### Features

- **Dual Renderers**: 2D (React Flow) and 3D (3d-force-graph/WebGL)
- **Interactive Controls**: Physics, display, filtering, local graph mode
- **Edge Direction**: Animated particles (teal=outgoing, violet=incoming)
- **Local Graph Mode**: BFS traversal with 1-3 degrees of separation
- **Lazy 3D Loading**: WebGL dependencies loaded on demand

### Store Hooks

```typescript
import {
  useGraphPhysics,
  useGraphDisplay,
  useGraphFilter,
  useGraphLocalGraph,
  useGraphView,
} from '@nxus/workbench/features/graph'

const { physics, setPhysics } = useGraphPhysics()
setPhysics({ centerForce: 0.7 })
```

### For Large Graphs (500+ nodes)

```tsx
// Import directly to avoid server bundling
import { LightweightGraphView } from '@nxus/workbench/features/graph/LightweightGraphView'

<LightweightGraphView
  supertagSystemId="task"
  limit={1000}
  onNodeClick={handleClick}
/>
```

See [Graph Viewer Documentation](./src/features/graph/docs/README.md) for full API reference.

## Testing

```bash
pnpm test
```
