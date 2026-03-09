import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

/**
 * Returns a function that navigates to a node by updating the URL search params.
 * This pushes to browser history, making navigation bookmarkable and back/forward-friendly.
 *
 * - Workspace root → `/` (no search param)
 * - Specific node  → `/?node=<nodeId>`
 */
export function useNavigateToNode() {
  const navigate = useNavigate()

  return useCallback(
    (nodeId: string) => {
      const isWorkspaceRoot = nodeId === WORKSPACE_ROOT_ID
      navigate({
        to: '/',
        search: isWorkspaceRoot ? {} : { node: nodeId },
      })
    },
    [navigate],
  )
}
