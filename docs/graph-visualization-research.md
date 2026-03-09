# Graph Visualization Research

Research into advanced graph visualization techniques for exploring items, their relationships, and flexible groupings across any dimension (supertags, tags, categories, dependencies, custom properties).

## Design Principle: Flexible Grouping

Every visualization below should support grouping by **any item dimension**, not just supertag. The grouping system should be a first-class abstraction that all graph views consume.

### Grouping Dimensions

| Dimension | Source | Cardinality | Example Groups |
|---|---|---|---|
| Supertag | `item.types` | Low (~5) | Tool, Repo, Concept, HTML, TypeScript |
| Tag | `item.metadata.tags` | Medium (~10-50) | ai, cli, terminal, code-generation |
| Category | `item.metadata.category` | Medium (~10-20) | development tools, ai assistants, knowledge management |
| Dependency cluster | Computed from `item.dependencies` graph | Variable | "Node.js ecosystem", "Python ecosystem" |
| Install status | `item.status` | Low (3-4) | installed, not-installed, error |
| Platform | `item.platform` | Low (~3) | macos, linux, windows |
| Has docs | Computed from `item.docs` | Binary | with-docs, without-docs |
| Command count | Computed from `item.commands` | Bucketed | 0, 1-3, 4+ |
| Custom property | Any node property via `node.properties[fieldName]` | Variable | User-defined |

### Grouping API Shape

```typescript
interface GroupingDimension {
  id: string
  label: string
  /** Given an item, return the group key(s) it belongs to.
   *  Returns array because items can belong to multiple groups (e.g. multiple tags). */
  getGroups: (item: Item) => Array<{ key: string; label: string; color?: string }>
}

// Example dimensions
const supertagDimension: GroupingDimension = {
  id: 'supertag',
  label: 'Type',
  getGroups: (item) => item.types.map(t => ({ key: t, label: t })),
}

const tagDimension: GroupingDimension = {
  id: 'tag',
  label: 'Tag',
  getGroups: (item) => item.metadata.tags.map(t => ({ key: t.id, label: t.name })),
}

const categoryDimension: GroupingDimension = {
  id: 'category',
  label: 'Category',
  getGroups: (item) => [{ key: item.metadata.category, label: item.metadata.category }],
}
```

Items can belong to **multiple groups** in a single dimension (e.g. an item tagged both "ai" and "cli"). Visualizations must handle this — it's the core difference from simple clustering.

---

## Set Membership Visualizations

These answer: "What groups does an item belong to?" and "What items share group membership?"

### 1. Convex Hull Overlay

Draw colored translucent boundaries around nodes sharing group membership on the existing force-directed graph.

**How it works:**
- Compute the convex hull (or smooth contour) of all node positions belonging to each group
- Render as SVG paths behind the nodes
- Items in multiple groups appear inside multiple overlapping hulls

**Strengths:**
- Lowest-effort win — augments existing force graph
- Intuitive — groups look like "territories"
- Handles multi-membership naturally (overlapping regions)

**Limitations:**
- Gets cluttered with >10 groups
- Hulls can be misleading if force layout doesn't cluster by the same dimension

**Scaling:** ~100 nodes, ~10 groups

**Libraries:** d3-polygon (convex hull), or custom smooth contour via d3-shape

**Implementation notes:**
- Recompute hulls on each force tick (or debounced)
- Add padding/margin around hull boundaries for visual clarity
- Use `mix-blend-mode: multiply` for overlapping regions
- Toggle-able per dimension via the grouping selector

---

### 2. Bipartite Graph

Two-column layout: items on one side, group nodes on the other. Edges connect items to their groups.

**How it works:**
- Left column: item nodes (sorted by name or dependency count)
- Right column: group nodes (one per tag/category/supertag)
- Edges from each item to its group(s)
- Edge bundling reduces visual clutter

**Strengths:**
- Crystal clear set membership — every relationship is an explicit edge
- Works for any grouping dimension
- Easy to see items belonging to many groups (high fan-out)

**Limitations:**
- Loses dependency/relationship info (only shows membership)
- Can combine: left=items, right=groups, item-to-item dependency edges as arcs

**Scaling:** ~200 nodes

**Libraries:** React Flow (existing), d3-force with fixed x positions

---

### 3. UpSet Plot

Quantitative view of set intersections. Shows how many items belong to each combination of groups.

