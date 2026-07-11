import type { getDatabase } from '../client/master-client.js'
import { FIELD_NAMES } from '../schemas/node-schema.js'
import { formatOrderKey } from '../types/order.js'
import {
  getProperty,
  type AssembledNode,
} from '../services/node.service.js'
import { SqliteBackend } from '../services/backends/sqlite-backend.js'
import type { NodeBackend } from '../services/backends/types.js'

type Db = ReturnType<typeof getDatabase>

const backendsByDb = new WeakMap<Db, NodeBackend>()

function getBackend(db: Db): NodeBackend {
  const cached = backendsByDb.get(db)
  if (cached) return cached

  const backend = new SqliteBackend()
  backend.initWithDb(db)
  backendsByDb.set(db, backend)
  return backend
}

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
export async function readTreeBFS(
  db: Db,
  rootId: string,
  maxDepth: number = Number.MAX_SAFE_INTEGER,
): Promise<BfsTreeReadResult> {
  const backend = getBackend(db)
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

  const rootNode = await backend.assembleNode(rootId)
  let frontier = rootNode ? [rootNode] : []
  let currentDepth = 0
  while (frontier.length > 0) {
    const seenFrontier = new Set<string>()
    const uniqueFrontier = frontier.filter((node) => {
      if (seenFrontier.has(node.id) || nodeMap.has(node.id)) return false
      seenFrontier.add(node.id)
      return true
    })
    if (uniqueFrontier.length === 0) break

    const loadedIds: string[] = []
    for (const assembled of uniqueFrontier) {
      if (assembled.deletedAt) continue
      addTreeNode(assembled)
      loadedIds.push(assembled.id)
    }

    if (currentDepth >= maxDepth || loadedIds.length === 0) break

    const childrenByParent = await backend.getChildrenByParents(loadedIds)

    const nextFrontier: AssembledNode[] = []
    for (const parentId of loadedIds) {
      const children = childrenByParent.get(parentId) ?? []
      childIdsByParent.set(parentId, children.map((child) => child.id))
      nextFrontier.push(...children)
    }

    frontier = nextFrontier
    currentDepth++
  }

  for (const [parentId, childIds] of childIdsByParent) {
    const parent = nodeMap.get(parentId)
    if (!parent) continue
    parent.children = childIds.filter((childId) => nodeMap.has(childId))
  }

  return {
    rootId,
    nodes: Array.from(nodeMap.values()),
  }
}
