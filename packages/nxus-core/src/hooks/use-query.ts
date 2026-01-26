/**
 * Query Hooks - React hooks for query evaluation and management
 *
 * Provides TanStack Query-based hooks for:
 * - Evaluating ad-hoc query definitions
 * - Executing saved queries
 * - Listing all saved queries
 * - Creating, updating, and deleting saved queries
 */

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryDefinition, SavedQuery, AssembledNode } from '@nxus/db'
import {
  evaluateQueryServerFn,
  createQueryServerFn,
  updateQueryServerFn,
  deleteQueryServerFn,
  getSavedQueriesServerFn,
  executeSavedQueryServerFn,
  createNodeServerFn,
  deleteNodeServerFn,
  updateNodeContentServerFn,
  setNodePropertiesServerFn,
} from '@nxus/workbench/server'

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for consistent cache key management
 */
export const queryKeys = {
  all: ['query'] as const,
  evaluation: (definition: QueryDefinition) =>
    ['query', 'evaluation', hashDefinition(definition)] as const,
  savedQueries: () => ['query', 'saved'] as const,
  savedQuery: (queryId: string) => ['query', 'saved', queryId] as const,
  savedQueryExecution: (queryId: string) =>
    ['query', 'saved', queryId, 'execution'] as const,
}

/**
 * Create a hash of a query definition for cache keying
 * Uses JSON.stringify for simplicity - works well for our use case
 */
function hashDefinition(definition: QueryDefinition): string {
  return JSON.stringify(definition)
}

// ============================================================================
// Types
// ============================================================================

