/**
 * Graph Visualization Feature
 *
 * Complete graph visualization system with 2D and 3D renderers,
 * interactive controls, and configurable data providers.
 *
 * @example
 * ```tsx
 * import { GraphView } from '@nxus/workbench/features/graph'
 *
 * function MyComponent() {
 *   const { data: nodes } = useNodes()
 *   return (
 *     <GraphView
 *       nodes={nodes}
 *       selectedNodeId={selectedId}
 *       onNodeClick={(id) => setSelectedId(id)}
 *     />
 *   )
 * }
 * ```
 */

// ============================================================================
// Main Component
// ============================================================================

export { GraphView, default as GraphViewComponent } from './GraphView'
export type { GraphViewProps } from './GraphView'

// ============================================================================
// Data Provider
// ============================================================================

export {
  // Main hook
  useGraphData,
  transformToGraphData,
  isLargeGraph,
  LARGE_GRAPH_THRESHOLD,
  // Local graph
  useLocalGraph,
  useLocalGraphResult,
  filterLocalGraph,
  getLocalGraphOnly,
  buildAdjacencyLists,
  bfsTraversal,
  // Edge extractors
  extractAllEdges,
  createExtractionContext,
  extractDependencyEdges,
  extractBacklinkEdges,
  extractReferenceEdges,
  extractHierarchyEdges,
  buildBacklinkMap,
  buildChildrenMap,
  // Utilities
  DEFAULT_SUPERTAG_COLORS,
  NO_SUPERTAG_COLOR,
  VIRTUAL_NODE_COLOR,
  getSupertagColor,
  generateSupertagColorMap,
  adjustBrightness,
  getDimmedColor,
  getHighlightedColor,
  computeGraphStats,
  countConnectedComponents,
  countOrphans,
  computeConnectionMetrics,
  getMostConnectedNodes,
  getEdgeTypeDistribution,
  synthesizeTags,
  mergeTagSynthesis,
  // Default options
  DEFAULT_GRAPH_DATA_OPTIONS,
  DEFAULT_LOCAL_GRAPH_OPTIONS,
} from './provider'

export type {
  GraphNode,
  GraphEdge,
  GraphData,
  GraphStats,
  GraphDataOptions,
  LocalGraphOptions,
  EdgeType,
  EdgeDirection,
  LinkTraversalType,
  EdgeExtractionContext,
  EdgeExtractor,
  LocalGraphResult,
  TagSynthesisResult,
} from './provider'

// ============================================================================
// State Management
// ============================================================================

export {
  // Store and hooks
  useGraphStore,
  useGraphPhysics,
  useGraphDisplay,
  useGraphFilter,
  useGraphLocalGraph,
  useGraphView,
  graphStoreService,
  // Defaults
  DEFAULT_PHYSICS,
  DEFAULT_DISPLAY,
  DEFAULT_FILTER,
  DEFAULT_LOCAL_GRAPH,
  DEFAULT_VIEW,
  DEFAULT_GRAPH_STORE_STATE,
  PHYSICS_CONSTRAINTS,
} from './store'

export type {
  GraphPhysicsOptions,
  GraphDisplayOptions,
  GraphFilterOptions,
  GraphLocalGraphOptions,
  GraphViewOptions,
  GraphStoreState,
  GraphStoreActions,
  WorkbenchGraphStore,
  ColorByOption,
  LabelVisibility,
  NodeSizeOption,
  EdgeStyleOption,
  RendererType,
  LayoutType,
} from './store'

// ============================================================================
// Controls
// ============================================================================

export {
  GraphControls,
  RendererSwitcher,
  GraphLegend,
  // Individual sections
  CollapsibleSection,
  PhysicsSection,
  DisplaySection,
  FilterSection,
  LocalGraphSection,
} from './controls'

export type {
  GraphControlsProps,
  RendererSwitcherProps,
  GraphLegendProps,
  CollapsibleSectionProps,
} from './controls'

// ============================================================================
// 2D Renderer
// ============================================================================

export {
  Graph2D,
  Graph2DComponent,
  // Node components
  graphNodeTypes,
  DetailedNode,
  SimpleNode,
  calculateNodeSize,
  shouldShowLabel,
  // Edge components
  graphEdgeTypes,
  AnimatedEdge,
  StaticEdge,
  EDGE_DIRECTION_COLORS as EDGE_DIRECTION_COLORS_2D,
  EDGE_TYPE_COLORS as EDGE_TYPE_COLORS_2D,
  DEFAULT_EDGE_COLOR,
  DIMMED_EDGE_COLOR as DIMMED_EDGE_COLOR_2D,
  EDGE_OPACITY,
  getEdgeColor as getEdgeColor2D,
  getEdgeOpacity as getEdgeOpacity2D,
  getEdgeStrokeWidth,
  shouldShowEdgeLabel,
  // Layout hooks
  useGraphLayout,
  useDagreLayout,
  useForceLayout,
} from './renderers/graph-2d'

export type {
  Graph2DProps,
  GraphNodeType,
  GraphNodeData,
  GraphNodeProps,
  GraphEdgeType,
  GraphEdgeData,
  GraphEdgeProps,
  UseGraphLayoutOptions,
  UseDagreLayoutOptions,
  UseForceLayoutOptions,
  DagreDirection,
  HandlePosition,
  LayoutType as Layout2DType,
  LayoutResult,
  SimulationState,
} from './renderers/graph-2d'

// ============================================================================
// 3D Renderer
// ============================================================================

export {
  Graph3D,
  Graph3DComponent,
  Graph3DLoading,
  // Lazy loading
  loadForceGraph3D,
  isForceGraph3DLoaded,
  preloadForceGraph3D,
  clearForceGraph3DCache,
  // Hooks
  useLazyForceGraph,
  use3DGraph,
  // Node rendering
  NODE_COLORS,
  NODE_TYPE_COLORS,
  SIZE_MULTIPLIERS,
  getNodeColor,
  getNodeSize,
  getNodeOpacity,
  computeNodeVisuals,
  createNodeObject,
  createNodeLabel,
  calculateNodeVal,
  // Edge rendering
  EDGE_DIRECTION_COLORS as EDGE_DIRECTION_COLORS_3D,
  EDGE_TYPE_COLORS as EDGE_TYPE_COLORS_3D,
  DIMMED_EDGE_COLOR as DIMMED_EDGE_COLOR_3D,
  EDGE_WIDTHS,
  PARTICLE_SETTINGS,
  getEdgeColor as getEdgeColor3D,
  getEdgeWidth,
  getEdgeOpacity as getEdgeOpacity3D,
  getParticleCount,
  getParticleSpeed,
  computeEdgeVisuals,
  createLinkColorCallback,
  createLinkWidthCallback,
  createParticleCountCallback,
  createParticleSpeedCallback,
  createParticleColorCallback,
  createLinkObject,
  calculateLinkCurvature,
  createLinkCurvatureCallback,
} from './renderers/graph-3d'

export type {
  Graph3DProps,
  Graph3DLoadingProps,
  ForceGraph3DConstructor,
  LazyLoadResult,
  LoadingState,
  ForceGraph3DInstance,
  ConfigOptions,
  NodeObject,
  LinkObject,
  UseLazyForceGraphResult,
  UseLazyForceGraphOptions,
  Graph3DNode,
  Graph3DLink,
  Graph3DData,
  Use3DGraphOptions,
  Use3DGraphResult,
  NodeRenderOptions,
  NodeVisuals,
  EdgeRenderOptions,
  EdgeVisuals,
} from './renderers/graph-3d'
