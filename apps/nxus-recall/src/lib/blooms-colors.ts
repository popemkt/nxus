import type { BloomsLevel } from '@nxus/db'

// Exhaustiveness checked at definition — all BloomsLevel keys required
const _bloomsColors: Record<BloomsLevel, string> = {
  remember: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  understand: 'bg-green-500/10 text-green-600 dark:text-green-400',
  apply: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  analyze: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  evaluate: 'bg-red-500/10 text-red-600 dark:text-red-400',
  create: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
}

// Widened for runtime indexing (server function types lose precision through serialization)
export const bloomsColors: Record<string, string> = _bloomsColors