**How it works:**
- Matrix of dots showing which groups are "active" for each intersection
- Bar chart showing count of items in each intersection
- Sorted by intersection size

**Strengths:**
- Best visualization for answering "how many items are in A AND B but NOT C?"
- Scales to many groups (unlike Venn diagrams)
- Reveals unexpected overlaps

**Limitations:**
- Not a node-link diagram — doesn't show individual items or dependencies
- Quantitative summary, not exploratory

**Scaling:** Unlimited groups, but most useful with 5-15

**Libraries:** @upsetjs/react, or custom with d3

**Use case example:** "Show me the intersection of tags: which items are tagged both 'ai' AND 'cli'? How many tools are in category 'development' AND have platform 'macos'?"

---

### 4. Nested Containment (Treemap + Cross-Links)

Items visually nested inside their group boundaries, with dependency edges crossing boundaries.

**How it works:**
- Rectangles represent groups (sized by member count)
- Item nodes placed inside their group rectangle
- Dependency edges drawn as curves crossing group boundaries
- Supports hierarchy: `Category > Supertag > Item`

**Strengths:**
- Shows both hierarchy AND cross-cutting relationships
- Size encoding adds information (larger groups = more items)
- Natural for exploring "what depends on things outside its group?"

**Limitations:**
- Multi-membership items must pick a primary group or be duplicated
- Gets complex with deep nesting

**Scaling:** ~100 nodes, 2-3 nesting levels

**Libraries:** d3-treemap for layout, React Flow or custom SVG for edges

---

### 5. Hypergraph

Tags/groups are not nodes — they ARE edges that connect multiple items simultaneously.

**How it works:**
- Each group becomes a colored region (or thick edge) connecting all its members
- A tag shared by 5 items becomes a single "hyper-edge" touching all 5
- Force layout positions nodes; hyper-edges rendered as enclosing curves

**Strengths:**
- Most mathematically accurate for set membership
- Naturally handles multi-membership
- Reduces visual clutter vs. bipartite (one shape per group instead of N edges)

**Limitations:**
- Unfamiliar to most users
- Rendering is non-trivial

**Scaling:** ~50-80 nodes, ~15 groups

**Libraries:** Custom rendering with d3-shape curves

---

## Relationship Exploration Visualizations

These answer: "How are items connected?" and "What patterns exist in the dependency graph?"

### 6. Hierarchical Edge Bundling (Radial)

Nodes arranged in a circle grouped by dimension. Dependency edges bundled through the center following the group hierarchy.

**How it works:**
- Nodes placed on circle perimeter, clustered by active grouping dimension
- Edges from dependencies routed through the center, bundled by shared ancestry
- Color edges by source group or by cross-group vs. intra-group

**Strengths:**
- Instantly reveals cross-group dependency patterns
- "Everything in 'AI' depends on something in 'runtime'" becomes visually obvious
- Beautiful and information-dense
- Deterministic layout (same data = same picture)

**Limitations:**
- Read-only / non-interactive by default (no dragging)
- Labels can overlap with many nodes

**Scaling:** ~200 nodes

**Libraries:** d3-hierarchy + d3-bundle, or Observable's HEB implementation

**Use case:** "Show me all dependencies colored by category — where do cross-category dependencies cluster?"

---

### 7. Adjacency Matrix

Rows and columns are items. Cells are colored if a relationship exists.

**How it works:**
- Square matrix: item x item
- Cell (i,j) filled if item i depends on item j (or shares a tag, etc.)
- Rows/columns sortable by group dimension, name, dependency count
- Group headers shown as colored bars along axes

**Strengths:**
- Best for dense graphs — no edge crossing, no occlusion
- Reveals patterns invisible in node-link diagrams (blocks, triangles)
- Sorting by different dimensions reveals different patterns
- Scales better than node-link for relationship density

**Limitations:**
- Unfamiliar to some users
- Doesn't show topology (paths, centrality) as intuitively

**Scaling:** ~200 nodes (with interactive zoom)

**Libraries:** d3-matrix, custom with CSS grid or canvas

**Use case:** "Sort by category, then look for off-diagonal blocks — those are cross-category dependency clusters."

---

### 8. Ego Network / Neighborhood Explorer

Click any node to see only its local neighborhood, then progressively expand.

