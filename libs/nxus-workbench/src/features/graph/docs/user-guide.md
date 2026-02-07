# User Guide

Learn how to use the Graph Viewer to visualize and explore your knowledge graph.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Switching Views](#switching-views)
- [Navigating the Graph](#navigating-the-graph)
- [Control Panel](#control-panel)
- [Local Graph Mode](#local-graph-mode)
- [Supertag Legend](#supertag-legend)

---

## Getting Started

The Graph Viewer shows your nodes and their relationships as an interactive network diagram. Access it from the workbench sidebar by clicking the **Graph** icon.

### What You'll See

- **Nodes**: Circles or cards representing your data items
- **Edges**: Lines connecting related nodes
- **Colors**: Each supertag has a distinct color for easy identification
- **Size**: Nodes with more connections appear larger

---

## Switching Views

### 2D vs 3D

Use the **renderer toggle** (top-left corner) to switch between views:

| View | Best For |
|------|----------|
| **2D** | Precise navigation, reading labels, hierarchical layouts |
| **3D** | Exploring dense graphs, understanding depth, immersive exploration |

**Tip**: Hover over the 3D button before clicking to preload the WebGL engine.

### Layout Modes (2D Only)

- **Force-Directed**: Nodes spread naturally based on connections
- **Hierarchical**: Organized top-to-bottom or left-to-right

---

## Navigating the Graph

### Mouse Controls

| Action | 2D | 3D |
|--------|----|----|
| **Pan** | Click + drag on background | Click + drag |
| **Zoom** | Scroll wheel | Scroll wheel |
| **Rotate** | N/A | Right-click + drag |
| **Select Node** | Click node | Click node |
| **Focus Node** | Double-click node | Double-click node |

### Node Interactions

- **Single Click**: Select the node (highlights in inspector)
- **Double Click**: Focus on this node (enables local graph mode)
- **Hover**: Show label (if set to "on hover")

### Edge Visual Cues

Edges show the direction of relationships:

| Color | Direction | Meaning |
|-------|-----------|---------|
| **Teal** (#14b8a6) | Outgoing → | Source depends on target |
| **Violet** (#8b5cf6) | ← Incoming | Target depends on source |

**Animated Particles**: When edge style is "animated", dots flow along edges showing data direction.

---

## Control Panel

Click the **gear icon** (top-right) to open the control panel.

### Physics Settings

Control how nodes arrange themselves in force-directed layout:

| Slider | Effect |
|--------|--------|
| **Center Force** | How strongly nodes pull toward center (higher = tighter cluster) |
| **Repel Force** | How strongly nodes push apart (higher = more spread) |
| **Link Force** | How tightly connected nodes stay together |
| **Link Distance** | Target length of edge lines in pixels |

**Quick Tips**:
- Dense graph? Increase **Repel Force**
- Too scattered? Increase **Center Force**
- Edges too long? Decrease **Link Distance**

### Display Options

| Option | Values | Description |
|--------|--------|-------------|
| **Color By** | Supertag, Type, None | What determines node color |
| **Node Labels** | Always, Hover, Never | When to show node names |
| **Node Size** | By Connections, Uniform | Size based on link count |
| **Edge Style** | Animated, Solid | Show particle animation on edges |

### Filter Options

| Toggle | Effect |
|--------|--------|
| **Show Tags** | Display tag nodes as separate items |
| **Show References** | Include reference-type relationships |
| **Show Hierarchy** | Include parent/child relationships |
| **Show Orphans** | Display nodes with no connections |

**Reset**: Click "Reset to Defaults" to restore all settings.

---

## Local Graph Mode

Focus on a specific node and its neighborhood.

### Enabling Local Graph

1. **Double-click** a node, OR
2. Open control panel → **Local Graph** section → toggle ON
3. Select a focus node

### Depth Control

Control how many degrees of separation to show:

| Depth | Shows |
|-------|-------|
| **1** | Direct connections only |
| **2** | Connections of connections |
| **3** | Up to 3 degrees away |

### Link Direction Filter

Choose which relationship directions to follow:

- **Outgoing →**: Follow links where focus node depends on others
- **← Incoming**: Follow links where others depend on focus node
- **Both ↔**: Follow all connections

### Visual Indicators

In local graph mode:
- **Focus Node**: Highlighted with amber ring
- **Direct Connections**: Slightly highlighted
- **Included Nodes**: Normal visibility
- **Excluded Nodes**: Dimmed (if in annotate mode)

### Clearing Focus

- Click "Clear Focus" button in Local Graph section, OR
- Click on the graph background

---

## Supertag Legend

The **legend** (bottom-right) shows which color represents each supertag.

### Features

- **Color Swatches**: Quick visual reference
- **Click to Filter**: Click a supertag to show only those nodes
- **Multiple Filters**: Click multiple to combine filters
- **Badge**: Shows count of active filters
- **Clear All**: Remove all supertag filters

### Using Supertag Filters

1. Click a supertag in the legend → Only those nodes shown
2. Click another → Both supertags shown
3. Click same supertag again → Remove from filter
4. Click "Clear" → Show all supertags

---

## Keyboard Shortcuts (Coming Soon)

Future versions will include:

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle through nodes |
| `Enter` | Select/focus current node |
| `Escape` | Clear selection |
| `Arrow keys` | Pan camera |
| `+` / `-` | Zoom in/out |
| `R` | Reset view |

---

## Tips & Tricks

### Finding Important Nodes

- Enable **Node Size: By Connections** to spot highly-connected hubs
- Use **Local Graph** depth 2 to see a node's context

### Reducing Visual Clutter

- Disable **Show Orphans** to hide isolated nodes
- Use **Supertag Filter** to focus on one type
- Set **Node Labels: On Hover** for cleaner view

### Exploring Relationships

- Enable **Animated** edge style to see data flow direction
- Use **Local Graph** with outgoing-only to see what a node depends on
- Use incoming-only to see what depends on a node

### Performance

- For graphs with 500+ nodes, the system automatically uses optimized loading
- In 2D, use **Hierarchical** layout for faster initial rendering
- In 3D, pause simulation after layout settles to save CPU
