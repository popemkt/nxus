import Database from 'better-sqlite3'
import { and, inArray, isNull } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import {
  FIELD_NAMES,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  nodes,
  type FieldSystemId,
} from '../schemas/node-schema.js'
import { bootstrapSystemNodesSync } from './bootstrap.js'
import {
  addNodeSupertag,
  assembleNode,
  assembleNodes,
  clearSystemNodeCache,
  createAssemblyCache,
  createNode,
  getAncestorSupertags,
  getProperty,
  getSupertagFieldDefinitions,
  setProperty,
} from './node.service.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let queryCount = 0

beforeEach(() => {
  queryCount = 0
  sqlite = new Database(':memory:', { verbose: () => queryCount++ })
  db = drizzle(sqlite, { schema })
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      content TEXT,
      content_plain TEXT,
      system_id TEXT UNIQUE,
      owner_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON nodes(owner_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id);
    CREATE TABLE IF NOT EXISTS node_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      field_node_id TEXT NOT NULL,
      value TEXT,
      "order" INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_properties_node_id ON node_properties(node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_field_node_id ON node_properties(field_node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value);
  `)
  clearSystemNodeCache()
  bootstrapSystemNodesSync(db)
})

afterEach(() => {
  sqlite.close()
  clearSystemNodeCache()
})

function seedAssemblyFixture(): { rootId: string; nodeCount: number } {
  for (let tagIndex = 0; tagIndex < 3; tagIndex++) {
    const tagId = createNode(db, {
      content: `#Bench${tagIndex}`,
      systemId: `supertag:bench-${tagIndex}`,
    })
    addNodeSupertag(db, tagId, SYSTEM_SUPERTAGS.SUPERTAG)
    setProperty(db, tagId, SYSTEM_FIELDS.COLOR, ['red', 'green', 'blue'][tagIndex])

    for (let fieldIndex = 0; fieldIndex < 4; fieldIndex++) {
      const isFormula = fieldIndex === 3
      const fieldId = createNode(db, {
        content: `Bench ${tagIndex}.${fieldIndex}`,
        systemId: `field:bench-${tagIndex}-${fieldIndex}`,
      })
      addNodeSupertag(db, fieldId, SYSTEM_SUPERTAGS.FIELD)
      setProperty(
        db,
        fieldId,
        SYSTEM_FIELDS.FIELD_TYPE,
        isFormula ? 'formula' : fieldIndex === 1 ? 'number' : 'text',
      )
      if (isFormula) {
        setProperty(db, fieldId, SYSTEM_FIELDS.FORMULA, `{Bench ${tagIndex}.1} * 2`)
      }
      setProperty(db, tagId, `field:bench-${tagIndex}-${fieldIndex}` as FieldSystemId, null)
    }
  }

  const rootId = createNode(db, { content: 'root' })
  let nodeCount = 1
  let parents = [rootId]

  for (let depth = 1; depth <= 3; depth++) {
    const nextParents: string[] = []
    const childrenPerParent = depth === 1 ? 10 : depth === 2 ? 10 : 9
    for (const parentId of parents) {
      for (let order = 0; order < childrenPerParent; order++) {
        const nodeId = createNode(db, {
          content: `node ${nodeCount}`,
          ownerId: parentId,
        })
        const tagIndex = nodeCount % 3
        addNodeSupertag(db, nodeId, `supertag:bench-${tagIndex}`)
        setProperty(db, nodeId, SYSTEM_FIELDS.ORDER, order)
        setProperty(db, nodeId, `field:bench-${tagIndex}-0` as FieldSystemId, `v${nodeCount}`)
        setProperty(db, nodeId, `field:bench-${tagIndex}-1` as FieldSystemId, nodeCount)
        setProperty(db, nodeId, `field:bench-${tagIndex}-2` as FieldSystemId, `x${nodeCount}`)
        nextParents.push(nodeId)
        nodeCount++
      }
    }
    parents = nextParents
  }

  return { rootId, nodeCount }
}

