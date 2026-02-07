/**
 * @nxus/workbench - Server exports
 *
 * TanStack Server functions for node workbench operations.
 */

// Node server functions
export {
  getNodeServerFn,
  getNodesBySupertagServerFn,
  updateNodeContentServerFn,
  createNodeServerFn,
  deleteNodeServerFn,
  setNodePropertiesServerFn,
  getAllItemsFromNodesServerFn,
  getItemByIdFromNodesServerFn,
  getAllTagsFromNodesServerFn,
} from './nodes.server.js'

// Search server functions
export {
  searchNodesServerFn,
  getSupertagsServerFn,
  getAllNodesServerFn,
  getBacklinksServerFn,
  getOwnerChainServerFn,
  getChildNodesServerFn,
} from './search-nodes.server.js'

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

// Adapters for legacy type conversion
export {
  nodeToItem,
  nodeToTag,
  nodeToCommand,
  nodesToItems,
} from './adapters.js'

// Query server functions
export {
  evaluateQueryServerFn,
  createQueryServerFn,
  updateQueryServerFn,
  deleteQueryServerFn,
  getSavedQueriesServerFn,
  executeSavedQueryServerFn,
  getQuerySupertagsServerFn,
} from './query.server.js'
