/**
 * Tool Health Domain Types
 */

/**
 * Status of a tool health check
 */
export type ToolHealthStatus = 'healthy' | 'unhealthy' | 'unknown'

/**
 * Result of checking a tool's health/installation status
 */
export interface ToolHealthResult {
  /** Whether the tool is installed and working */
  isInstalled: boolean
  /** Version string if available (from command output) */
  version?: string
  /** Error message if check failed */
  error?: string
}

/**
 * Full tool health data including loading states
 */
export interface ToolHealthData extends ToolHealthResult {
  /** Whether the check is currently running */
  isLoading: boolean
  /** Whether the check errored */
  isError: boolean
  /** Refetch function to force a fresh check */
  refetch: () => Promise<unknown>
}

/**
 * Cached health record from ephemeral database
 */
export interface ToolHealthRecord {
  toolId: string
  status: ToolHealthStatus
  version: string | null
  error: string | null
  checkedAt: Date
  expiresAt: Date
}
