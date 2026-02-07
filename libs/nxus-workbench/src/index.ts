/**
 * @nxus/workbench - Node Workbench UI Package
 *
 * A Tana-inspired interface for exploring and managing nodes.
 *
 * This package provides:
 * - NodeWorkbenchRoute: Full-page three-panel layout (list/graph/query views)
 * - Individual components: NodeBrowser, NodeInspector, SupertagSidebar, QueryResultsView
 * - Query Builder: Tana-like visual query builder with filters
 * - Shared UI components: NodeBadge, NodeLink, SupertagChip
 *
 * Server functions are available from '@nxus/workbench/server'
 */

// Main route component
export { NodeWorkbenchRoute } from './route.js'
export type { NodeWorkbenchRouteProps } from './route.js'

// Individual components
export {
  NodeBrowser,
  NodeInspector,
  SupertagSidebar,
  QueryResultsView,
  NodeBadge,
  NodeLink,
  SupertagChip,
} from './components/index.js'

// Component prop types
export type {
  NodeBrowserProps,
  NodeInspectorProps,
  SupertagSidebarProps,
  QueryResultsViewProps,
} from './components/index.js'

// Query Builder Feature
export {
  QueryBuilder,
  QueryBuilderWithSaved,
  SavedQueriesPanel,
  FilterList,
  FilterChip,
  AddFilterMenu,
  SortConfig,
  QueryLinter,
  // Filter editors
  SupertagFilterEditor,
  PropertyFilterEditor,
  ContentFilterEditor,
  RelationFilterEditor,
  TemporalFilterEditor,
  HasFieldFilterEditor,
  LogicalFilterEditor,
} from './features/query-builder/index.js'

export type {
  QueryBuilderProps,
  QueryBuilderWithSavedProps,
  SavedQueriesPanelProps,
  FilterListProps,
  FilterChipProps,
  AddFilterMenuProps,
  SortConfigProps,
  QueryLinterProps,
} from './features/query-builder/index.js'

// Query Hooks
export {
  queryKeys,
  useQueryEvaluation,
  useSavedQueries,
  useSavedQuery,
  useCreateQuery,
  useUpdateQuery,
  useDeleteQuery,
  useQueryInvalidation,
  useCreateNode,
  useUpdateNodeContent,
  useDeleteNode,
  useSetNodeProperties,
} from './hooks/index.js'

export type {
  QueryEvaluationResult,
  SavedQueriesResult,
  SavedQueryResult,
} from './hooks/index.js'

// Query Store
export { useQueryStore } from './stores/index.js'
