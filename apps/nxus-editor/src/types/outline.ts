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
