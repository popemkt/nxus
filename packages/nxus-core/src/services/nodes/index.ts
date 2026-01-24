/**
 * Node Services - Entry point for node-based architecture
 *
 * For NEW mini-apps: Import Write API directly from @nxus/db
 * For LEGACY migration: Use adapters for backward compat
 *
 * NOTE: Server functions and adapters have been moved to @nxus/workbench.
 * This file re-exports them for backward compatibility.
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
// Re-export from @nxus/workbench/server
// ============================================================================
export {
  // Adapters - Legacy type conversion (for existing apps)
  nodeToCommand,
  nodeToItem,
  nodeToTag,
  nodesToItems,
  // Server Functions
  getAllItemsFromNodesServerFn,
  getAllTagsFromNodesServerFn,
  getItemByIdFromNodesServerFn,
  getNodeServerFn,
  getNodesBySupertagServerFn,
  // Search Server Functions
  searchNodesServerFn,
  getSupertagsServerFn,
  getAllNodesServerFn,
  getBacklinksServerFn,
  getOwnerChainServerFn,
  getChildNodesServerFn,
} from '@nxus/workbench/server'
