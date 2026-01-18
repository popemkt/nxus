/**
 * Node Services - Entry point for node-based architecture
 *
 * For NEW mini-apps: Import Write API directly
 * For LEGACY migration: Use adapters for backward compat
 */

// ============================================================================
// Read API - Query and Assemble
// ============================================================================
export {
  assembleNode,
  clearSystemNodeCache,
  findNode,
  findNodeById,
  findNodeBySystemId,
  getNodeIdsBySupertagWithInheritance,
  getNodesBySupertagWithInheritance,
  getSystemNode,
  type AssembledNode,
  type CreateNodeOptions,
  type PropertyValue,
} from './node.service'

// ============================================================================
// Write API - Create/Update/Delete (for new mini-apps)
// ============================================================================
export {
  addPropertyValue,
  clearProperty,
  createNode,
  deleteNode,
  linkNodes,
  setProperty,
  updateNodeContent,
} from './node.service'

// ============================================================================
// Property Helpers
// ============================================================================
export { getProperty, getPropertyValues } from './node.service'

// ============================================================================
// Adapters - Legacy type conversion (for existing apps)
// ============================================================================
export { nodeToCommand, nodeToItem, nodeToTag, nodesToItems } from './adapters'

// ============================================================================
// Server Functions
// ============================================================================
export {
  getAllItemsFromNodesServerFn,
  getAllTagsFromNodesServerFn,
  getItemByIdFromNodesServerFn,
  getNodeServerFn,
  getNodesBySupertagServerFn,
} from './nodes.server'
