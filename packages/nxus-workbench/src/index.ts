/**
 * @nxus/workbench - Node Workbench UI Package
 *
 * A Tana-inspired interface for exploring and managing nodes.
 *
 * This package provides:
 * - NodeWorkbenchRoute: Full-page three-panel layout
 * - Individual components: NodeBrowser, NodeInspector, SupertagSidebar
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
  NodeBadge,
  NodeLink,
  SupertagChip,
} from './components/index.js'

// Component prop types
export type {
  NodeBrowserProps,
  NodeInspectorProps,
  SupertagSidebarProps,
} from './components/index.js'
