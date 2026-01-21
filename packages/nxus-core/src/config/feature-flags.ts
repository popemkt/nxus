/**
 * feature-flags.ts - Feature toggles for gradual migration
 *
 * Use environment variables or this file to toggle features.
 */

/**
 * Architecture type for data layer.
 *
 * - 'table': Legacy relational tables (items, tags, etc.)
 * - 'node': Node-based architecture (nodes, nodeProperties, nodeRelations)
 * - 'graph': Graph database (SurrealDB) - experimental
 *
 * Set via env: ARCHITECTURE_TYPE=node
 */
export type ArchitectureType = 'table' | 'node' | 'graph'

export const ARCHITECTURE_TYPE: ArchitectureType = 'graph'
// (process.env.ARCHITECTURE_TYPE as ArchitectureType) || 'node'

/**
 * Helper functions for architecture checks
 */
export const isTableArchitecture = () => ARCHITECTURE_TYPE === 'table'
export const isNodeArchitecture = () => ARCHITECTURE_TYPE === 'node'
export const isGraphArchitecture = () => ARCHITECTURE_TYPE === 'graph'

/**
 * @deprecated Use ARCHITECTURE_TYPE instead
 * Kept for backwards compatibility during migration
 */
export const NODE_BASED_ARCHITECTURE_ENABLED = ARCHITECTURE_TYPE === 'node'

/**
 * Log when feature toggle is used (for debugging)
 */
export function logFeatureFlag(name: string, value: boolean | string): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[FeatureFlag] ${name} = ${value}`)
  }
}

/**
 * Log current architecture type on startup
 */
export function logArchitectureType(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Architecture] Using '${ARCHITECTURE_TYPE}' data layer`)
  }
}