function loadTreeFrontier(rootId: string): number {
  const cache = createAssemblyCache()
  const nodeMap = new Map<string, { order: string; createdAt: number; children: string[] }>()
  const childIdsByParent = new Map<string, string[]>()
  const supertagColorCache = new Map<string, string | null>()

  let frontier = [rootId]
  let depth = 0

  while (frontier.length > 0) {
    const uniqueFrontier = [...new Set(frontier)].filter((id) => !nodeMap.has(id))
    if (uniqueFrontier.length === 0) break

    const assembledNodes = assembleNodes(db, uniqueFrontier, cache)
    const loadedIds: string[] = []
    for (const assembled of assembledNodes) {
      if (assembled.deletedAt) continue
      const orderValue = getProperty(assembled, FIELD_NAMES.ORDER) as number | undefined
      nodeMap.set(assembled.id, {
        order: String(orderValue ?? '').padStart(12, '0'),
        createdAt: assembled.createdAt?.getTime() ?? 0,
        children: [],
      })
      loadedIds.push(assembled.id)

      for (const supertag of assembled.supertags) {
        if (!supertagColorCache.has(supertag.id)) {
          const stNode = assembleNode(db, supertag.id, cache)
          supertagColorCache.set(
            supertag.id,
            stNode ? (getProperty(stNode, FIELD_NAMES.COLOR) as string | undefined) ?? null : null,
          )
        }

        const defs = getSupertagFieldDefinitions(db, supertag.id, cache)
        for (const ancestorId of getAncestorSupertags(db, supertag.id, undefined, cache)) {
          for (const [systemId, def] of getSupertagFieldDefinitions(db, ancestorId, cache)) {
            if (!defs.has(systemId)) defs.set(systemId, def)
          }
        }
      }
    }

    if (depth >= 3 || loadedIds.length === 0) break

    const childRows = db
      .select()
      .from(nodes)
      .where(and(inArray(nodes.ownerId, loadedIds), isNull(nodes.deletedAt)))
      .all()

    const nextFrontier: string[] = []
    for (const child of childRows) {
      if (!child.ownerId) continue
      const children = childIdsByParent.get(child.ownerId) ?? []
      children.push(child.id)
      childIdsByParent.set(child.ownerId, children)
      nextFrontier.push(child.id)
    }

    frontier = nextFrontier
    depth++
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

  return nodeMap.size
}

/** Mirrors the pre-optimization loadNode recursion: per-node assembly, per-node
 * children query, per-supertag-per-node display/def lookups, all uncached. */
function loadTreePerNode(rootId: string): number {
  const nodeMap = new Map<string, true>()

  function loadNode(nodeId: string, depth: number): void {
    if (nodeMap.has(nodeId)) return
    const assembled = assembleNode(db, nodeId)
    if (!assembled || assembled.deletedAt) return
    nodeMap.set(nodeId, true)

    for (const supertag of assembled.supertags) {
      assembleNode(db, supertag.id)
      const defs = getSupertagFieldDefinitions(db, supertag.id)
      for (const ancestorId of getAncestorSupertags(db, supertag.id)) {
        for (const [systemId, def] of getSupertagFieldDefinitions(db, ancestorId)) {
          if (!defs.has(systemId)) defs.set(systemId, def)
        }
      }
    }

    if (depth >= 3) return
    const childRows = db
      .select()
      .from(nodes)
      .where(and(inArray(nodes.ownerId, [nodeId]), isNull(nodes.deletedAt)))
      .all()
    for (const child of childRows) loadNode(child.id, depth + 1)
  }

  loadNode(rootId, 0)
  return nodeMap.size
}

describe('request-scoped assembly cache performance', () => {
  it('assembles a depth-4 1000-node tree with bounded read queries', () => {
    const { rootId, nodeCount } = seedAssemblyFixture()
    clearSystemNodeCache()

    queryCount = 0
    const startedAt = performance.now()
    const assembledCount = loadTreeFrontier(rootId)
    const elapsedMs = performance.now() - startedAt
    const cachedQueries = queryCount

    expect(assembledCount).toBe(nodeCount)
    expect(cachedQueries).toBeLessThan(150)

    clearSystemNodeCache()
    queryCount = 0
    const baselineStartedAt = performance.now()
    const baselineCount = loadTreePerNode(rootId)
    const baselineElapsedMs = performance.now() - baselineStartedAt
    const baselineQueries = queryCount

    expect(baselineCount).toBe(nodeCount)
    // The frontier+cache path must beat per-node assembly by an order of magnitude
    // in statement count; this is the contract, elapsed time is informational.
    expect(cachedQueries * 10).toBeLessThan(baselineQueries)
    console.info(
      `frontier assembly ${nodeCount} nodes: ${elapsedMs.toFixed(2)}ms, ${cachedQueries} SQL statements; ` +
        `per-node baseline: ${baselineElapsedMs.toFixed(2)}ms, ${baselineQueries} SQL statements`,
    )
  })
})
