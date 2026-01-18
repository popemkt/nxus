/**
 * Node Services - Entry point for node-based architecture services
 */

// Core service functions
export {
  assembleNode,
  clearSystemNodeCache,
  findNode,
  getNodeIdsBySupertagWithInheritance,
  getNodesBySupertagWithInheritance,
  getProperty,
  getPropertyValues,
  getSystemNode,
  type AssembledNode,
  type PropertyValue,
} from './node.service'

// Adapters for legacy type compatibility
export { nodeToCommand, nodeToItem, nodeToTag, nodesToItems } from './adapters'

// Server functions
export {
  getAllItemsFromNodesServerFn,
  getAllTagsFromNodesServerFn,
  getItemByIdFromNodesServerFn,
  getNodeServerFn,
  getNodesBySupertagServerFn,
} from './nodes.server'
