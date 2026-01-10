/**
 * Tool Health Query Keys
 *
 * Factory for TanStack Query cache keys.
 * Use these consistently to ensure proper cache invalidation.
 */
export const toolHealthKeys = {
  /** Base key for all tool health queries */
  all: ['tool-health'] as const,

  /** Key for a specific check command */
  command: (checkCommand: string) => ['tool-health', checkCommand] as const,
}
