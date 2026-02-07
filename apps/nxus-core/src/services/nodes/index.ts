/**
 * Node Services - Entry point for node-based architecture
 *
 * Re-exports from @nxus/db/server for convenience.
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
