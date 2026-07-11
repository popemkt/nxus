import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schemas/item-schema.js'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  type FieldSystemId,
} from '../schemas/node-schema.js'
import { bootstrapSystemNodesSync } from '../services/bootstrap.js'
import {
  addNodeSupertag,
  clearSystemNodeCache,
  createNode,
  getSystemNode,
  setProperty,
  withNodeMutationTransaction,
} from '../services/node.service.js'

type Db = BetterSQLite3Database<typeof schema>

export interface SeedGraphOptions {
  /** Outline node count, excluding bootstrap/system nodes and benchmark tag/field definitions. Default: 10_000. */
  nodeCount: number
  /** Deterministic logical graph seed. Default: 0x6e787573. */
  seed?: number
  /** Hard cap for parent depth. Default: 8. */
  maxDepth?: number
  /** Average breadth target per parent before depth pressure is applied. Default: 8. */
  branching?: number
  /** Benchmark supertags to create and distribute across outline nodes. Default: 8. */
  supertagCount?: number
  /** Field definitions created per benchmark supertag, clamped to 2..4. Default: 3. */
  fieldsPerTag?: number
  /** Fraction of outline nodes with field:todo_state. Default: 0.2. */
  todoRatio?: number
  /** Fraction of outline nodes with an ISO date benchmark field. Default: 0.15. */
  dateFieldRatio?: number
}

export interface SeededGraph {
  db: Db
  sqlite: Database.Database
  dir: string
  rootIds: string[]
  counts: {
    nodeCount: number
    outlineNodeCount: number
    supertagCount: number
    fieldsPerTag: number
    propertyWriteCount: number
    seedMs: number
  }
  supertagSystemIds: string[]
  fieldSystemIds: FieldSystemId[]
  cleanup: () => void
}

interface NormalizedSeedGraphOptions {
  nodeCount: number
  seed: number
  maxDepth: number
  branching: number
  supertagCount: number
  fieldsPerTag: number
  todoRatio: number
  dateFieldRatio: number
}

interface TagDef {
  systemId: string
  nodeId: string
  fieldIds: FieldSystemId[]
}

const CLEANUP_DIRS = new Set<string>()
let cleanupRegistered = false

function registerCleanup(dir: string): void {
  CLEANUP_DIRS.add(dir)
  if (cleanupRegistered) return
  cleanupRegistered = true
  process.on('exit', () => {
    for (const cleanupDir of CLEANUP_DIRS) {
      rmSync(cleanupDir, { recursive: true, force: true })
    }
  })
}

function normalizeOptions(options: SeedGraphOptions): NormalizedSeedGraphOptions {
  return {
    nodeCount: options.nodeCount,
    seed: options.seed ?? 0x6e787573,
    maxDepth: options.maxDepth ?? 8,
    branching: options.branching ?? 8,
    supertagCount: options.supertagCount ?? 8,
    fieldsPerTag: Math.max(2, Math.min(4, options.fieldsPerTag ?? 3)),
    todoRatio: options.todoRatio ?? 0.2,
    dateFieldRatio: options.dateFieldRatio ?? 0.15,
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function benchmarkFieldSystemId(tagIndex: number, fieldIndex: number): FieldSystemId {
  return `field:bench_${tagIndex}_${fieldIndex}` as FieldSystemId
}

function applyDdl(sqlite: Database.Database): void {
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;

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
    CREATE INDEX IF NOT EXISTS idx_nodes_content_plain ON nodes(content_plain);

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
    CREATE INDEX IF NOT EXISTS idx_node_properties_node_field ON node_properties(node_id, field_node_id);
  `)
}

function createTagDefinitions(db: Db, opts: NormalizedSeedGraphOptions): TagDef[] {
  const tagDefs: TagDef[] = []

  for (let tagIndex = 0; tagIndex < opts.supertagCount; tagIndex++) {
    const tagSystemId = `supertag:bench_${tagIndex}`
    const tagId = createNode(db, {
      content: `#Bench ${tagIndex}`,
      systemId: tagSystemId,
    })
    addNodeSupertag(db, tagId, SYSTEM_SUPERTAGS.SUPERTAG)
    setProperty(db, tagId, SYSTEM_FIELDS.COLOR, ['red', 'green', 'blue', 'yellow'][tagIndex % 4])

    if (tagIndex > 0 && tagIndex < 3) {
      setProperty(db, tagId, SYSTEM_FIELDS.EXTENDS, tagDefs[tagIndex - 1]!.nodeId)
    }

    const fieldIds: FieldSystemId[] = []
    for (let fieldIndex = 0; fieldIndex < opts.fieldsPerTag; fieldIndex++) {
      const fieldSystemId = benchmarkFieldSystemId(tagIndex, fieldIndex)
      const fieldId = createNode(db, {
        content: `Bench ${tagIndex}.${fieldIndex}`,
        systemId: fieldSystemId,
      })
      addNodeSupertag(db, fieldId, SYSTEM_SUPERTAGS.FIELD)
      const fieldType = fieldIndex === 1 ? 'number' : fieldIndex === 2 ? 'date' : 'text'
      setProperty(db, fieldId, SYSTEM_FIELDS.FIELD_TYPE, fieldType)
      setProperty(db, tagId, fieldSystemId, null)
      fieldIds.push(fieldSystemId)
    }

    tagDefs.push({ systemId: tagSystemId, nodeId: tagId, fieldIds })
  }

  return tagDefs
}

