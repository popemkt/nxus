import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Dependency,
  DependencyCheckResult,
  DependencyId,
} from '@/types/dependency'
import { getDependencies, getDependency } from '@/data/dependency-registry'
import { checkMultipleDependenciesServerFn } from '@/services/commands/dependency.server'

export interface UseDependencyCheckResult {
  /** Whether the check is currently running */
  isLoading: boolean
  /** Results for each dependency */
  results: Map<DependencyId, DependencyCheckResult>
  /** Whether all dependencies are installed */
  allMet: boolean
  /** List of unmet dependencies with their details */
  unmetDependencies: Array<Dependency>
  /** Re-run the dependency checks */
  recheck: () => void
  /** Error if check failed */
  error: string | null
}

/**
 * Hook to check if dependencies are installed
 *
 * @param dependencyIds - Array of dependency IDs to check
 * @returns Check results, loading state, and helpers
 *
 * @example
 * const { isLoading, allMet, unmetDependencies } = useDependencyCheck([DEPENDENCY_IDS.GEMINI_CLI])
 */
export function useDependencyCheck(
  dependencyIds: Array<DependencyId>,
): UseDependencyCheckResult {
  const [isLoading, setIsLoading] = useState(true)
  const [results, setResults] = useState<
    Map<DependencyId, DependencyCheckResult>
  >(new Map())
  const [error, setError] = useState<string | null>(null)

  // Use ref to track if component is mounted
  const mountedRef = useRef(true)

  // Serialize dependency IDs for stable dependency array
  const depsKey = dependencyIds.sort().join(',')

  const runChecks = useCallback(async () => {
    if (dependencyIds.length === 0) {
      setIsLoading(false)
      setResults(new Map())
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get dependency configurations
      const dependencies = getDependencies(dependencyIds)

      // Build check requests
      const checks = dependencies.map((dep) => ({
        dependencyId: dep.id,
        checkConfig: dep.checkConfig,
      }))

      // Run all checks in parallel on server
      const checkResults = await checkMultipleDependenciesServerFn({
        data: { checks },
      })

      if (mountedRef.current) {
        const resultsMap = new Map<DependencyId, DependencyCheckResult>()
        for (const result of checkResults) {
          resultsMap.set(result.dependencyId, result)
        }
        setResults(resultsMap)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err.message : 'Failed to check dependencies',
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [depsKey])

  // Run checks on mount and when dependencies change
  useEffect(() => {
    mountedRef.current = true
    runChecks()

    return () => {
      mountedRef.current = false
    }
  }, [runChecks])

  // Compute derived state
  const allMet =
    dependencyIds.length === 0 ||
    Array.from(results.values()).every((r) => r.isInstalled)

  const unmetDependencies = dependencyIds
    .filter((id) => {
      const result = results.get(id)
      return !result?.isInstalled
    })
    .map((id) => getDependency(id))
    .filter((d): d is Dependency => d !== undefined)

  return {
    isLoading,
    results,
    allMet,
    unmetDependencies,
    recheck: runChecks,
    error,
  }
}
