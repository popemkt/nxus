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

const VALID_ARCHITECTURES = new Set<ArchitectureType>(['node', 'graph'])
const envArch = process.env.ARCHITECTURE_TYPE
export const ARCHITECTURE_TYPE: ArchitectureType =
  envArch && VALID_ARCHITECTURES.has(envArch as ArchitectureType)
    ? (envArch as ArchitectureType)
    : 'node'

/**
 * Helper functions for architecture checks
 */
export const isNodeArchitecture = () => ARCHITECTURE_TYPE === 'node'
export const isGraphArchitecture = () => ARCHITECTURE_TYPE === 'graph'

/**
 * @deprecated Use ARCHITECTURE_TYPE or isNodeArchitecture() instead.
 */
export const NODE_BASED_ARCHITECTURE_ENABLED = true
