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

// Adapters for legacy type conversion
export {
  nodeToItem,
  nodeToTag,
  nodeToCommand,
  nodesToItems,
} from './adapters.js'
