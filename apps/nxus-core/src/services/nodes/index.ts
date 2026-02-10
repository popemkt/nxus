/**
 * Node Services - Entry point for node-based architecture
 *
 * Re-exports from @nxus/db/server for convenience.
 * Prefer using `nodeFacade` for all operations — the direct functions
 * are still exported for backward compatibility but are sync/SQLite-only.
 */

// ============================================================================
// Re-export from @nxus/db/server for convenience
// ============================================================================
export {
  // Facade (preferred API)
  nodeFacade,
  NodeFacade,
  // Read API (sync, SQLite-only — prefer facade equivalents)
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
  // Write API (sync, SQLite-only — prefer facade equivalents)
  addPropertyValue,
  clearProperty,
  createNode,
  deleteNode,
  linkNodes,
  setProperty,
  updateNodeContent,
  // Property Helpers (pure functions — use directly)
  getProperty,
  getPropertyValues,
  // Types
  type AssembledNode,
  type CreateNodeOptions,
  type PropertyValue,
  type NodeBackend,
} from '@nxus/db/server'