export interface QueryEvaluationResult {
  nodes: AssembledNode[]
  totalCount: number
  evaluatedAt: Date
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export interface SavedQueriesResult {
  queries: SavedQuery[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export interface SavedQueryResult {
  query: SavedQuery | null
  nodes: AssembledNode[]
  totalCount: number
  evaluatedAt: Date | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

// ============================================================================
// Query Evaluation Hook
// ============================================================================

interface UseQueryEvaluationOptions {
  /** Optional limit override */
  limit?: number
  /** Whether the query is enabled (defaults to true) */
  enabled?: boolean
  /** Stale time in ms (defaults to 30 seconds) */
  staleTime?: number
  /** Debounce delay in ms (defaults to 0 = no debounce) */
  debounceMs?: number
}

/**
 * Evaluate an ad-hoc query definition
 *
 * @param definition - The query definition to evaluate
 * @param options - Optional configuration
 * @returns Query evaluation results including nodes, count, and query state
 *
 * @example
 * ```tsx
 * const { nodes, totalCount, isLoading } = useQueryEvaluation({
 *   filters: [{ type: 'supertag', supertagSystemId: 'supertag:item' }],
 *   limit: 100
 * })
 * ```
 */
export function useQueryEvaluation(
  definition: QueryDefinition,
  options: UseQueryEvaluationOptions = {}
): QueryEvaluationResult {
  const { limit, enabled = true, staleTime = 30 * 1000, debounceMs = 0 } = options

  // Debounce the definition to avoid excessive re-evaluations
  const [debouncedDefinition, setDebouncedDefinition] = useState(definition)

  // Track if we're in a debouncing state (definition changed but debounce hasn't fired)
  const definitionHash = useMemo(() => hashDefinition(definition), [definition])
  const debouncedHash = useMemo(() => hashDefinition(debouncedDefinition), [debouncedDefinition])
  const isDebouncing = debounceMs > 0 && definitionHash !== debouncedHash

  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedDefinition(definition)
      return
    }

    const timer = setTimeout(() => {
      setDebouncedDefinition(definition)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [definition, debounceMs])

  const query = useQuery({
    queryKey: queryKeys.evaluation(debouncedDefinition),
    queryFn: async () => {
      const result = await evaluateQueryServerFn({
        data: { definition: debouncedDefinition, limit },
      })
      if (!result.success) {
        throw new Error('Failed to evaluate query')
      }
      return {
        nodes: result.nodes as AssembledNode[],
        totalCount: result.totalCount,
        evaluatedAt: new Date(result.evaluatedAt),
      }
    },
    enabled: enabled && debouncedDefinition.filters.length > 0,
    staleTime,
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  })

  return {
    nodes: query.data?.nodes ?? [],
    totalCount: query.data?.totalCount ?? 0,
    evaluatedAt: query.data?.evaluatedAt ?? new Date(),
    isLoading: query.isLoading || isDebouncing,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  }
}

// ============================================================================
// Saved Queries Hook
// ============================================================================

interface UseSavedQueriesOptions {
  /** Whether the query is enabled (defaults to true) */
  enabled?: boolean
}

/**
 * List all saved queries
 *
 * @param options - Optional configuration
 * @returns List of saved queries with query state
 *
 * @example
 * ```tsx
 * const { queries, isLoading } = useSavedQueries()
 * ```
 */
export function useSavedQueries(
  options: UseSavedQueriesOptions = {}
): SavedQueriesResult {
  const { enabled = true } = options

  const query = useQuery({
    queryKey: queryKeys.savedQueries(),
    queryFn: async () => {
      const result = await getSavedQueriesServerFn()
      if (!result.success) {
        throw new Error('Failed to load saved queries')
      }
      // Convert response to SavedQuery type
      return result.queries.map(
        (q: {
          id: string
          content: string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          definition: any
          resultCache?: string[]
          evaluatedAt?: Date | string
          createdAt: Date | string
          updatedAt: Date | string
        }) =>
          ({
            ...q,
            evaluatedAt: q.evaluatedAt ? new Date(q.evaluatedAt) : undefined,
            createdAt: new Date(q.createdAt),
            updatedAt: new Date(q.updatedAt),
          }) as SavedQuery
      )
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  })

  return {
    queries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  }
}

// ============================================================================
// Saved Query Execution Hook
// ============================================================================

interface UseSavedQueryOptions {
  /** Whether to cache the results on the server */
  cacheResults?: boolean
  /** Whether the query is enabled (defaults to true) */
  enabled?: boolean
}

/**
 * Execute a saved query by ID
 *
 * @param queryId - The saved query node ID
 * @param options - Optional configuration
 * @returns Saved query details, nodes, and query state
 *
 * @example
 * ```tsx
 * const { query, nodes, totalCount, isLoading } = useSavedQuery('query-id')
 * ```
 */
export function useSavedQuery(
  queryId: string | null,
  options: UseSavedQueryOptions = {}
): SavedQueryResult {
  const { cacheResults = false, enabled = true } = options

  const query = useQuery({
    queryKey: queryKeys.savedQueryExecution(queryId ?? ''),
    queryFn: async () => {
      if (!queryId) {
        throw new Error('Query ID is required')
      }
      const result = await executeSavedQueryServerFn({
        data: { queryId, cacheResults },
      })
      if (!result.success) {
        throw new Error('Failed to execute saved query')
      }
      return {
        query: {
          ...result.query,
          evaluatedAt: result.query.evaluatedAt
            ? new Date(result.query.evaluatedAt)
            : undefined,
          createdAt: new Date(result.query.createdAt),
          updatedAt: new Date(result.query.updatedAt),
        } as SavedQuery,
        nodes: result.nodes as AssembledNode[],
        totalCount: result.totalCount,
        evaluatedAt: new Date(result.evaluatedAt),
      }
    },
    enabled: enabled && !!queryId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  })

  return {
    query: query.data?.query ?? null,
    nodes: query.data?.nodes ?? [],
    totalCount: query.data?.totalCount ?? 0,
    evaluatedAt: query.data?.evaluatedAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  }
}

// ============================================================================
// Query Mutations
// ============================================================================

interface CreateQueryVariables {
  name: string
  definition: QueryDefinition
  ownerId?: string
}

interface UpdateQueryVariables {
  queryId: string
  name?: string
  definition?: QueryDefinition
}

interface DeleteQueryVariables {
  queryId: string
}

/**
 * Hook for creating saved queries
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { createQuery, isCreating } = useCreateQuery()
 * await createQuery({ name: 'My Query', definition: { filters: [] } })
 * ```
 */
export function useCreateQuery() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: CreateQueryVariables) => {
      const result = await createQueryServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error('Failed to create query')
      }
      return result.queryId
    },
    onSuccess: () => {
      // Invalidate saved queries list
      queryClient.invalidateQueries({ queryKey: queryKeys.savedQueries() })
    },
  })

  return {
    createQuery: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error as Error | null,
  }
}

/**
 * Hook for updating saved queries
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { updateQuery, isUpdating } = useUpdateQuery()
 * await updateQuery({ queryId: 'id', name: 'New Name' })
 * ```
 */
export function useUpdateQuery() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: UpdateQueryVariables) => {
      const result = await updateQueryServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error('Failed to update query')
      }
      return result.queryId
    },
    onSuccess: (_data, variables) => {
      // Invalidate saved queries list and specific query
      queryClient.invalidateQueries({ queryKey: queryKeys.savedQueries() })
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedQueryExecution(variables.queryId),
      })
    },
  })

  return {
    updateQuery: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error as Error | null,
  }
}

/**
 * Hook for deleting saved queries
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { deleteQuery, isDeleting } = useDeleteQuery()
 * await deleteQuery({ queryId: 'id' })
 * ```
 */
export function useDeleteQuery() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: DeleteQueryVariables) => {
      const result = await deleteQueryServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error('Failed to delete query')
      }
    },
    onSuccess: (_data, variables) => {
      // Invalidate saved queries list and remove specific query from cache
      queryClient.invalidateQueries({ queryKey: queryKeys.savedQueries() })
      queryClient.removeQueries({
        queryKey: queryKeys.savedQueryExecution(variables.queryId),
      })
    },
  })

  return {
    deleteQuery: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error as Error | null,
  }
}

