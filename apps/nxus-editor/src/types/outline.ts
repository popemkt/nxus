export interface OutlineNode {
  id: string
  content: string
  parentId: string | null
  children: string[]
  order: string
  collapsed: boolean
  supertags: SupertagBadge[]
}

export interface SupertagBadge {
  id: string
  name: string
  color: string | null
}

export type NodeMap = Map<string, OutlineNode>

/**
 * Virtual root node ID for the workspace level.
 * This node doesn't exist in the DB — it's a local-only container
 * whose children are the top-level nodes (ownerId = null in DB).
 */
export const WORKSPACE_ROOT_ID = '__workspace__'
