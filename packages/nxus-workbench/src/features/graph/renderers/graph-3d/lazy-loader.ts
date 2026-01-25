/**
 * Lazy loader for 3D Force Graph
 *
 * Implements dynamic import to avoid including 3d-force-graph and three.js
 * in the initial bundle. The 3D dependencies are only loaded when the user
 * switches to 3D view mode.
 */

import type {
  ForceGraph3DInstance,
  ConfigOptions,
} from '3d-force-graph'
import type { NodeObject, LinkObject } from 'three-forcegraph'

// Re-export types for convenience
export type { ForceGraph3DInstance, ConfigOptions }
export type { NodeObject, LinkObject }

/**
 * The constructor type returned by the dynamic import
 */
export interface ForceGraph3DConstructor<
  N extends NodeObject = NodeObject,
  L extends LinkObject<N> = LinkObject<N>,
> {
  new (element: HTMLElement, configOptions?: ConfigOptions): ForceGraph3DInstance<N, L>
}

/**
 * Result of the lazy load operation
 */
export interface LazyLoadResult<
  N extends NodeObject = NodeObject,
  L extends LinkObject<N> = LinkObject<N>,
> {
  ForceGraph3D: ForceGraph3DConstructor<N, L>
}

/**
 * Loading state for the 3D graph module
 */
export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * Cached module reference to avoid re-importing
 */
let cachedModule: ForceGraph3DConstructor | null = null
let loadPromise: Promise<ForceGraph3DConstructor> | null = null

/**
 * Lazily load the 3d-force-graph module
 *
 * This function uses dynamic import to load the 3D graph library only when needed.
 * The module is cached after first load to avoid multiple imports.
 *
 * @returns Promise resolving to the ForceGraph3D constructor
 * @throws Error if the module fails to load
 *
 * @example
 * ```tsx
 * const ForceGraph3D = await loadForceGraph3D()
 * const graph = new ForceGraph3D(containerElement)
 * graph.graphData({ nodes: [...], links: [...] })
 * ```
 */
export async function loadForceGraph3D<
  N extends NodeObject = NodeObject,
  L extends LinkObject<N> = LinkObject<N>,
>(): Promise<ForceGraph3DConstructor<N, L>> {
  // Return cached module if already loaded
  if (cachedModule) {
    return cachedModule as unknown as ForceGraph3DConstructor<N, L>
  }

  // Return existing promise if already loading
  if (loadPromise) {
    return loadPromise.then(
      (mod) => mod as unknown as ForceGraph3DConstructor<N, L>
    )
  }

  // Start loading
  loadPromise = (async () => {
    try {
      // Dynamic import - this chunk will be separate from the main bundle
      const module = await import('3d-force-graph')
      cachedModule = module.default as ForceGraph3DConstructor
      return cachedModule
    } catch (error) {
      // Reset state on error so retry is possible
      loadPromise = null
      throw new Error(
        `Failed to load 3D graph library: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })()

  return loadPromise.then(
    (mod) => mod as unknown as ForceGraph3DConstructor<N, L>
  )
}

/**
 * Check if the 3D graph module is already loaded
 */
export function isForceGraph3DLoaded(): boolean {
  return cachedModule !== null
}

/**
 * Preload the 3D graph module in the background
 *
 * Call this when you anticipate the user might switch to 3D view soon,
 * such as when hovering over the 3D toggle button.
 *
 * @example
 * ```tsx
 * <button
 *   onMouseEnter={() => preloadForceGraph3D()}
 *   onClick={() => switchTo3D()}
 * >
 *   Switch to 3D
 * </button>
 * ```
 */
export function preloadForceGraph3D(): void {
  if (!cachedModule && !loadPromise) {
    // Fire and forget - we don't need to wait for it
    loadForceGraph3D().catch(() => {
      // Silently ignore preload errors - actual load will retry and surface error
    })
  }
}

/**
 * Clear the cached module (useful for testing)
 */
export function clearForceGraph3DCache(): void {
  cachedModule = null
  loadPromise = null
}
