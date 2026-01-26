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

// NOTE: Query server functions have been moved to nxus-core/src/services/query/query.server.ts
// They use dynamic imports from @nxus/db/server to avoid bundling better-sqlite3 into the client.
