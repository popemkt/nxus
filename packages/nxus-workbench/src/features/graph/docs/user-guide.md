# User Guide

How to use the Graph Viewer to visualize and explore your knowledge graph.

## Getting Started

Access the Graph Viewer from the workbench sidebar by clicking the **Graph** icon.

### What You'll See

- **Nodes**: Circles or cards representing your data items
- **Edges**: Lines connecting related nodes
- **Colors**: Each supertag has a distinct color
- **Size**: More connected nodes appear larger

---

## Switching Views

### 2D vs 3D

Use the toggle in the top-left corner:

| View | Best For |
|------|----------|
| **2D** | Precise navigation, reading labels, hierarchical layouts |
| **3D** | Dense graphs, depth perception, immersive exploration |

**Tip**: Hover over the 3D button to preload the WebGL engine.

---

## Navigation

### Mouse Controls

| Action | 2D | 3D |
|--------|----|----|
| Pan | Drag background | Drag |
| Zoom | Scroll wheel | Scroll wheel |
| Rotate | N/A | Right-drag |
| Select | Click node | Click node |
| Focus | Double-click | Double-click |

### Edge Colors

| Color | Direction | Meaning |
|-------|-----------|---------|
| **Teal** | → Outgoing | Source depends on target |
| **Violet** | ← Incoming | Target depends on source |

Animated dots flow along edges showing data direction.

---

## Control Panel

Click the **gear icon** (top-right) to open controls.

### Physics

| Slider | Effect |
|--------|--------|
| Center Force | Pull toward center |
| Repel Force | Push nodes apart |
| Link Force | Connection tightness |
| Link Distance | Target edge length |

### Display

| Option | Values |
|--------|--------|
| Color By | Supertag, Type, None |
| Node Labels | Always, Hover, Never |
| Node Size | By Connections, Uniform |
| Edge Style | Animated, Solid |

### Filters

| Toggle | Effect |
|--------|--------|
| Show Tags | Display tag nodes |
| Show References | Include reference relationships |
| Show Hierarchy | Include parent/child edges |
| Show Orphans | Display unconnected nodes |

---

## Local Graph Mode

Focus on a node and its neighborhood.

### Enable

1. Double-click a node, OR
2. Open controls → Local Graph → Toggle ON

### Depth

| Depth | Shows |
|-------|-------|
| 1 | Direct connections |
| 2 | Connections of connections |
| 3 | Up to 3 degrees away |

### Direction

- **Outgoing →**: What this node depends on
- **← Incoming**: What depends on this node
- **Both ↔**: All connections

---

## Supertag Legend

Click the legend (bottom-right) to filter by supertag:

- **Click**: Toggle filter for that supertag
- **Multiple clicks**: Combine filters
- **Clear**: Remove all filters

---

## Tips

### Find Important Nodes
- Enable "Node Size: By Connections"
- Use Local Graph depth 2 for context

### Reduce Clutter
- Disable "Show Orphans"
- Use supertag filter
- Set labels to "On Hover"

### Explore Relationships
- Enable animated edges
- Use outgoing-only to see dependencies
- Use incoming-only to see dependents

### Performance
- For 500+ nodes, use optimized loading automatically
- Use hierarchical layout for faster rendering
- Pause simulation after layout settles
