/**
 * @nxus/workbench - Server exports
 *
 * TanStack Server functions for node workbench operations.
 */

// Node server functions (generic CRUD)
export {
  getNodeServerFn,
  getNodesBySupertagServerFn,
  updateNodeContentServerFn,
  createNodeServerFn,
  deleteNodeServerFn,
  setNodePropertiesServerFn,
} from '@nxus/node-api/server'

// Search server functions
export {
  searchNodesServerFn,
  getSupertagsServerFn,
  getAllNodesServerFn,
  getBacklinksServerFn,
  getOwnerChainServerFn,
  getChildNodesServerFn,
} from '@nxus/node-api/server'

// Graph server functions (optimized for visualization)
export {
  getGraphStructureServerFn,
  getBacklinksWithDepthServerFn,
  getEdgesBetweenNodesServerFn,
} from './graph.server.js'

// Graph types (client-safe, no server dependencies)
export type {
  LightweightGraphNode,
  LightweightGraphEdge,
  GraphStructureResult,
  RecursiveBacklinksResult,
  EdgesBetweenNodesResult,
} from './graph.types.js'

// Query server functions
export {
  evaluateQueryServerFn,
  createQueryServerFn,
  updateQueryServerFn,
  deleteQueryServerFn,
  getSavedQueriesServerFn,
  executeSavedQueryServerFn,
  getQuerySupertagsServerFn,
  getQueryFieldsServerFn,
} from '@nxus/node-api/server'
