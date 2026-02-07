/**
 * Loading indicator for 3D Graph
 *
 * Displayed while the 3d-force-graph library is being lazily loaded.
 */

import { Cube, SpinnerGap } from '@phosphor-icons/react'

export interface Graph3DLoadingProps {
  /** Optional error message to display */
  error?: string | null
  /** Callback to retry loading */
  onRetry?: () => void
}

/**
 * Loading state component for the 3D graph renderer
 *
 * Shows a spinner while loading, or an error message with retry option if loading failed.
 */
export function Graph3DLoading({ error, onRetry }: Graph3DLoadingProps) {
  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background">
        <div className="flex flex-col items-center gap-2 text-destructive">
          <Cube size={48} weight="duotone" className="opacity-50" />
          <p className="text-sm font-medium">Failed to load 3D renderer</p>
          <p className="max-w-md text-center text-xs text-muted-foreground">{error}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try Again
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background">
      <div className="relative">
        <Cube size={48} weight="duotone" className="text-primary opacity-50" />
        <SpinnerGap
          size={64}
          weight="bold"
          className="absolute -left-2 -top-2 animate-spin text-primary"
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium text-foreground">Loading 3D renderer...</p>
        <p className="text-xs text-muted-foreground">
          Initializing WebGL and physics engine
        </p>
      </div>
    </div>
  )
}

export default Graph3DLoading
