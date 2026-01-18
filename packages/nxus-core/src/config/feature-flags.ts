/**
 * feature-flags.ts - Feature toggles for gradual migration
 *
 * Use environment variables or this file to toggle features.
 */

/**
 * Enable node-based architecture for queries.
 * When true, uses `getAllItemsFromNodesServerFn` instead of legacy queries.
 *
 * Set via env: NODE_BASED_ARCHITECTURE_ENABLED=true
 */
export const NODE_BASED_ARCHITECTURE_ENABLED =
  process.env.NODE_BASED_ARCHITECTURE_ENABLED === 'true' ||
  process.env.NODE_BASED_ARCHITECTURE_ENABLED === '1'

/**
 * Log when feature toggle is used (for debugging)
 */
export function logFeatureFlag(name: string, value: boolean): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[FeatureFlag] ${name} = ${value}`)
  }
}
