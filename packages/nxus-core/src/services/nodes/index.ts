/**
 * Node Services - Entry point for node-based architecture
 *
 * For NEW mini-apps: Import Write API directly from @nxus/db
 * For LEGACY migration: Use adapters for backward compat
 */

// ============================================================================
// Re-export from @nxus/db/server for convenience
// ============================================================================
export {
  // Read API
  assembleNode,
  assembleNodeWithInheritance,
  clearSystemNodeCache,
  findNode,
  findNodeById,
  findNodeBySystemId,
  getAncestorSupertags,
  getNodeIdsBySupertagWithInheritance,
  getNodesBySupertagWithInheritance,
  getSupertagFieldDefinitions,
  getSystemNode,
  // Write API
  addPropertyValue,
  clearProperty,
  createNode,
  deleteNode,
  linkNodes,
  setProperty,
  updateNodeContent,
  // Property Helpers
  getProperty,
  getPropertyValues,
  // Types
  type AssembledNode,
  type CreateNodeOptions,
  type PropertyValue,
} from '@nxus/db/server'

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
