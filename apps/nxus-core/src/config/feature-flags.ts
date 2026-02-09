/**
 * feature-flags.ts - Architecture selection
 *
 * The system supports two architecture modes:
 * - 'node': Node-based architecture (nodes, nodeProperties) — default
 * - 'graph': Graph database (SurrealDB) — experimental
 *
 * The legacy 'table' mode has been removed.
 */

export type ArchitectureType = 'node' | 'graph'

export const ARCHITECTURE_TYPE: ArchitectureType =
  (process.env.ARCHITECTURE_TYPE as ArchitectureType) || 'node'

/**
 * Helper functions for architecture checks
 */
export const isNodeArchitecture = () => ARCHITECTURE_TYPE === 'node'
export const isGraphArchitecture = () => ARCHITECTURE_TYPE === 'graph'

/**
 * @deprecated Use ARCHITECTURE_TYPE or isNodeArchitecture() instead.
 */
export const NODE_BASED_ARCHITECTURE_ENABLED = true
