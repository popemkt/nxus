import { and, inArray, isNull } from 'drizzle-orm'
import type { getDatabase } from '../client/master-client.js'
import { FIELD_NAMES, nodes } from '../schemas/node-schema.js'
import { formatOrderKey } from '../types/order.js'
import {
  assembleNodes,
  createAssemblyCache,
  getProperty,
  type AssembledNode,
} from '../services/node.service.js'

type Db = ReturnType<typeof getDatabase>

export interface BfsTreeNode {
  id: string
  content: string
  parentId: string | null
  children: string[]
  order: string
  createdAt: number
  supertagCount: number
  fieldCount: number
}

export interface BfsTreeReadResult {
  rootId: string
  nodes: BfsTreeNode[]
}

// MIRROR of apps/nxus-editor/src/services/outline.server.ts getNodeTreeServerFn data-access pattern — keep in sync until the tree read is extracted into the lib (planned P1).
export function readTreeBFS(
  db: Db,
  rootId: string,
  maxDepth: number = Number.MAX_SAFE_INTEGER,
): BfsTreeReadResult {
  const assemblyCache = createAssemblyCache()
  const nodeMap = new Map<string, BfsTreeNode>()
  const childIdsByParent = new Map<string, string[]>()

  function addTreeNode(assembled: AssembledNode): void {
    if (nodeMap.has(assembled.id) || assembled.deletedAt) return
    const orderValue = getProperty<number>(assembled, FIELD_NAMES.ORDER)
    nodeMap.set(assembled.id, {
      id: assembled.id,
      content: assembled.content ?? '',
      parentId: assembled.ownerId,
      children: [],
      order: formatOrderKey(orderValue),
      createdAt: assembled.createdAt?.getTime() ?? 0,
      supertagCount: assembled.supertags.length,
      fieldCount: Object.keys(assembled.properties).length,
    })
  }

  let frontier = [rootId]
  let currentDepth = 0
  while (frontier.length > 0) {
    const uniqueFrontier = [...new Set(frontier)].filter((id) => !nodeMap.has(id))
    if (uniqueFrontier.length === 0) break

    const assembledNodes = assembleNodes(db, uniqueFrontier, assemblyCache)
    const loadedIds: string[] = []
    for (const assembled of assembledNodes) {
      if (assembled.deletedAt) continue
      addTreeNode(assembled)
      loadedIds.push(assembled.id)
    }

    if (currentDepth >= maxDepth || loadedIds.length === 0) break

    const childRows = db
      .select()
      .from(nodes)
      .where(and(inArray(nodes.ownerId, loadedIds), isNull(nodes.deletedAt)))
      .all()

    const nextFrontier: string[] = []
    for (const child of childRows) {
      if (!child.ownerId) continue
      const existing = childIdsByParent.get(child.ownerId) ?? []
      existing.push(child.id)
      childIdsByParent.set(child.ownerId, existing)
      nextFrontier.push(child.id)
    }

    frontier = nextFrontier
    currentDepth++
  }

  for (const [parentId, childIds] of childIdsByParent) {
    const parent = nodeMap.get(parentId)
    if (!parent) continue
    parent.children = childIds
      .filter((childId) => nodeMap.has(childId))
      .sort((a, b) => {
        const na = nodeMap.get(a)
        const nb = nodeMap.get(b)
        const orderCmp = (na?.order ?? '').localeCompare(nb?.order ?? '')
        if (orderCmp !== 0) return orderCmp
        return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0)
      })
  }

  return {
    rootId,
    nodes: Array.from(nodeMap.values()),
  }
}