**How it works:**
- Start with one item (the "ego")
- Show 1-hop neighbors (direct dependencies and dependents)
- Click to expand any neighbor to see its connections
- Breadcrumb trail tracks exploration path
- "Depth" slider: 1-hop, 2-hop, 3-hop

**Strengths:**
- Best for deep exploration of individual items
- Progressive disclosure — never overwhelming
- Natural for answering "what does this item depend on, transitively?"
- Combines well with any grouping dimension (color by group)

**Limitations:**
- Loses global structure (can't see full graph)
- Needs a starting point

**Scaling:** Unlimited (only shows local subgraph)

**Libraries:** React Flow (existing), with custom expand/collapse logic

**Use case:** "Start at pnpm → see it depends on Node.js → expand Node.js → see everything that also depends on Node.js"

---

### 9. Sankey / Alluvial Diagram

Multi-level flow showing how items distribute across different grouping dimensions simultaneously.

**How it works:**
- Multiple vertical axes, each representing a grouping dimension
- e.g., left axis = Supertag, middle axis = Category, right axis = Tag
- Flows (bands) connect groups across axes, sized by item count
- Click a flow to see which items it represents

**Strengths:**
- Shows how different classifications relate to each other
- Reveals correlations: "most 'AI' tools are in 'development tools' category and tagged 'cli'"
- Can chain any number of dimensions

**Limitations:**
- Not a node-link diagram — doesn't show individual items
- Gets tangled with many groups per axis

**Scaling:** ~5-10 groups per axis, 2-4 axes

**Libraries:** d3-sankey, recharts Sankey

**Use case:** "How do supertags, categories, and tags relate? Are there category+tag combinations with no items?"

---

### 10. Hive Plot

Structured layout with 2-3 axes radiating from center. Nodes placed on axes by one property, edges drawn between axes.

**How it works:**
- 3 axes at 120deg angles
- Axis assignment by one grouping dimension (e.g., supertag)
- Position along axis by another property (e.g., dependency count, date)
- Edges (dependencies) drawn as curves between axes

**Strengths:**
- Eliminates force-directed "hairball" — structured and reproducible
- Explicitly separates node placement from edge drawing
- Good for seeing cross-group vs. intra-group connection patterns

**Limitations:**
- Limited to 2-3 axes (groups)
- Requires careful axis assignment

**Scaling:** ~150 nodes

**Libraries:** d3-hive (community), or custom with d3-line.radial

---

### 11. Small Multiples

Same graph layout repeated N times, each highlighting a different group or dimension.

**How it works:**
- Compute one force-directed layout (node positions fixed)
- Render N copies, each highlighting nodes in one group (others dimmed)
- Grid layout: one panel per tag, or per category

**Strengths:**
- Powerful for comparison across groups
- Uses familiar force layout
- "Where are the AI tools? Where are the CLI tools?" answered at a glance

**Limitations:**
- Requires screen space (N panels)
- Static — not interactive per panel

**Scaling:** ~100 nodes, ~12 panels (4x3 grid)

**Libraries:** React Flow (reuse existing graph component), CSS grid for layout

---

## Recommended Implementation Priority

### Phase 1: Quick Wins (augment existing force graph)
1. **Convex hull overlay** — add group boundaries to existing graph, with dimension picker dropdown
2. **Ego network explorer** — add click-to-expand mode to existing graph

### Phase 2: New Views (add as graph mode options)
3. **Hierarchical edge bundling** — new radial view, best insight-per-effort ratio
4. **Adjacency matrix** — new matrix view, best for finding hidden patterns

### Phase 3: Analytical Views
5. **Sankey diagram** — multi-dimensional group flow analysis
6. **UpSet plot** — quantitative set intersection analysis
7. **Small multiples** — comparative group analysis

### Phase 4: Advanced
8. **Nested containment** — treemap with cross-links
9. **Hive plot** — structured axis-based layout
10. **Hypergraph** — true multi-membership visualization

---

## Interaction Patterns

All views should support these interactions with the flexible grouping system:

- **Dimension picker**: Dropdown/tabs to switch active grouping dimension
- **Multi-dimension**: Some views support simultaneous dimensions (Sankey, nested containment)
- **Filter by group**: Click a group to filter to only its members
- **Highlight on hover**: Hover a group to highlight its members across all views
- **Cross-view linking**: If multiple views are open, selection in one highlights in others
- **Group color persistence**: Same group gets same color across all views and sessions
- **Custom grouping**: User defines a grouping function via saved queries or property selectors
