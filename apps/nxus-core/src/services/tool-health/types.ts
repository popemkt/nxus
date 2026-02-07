/**
 * Tool Health Types
 */

/** Status of a tool health check */
export type ToolHealthStatus = 'healthy' | 'unhealthy' | 'unknown'

/** Result of checking a tool's health/installation status */
export interface ToolHealthResult {
  isInstalled: boolean
  version?: string
  error?: string
}

/** Full tool health data including loading states (for React hooks) */
export interface ToolHealthData extends ToolHealthResult {
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

/** Cached health record from ephemeral database */
export interface ToolHealthRecord {
  toolId: string
  status: ToolHealthStatus
  version: string | null
  error: string | null
  checkedAt: Date
  expiresAt: Date
}

/**
 * Query Keys for TanStack Query cache
 */
export const toolHealthKeys = {
  all: ['tool-health'] as const,
  command: (checkCommand: string) => ['tool-health', checkCommand] as const,
}