function chooseParent(
  rng: () => number,
  parentPool: Array<{ id: string; depth: number; childCount: number }>,
  maxDepth: number,
  branching: number,
): { id: string; depth: number; childCount: number } {
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = parentPool[Math.floor(rng() * parentPool.length)]!
    if (candidate.depth >= maxDepth) continue
    const depthBias = 1 - candidate.depth / (maxDepth + 1)
    const childPressure = Math.max(0.08, 1 - candidate.childCount / (branching * 2))
    if (rng() < Math.max(0.05, depthBias * childPressure)) return candidate
  }

  return parentPool.find((candidate) => candidate.depth < maxDepth) ?? parentPool[0]!
}

function isoDateFor(index: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + (index % 365)))
  return date.toISOString().slice(0, 10)
}

export function seedGraph(options: SeedGraphOptions): SeededGraph {
  const opts = normalizeOptions(options)
  const started = performance.now()
  const dir = mkdtempSync(join(tmpdir(), 'nxus-bench-'))
  registerCleanup(dir)

  const sqlite = new Database(join(dir, 'bench.sqlite'))
  applyDdl(sqlite)
  const db = drizzle(sqlite, { schema })
  clearSystemNodeCache()
  bootstrapSystemNodesSync(db)

  const rng = mulberry32(opts.seed)
  let propertyWriteCount = 0
  let cleaned = false

  const tagDefs = createTagDefinitions(db, opts)
  propertyWriteCount += opts.supertagCount * (2 + opts.fieldsPerTag * 2) + 2

  const rootId = createNode(db, { content: 'Benchmark workspace root' })
  setProperty(db, rootId, SYSTEM_FIELDS.ORDER, 0)
  propertyWriteCount++

  const parentPool: Array<{ id: string; depth: number; childCount: number }> = [
    { id: rootId, depth: 0, childCount: 0 },
  ]

  function seedBatch(startIndex: number, endIndex: number): void {
    withNodeMutationTransaction(db, (tx) => {
      for (let index = startIndex; index < endIndex; index++) {
        const parent = chooseParent(rng, parentPool, opts.maxDepth, opts.branching)
        const tag = tagDefs[index % tagDefs.length]!
        const nodeId = createNode(tx, {
          content: `bench node ${index} tana scale searchable ${index % 17 === 0 ? 'needle' : 'body'}`,
          ownerId: parent.id,
        })
        const order = parent.childCount++
        setProperty(tx, nodeId, SYSTEM_FIELDS.ORDER, order)
        addNodeSupertag(tx, nodeId, tag.systemId)
        propertyWriteCount += 2

        if (rng() < opts.todoRatio) {
          setProperty(tx, nodeId, SYSTEM_FIELDS.TODO_STATE, rng() < 0.35 ? 'done' : 'todo')
          propertyWriteCount++
        }

        for (let fieldIndex = 0; fieldIndex < tag.fieldIds.length; fieldIndex++) {
          const density = fieldIndex === 2 ? opts.dateFieldRatio : 0.72
          if (rng() >= density) continue
          const value = fieldIndex === 1
            ? index
            : fieldIndex === 2
              ? isoDateFor(index)
              : `value-${tag.systemId}-${index % 97}`
          setProperty(tx, nodeId, tag.fieldIds[fieldIndex]!, value)
          propertyWriteCount++
        }

        parentPool.push({ id: nodeId, depth: parent.depth + 1, childCount: 0 })
      }
    })
  }

  const batchSize = 750
  for (let start = 1; start < opts.nodeCount; start += batchSize) {
    seedBatch(start, Math.min(opts.nodeCount, start + batchSize))
  }

  const seedMs = performance.now() - started
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    try {
      sqlite.close()
    } finally {
      clearSystemNodeCache()
      CLEANUP_DIRS.delete(dir)
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const firstFieldNode = getSystemNode(db, tagDefs[0]!.fieldIds[0]!)
  if (!firstFieldNode) {
    cleanup()
    throw new Error('benchmark seed failed to create first field definition')
  }

  return {
    db,
    sqlite,
    dir,
    rootIds: [rootId],
    counts: {
      nodeCount: opts.nodeCount,
      outlineNodeCount: opts.nodeCount,
      supertagCount: opts.supertagCount,
      fieldsPerTag: opts.fieldsPerTag,
      propertyWriteCount,
      seedMs,
    },
    supertagSystemIds: tagDefs.map((tag) => tag.systemId),
    fieldSystemIds: tagDefs.flatMap((tag) => tag.fieldIds),
    cleanup,
  }
}