// ============================================================================
// Cache Invalidation Hook
// ============================================================================

/**
 * Hook for invalidating query caches
 *
 * Use this when data changes that could affect query results
 *
 * @returns Invalidation functions
 *
 * @example
 * ```tsx
 * const { invalidateAll, invalidateEvaluations } = useQueryInvalidation()
 * // After creating a node:
 * invalidateEvaluations()
 * ```
 */
export function useQueryInvalidation() {
  const queryClient = useQueryClient()

  return {
    /** Invalidate all query-related caches */
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },

    /** Invalidate all query evaluations (keeps saved queries list) */
    invalidateEvaluations: () => {
      // Find and invalidate all evaluation queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'query' &&
            key[1] === 'evaluation'
          )
        },
      })
    },

    /** Invalidate saved queries list */
    invalidateSavedQueries: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedQueries() })
    },

    /** Invalidate a specific saved query execution */
    invalidateSavedQuery: (queryId: string) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedQueryExecution(queryId),
      })
    },
  }
}

// ============================================================================
// Node Mutation Hooks (with Query Cache Invalidation)
// ============================================================================

interface CreateNodeVariables {
  content: string
  systemId?: string
  supertagSystemId?: string
  ownerId?: string
  properties?: Record<string, string | number | boolean | null>
}

interface UpdateNodeContentVariables {
  nodeId: string
  content: string
}

interface DeleteNodeVariables {
  nodeId: string
}

interface SetNodePropertiesVariables {
  nodeId: string
  properties: Record<string, string | number | boolean | null | string[]>
}

/**
 * Hook for creating nodes with automatic query cache invalidation
 *
 * When a node is created, all query evaluations are invalidated
 * since the new node might match active queries.
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { createNode, isCreating } = useCreateNode()
 * await createNode({
 *   content: 'New Item',
 *   supertagSystemId: 'supertag:item'
 * })
 * ```
 */
export function useCreateNode() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: CreateNodeVariables) => {
      const result = await createNodeServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to create node')
      }
      return result
    },
    onSuccess: () => {
      // Invalidate all query evaluations since new node might match queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'query' &&
            (key[1] === 'evaluation' || key[1] === 'saved')
          )
        },
      })
    },
  })

  return {
    createNode: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error as Error | null,
  }
}

/**
 * Hook for updating node content with automatic query cache invalidation
 *
 * When a node's content is updated, query evaluations are invalidated
 * since content-based queries might now match or not match.
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { updateNodeContent, isUpdating } = useUpdateNodeContent()
 * await updateNodeContent({ nodeId: 'xxx', content: 'Updated content' })
 * ```
 */
export function useUpdateNodeContent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: UpdateNodeContentVariables) => {
      const result = await updateNodeContentServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to update node content')
      }
      return result
    },
    onSuccess: () => {
      // Invalidate all query evaluations since content filters might be affected
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'query' &&
            (key[1] === 'evaluation' || key[1] === 'saved')
          )
        },
      })
    },
  })

  return {
    updateNodeContent: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error as Error | null,
  }
}

/**
 * Hook for deleting nodes with automatic query cache invalidation
 *
 * When a node is deleted, query evaluations are invalidated
 * since the deleted node might have been in query results.
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { deleteNode, isDeleting } = useDeleteNode()
 * await deleteNode({ nodeId: 'xxx' })
 * ```
 */
export function useDeleteNode() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: DeleteNodeVariables) => {
      const result = await deleteNodeServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete node')
      }
    },
    onSuccess: () => {
      // Invalidate all query evaluations since deleted node might have been in results
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'query' &&
            (key[1] === 'evaluation' || key[1] === 'saved')
          )
        },
      })
    },
  })

  return {
    deleteNode: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error as Error | null,
  }
}

/**
 * Hook for setting node properties with automatic query cache invalidation
 *
 * When node properties are updated, query evaluations are invalidated
 * since property-based filters might now match or not match.
 *
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { setNodeProperties, isUpdating } = useSetNodeProperties()
 * await setNodeProperties({
 *   nodeId: 'xxx',
 *   properties: { 'field:status': 'active' }
 * })
 * ```
 */
export function useSetNodeProperties() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (variables: SetNodePropertiesVariables) => {
      const result = await setNodePropertiesServerFn({
        data: variables,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to set node properties')
      }
      return result
    },
    onSuccess: () => {
      // Invalidate all query evaluations since property filters might be affected
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'query' &&
            (key[1] === 'evaluation' || key[1] === 'saved')
          )
        },
      })
    },
  })

  return {
    setNodeProperties: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error as Error | null,
  }
}
