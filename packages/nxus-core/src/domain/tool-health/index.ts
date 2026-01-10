/**
 * Tool Health Domain
 *
 * This module handles checking and caching tool installation status.
 *
 * ## Architecture
 * - TanStack Query for in-memory caching (5 min staleTime)
 * - Ephemeral SQLite DB for cross-session persistence (5 min TTL)
 *
 * ## Usage
 *
 * ### In React components:
 * ```typescript
 * import { useToolHealth, useToolHealthInvalidation } from '@/domain/tool-health'
 *
 * // Check tool health
 * const { isInstalled, version, isLoading } = useToolHealth(app)
 *
 * // Invalidate after action (e.g., install)
 * const { invalidate, invalidateAll } = useToolHealthInvalidation()
 * await installTool()
 * invalidate(app.checkCommand)
 * ```
 *
 * ### In non-React contexts (services):
 * ```typescript
 * import { getToolHealthFromCache, invalidateToolHealth } from '@/domain/tool-health'
 *
 * const health = getToolHealthFromCache(queryClient, checkCommand)
 * ```
 *
 * ## Files
 * - `types.ts` - Domain types (ToolHealthResult, ToolHealthStatus)
 * - `hooks.ts` - React hooks (useToolHealth, useToolHealthInvalidation, useBatchToolHealth)
 * - `service.ts` - Server-side logic with ephemeral DB caching
 * - `server.ts` - TanStack Start server functions
 * - `query-keys.ts` - TanStack Query key factory
 * - `utils.ts` - Utilities for non-React access
 */

// Re-export all public API
export * from './types'
export * from './hooks'
export * from './query-keys'
export * from './utils'
