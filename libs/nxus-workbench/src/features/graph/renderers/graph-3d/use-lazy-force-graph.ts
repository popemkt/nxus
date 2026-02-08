/**
 * React hook for lazy loading 3D Force Graph
 *
 * Provides React-friendly state management for the lazy-loaded 3D graph library.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  loadForceGraph3D,
  isForceGraph3DLoaded,
  preloadForceGraph3D,
  type ForceGraph3DConstructor,
  type LoadingState,
} from './lazy-loader'
import type { NodeObject, LinkObject } from 'three-forcegraph'

/**
 * Result of the useLazyForceGraph hook
 */
export interface UseLazyForceGraphResult<
  N extends NodeObject = NodeObject,
  L extends LinkObject<N> = LinkObject<N>,
> {
  /** The ForceGraph3D constructor, null if not yet loaded */
  ForceGraph3D: ForceGraph3DConstructor<N, L> | null
  /** Current loading state */
  loadingState: LoadingState
  /** Whether the module is currently loading */
  isLoading: boolean
  /** Whether the module has loaded successfully */
  isLoaded: boolean
  /** Whether loading failed */
  isError: boolean
  /** Error message if loading failed */
  error: string | null
  /** Manually trigger loading (called automatically if autoLoad is true) */
  load: () => Promise<void>
  /** Preload the module without triggering loading state */
  preload: () => void
}

/**
 * Options for the useLazyForceGraph hook
 */
export interface UseLazyForceGraphOptions {
  /**
   * Whether to automatically start loading the module on mount
   * @default false
   */
  autoLoad?: boolean
  /**
   * Callback when loading completes successfully
   */
  onLoad?: () => void
  /**
   * Callback when loading fails
   */
  onError?: (error: string) => void
}

/**
 * React hook for lazy loading the 3D Force Graph library
 *
 * @param options Configuration options
 * @returns Loading state and ForceGraph3D constructor
 *
 * @example
 * ```tsx
 * function Graph3DView() {
 *   const { ForceGraph3D, isLoading, isLoaded, error, load } = useLazyForceGraph({
 *     autoLoad: true,
 *   })
 *
 *   if (isLoading) return <LoadingSpinner />
 *   if (error) return <ErrorMessage message={error} />
 *   if (!isLoaded || !ForceGraph3D) return null
 *
 *   return <Graph3DRenderer ForceGraph3D={ForceGraph3D} />
 * }
 * ```
 */
export function useLazyForceGraph<
  N extends NodeObject = NodeObject,
  L extends LinkObject<N> = LinkObject<N>,
>(options: UseLazyForceGraphOptions = {}): UseLazyForceGraphResult<N, L> {
  const { autoLoad = false, onLoad, onError } = options

  // Track if already loaded on mount (from preload or previous render)
  const initialLoaded = isForceGraph3DLoaded()

  const [ForceGraph3D, setForceGraph3D] = useState<ForceGraph3DConstructor<N, L> | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>(initialLoaded ? 'loaded' : 'idle')
  const [error, setError] = useState<string | null>(null)

  // Store callbacks in refs to avoid re-triggering effects
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  onLoadRef.current = onLoad
  onErrorRef.current = onError

  // Load function
  const load = useCallback(async () => {
    if (loadingState === 'loading' || loadingState === 'loaded') {
      return
    }

    setLoadingState('loading')
    setError(null)

    try {
      const Constructor = await loadForceGraph3D<N, L>()
      setForceGraph3D(() => Constructor)
      setLoadingState('loaded')
      onLoadRef.current?.()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      setLoadingState('error')
      onErrorRef.current?.(errorMessage)
    }
  }, [loadingState])

  // Preload function (doesn't update loading state)
  const preload = useCallback(() => {
    preloadForceGraph3D()
  }, [])

  // Auto-load on mount if requested
  useEffect(() => {
    if (autoLoad && loadingState === 'idle') {
      load()
    }
  }, [autoLoad, loadingState, load])

  // If already loaded on mount, initialize state
  useEffect(() => {
    if (initialLoaded && !ForceGraph3D) {
      loadForceGraph3D<N, L>().then((Constructor) => {
        setForceGraph3D(() => Constructor)
        setLoadingState('loaded')
      })
    }
  }, [initialLoaded, ForceGraph3D])

  return {
    ForceGraph3D,
    loadingState,
    isLoading: loadingState === 'loading',
    isLoaded: loadingState === 'loaded',
    isError: loadingState === 'error',
    error,
    load,
    preload,
  }
}
