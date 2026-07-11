/**
 * todo-state.test.ts - Edge cases for field:todo_state, the 3-state checkbox
 * engine primitive (commit 0bf3cb7, spec/product/data-model.md).
 *
 * Three honest states: absent (not a todo), 'todo' (unchecked), 'done'
 * (checked). Uses the real bootstrap (same pattern as tif.test.ts /
 * bootstrap-parity.test.ts) since these tests exercise the query evaluator
 * against the actually-seeded field:todo_state node, not a hand-rolled stub.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { nodeProperties, FIELD_NAMES, SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../schemas/node-schema.js'
import {
  clearSystemNodeCache,
  createNode,
  deleteNode,
  findNodeById,
  getProperty,
  getSystemNode,
  restoreNode,
  setProperty,
} from './node.service.js'
import { bootstrapSystemNodesSync } from './bootstrap.js'
import { evaluateQuery } from './query-evaluator.service.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

function setupTestDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
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
    CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON nodes(owner_id);
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
    CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value);
  `)

  clearSystemNodeCache()
  bootstrapSystemNodesSync(db)
  return db
}

describe('field:todo_state — 3-state checkbox engine primitive', () => {
  beforeEach(() => {
    setupTestDatabase()
  })

  afterEach(() => {
    sqlite.close()
    clearSystemNodeCache()
  })

  describe('order-0 replace semantics', () => {
    it('setting todo_state twice (todo -> done) leaves exactly ONE property row', () => {
      const nodeId = createNode(db, { content: 'Buy milk' })
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'todo')
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'done')

      const todoField = getSystemNode(db, SYSTEM_FIELDS.TODO_STATE)
      expect(todoField).not.toBeNull()

      const rows = db
        .select()
        .from(nodeProperties)
        .where(and(eq(nodeProperties.nodeId, nodeId), eq(nodeProperties.fieldNodeId, todoField!.id)))
        .all()

      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0].value ?? 'null')).toBe('done')

      const assembled = findNodeById(db, nodeId)
      expect(assembled?.properties[FIELD_NAMES.TODO_STATE]).toHaveLength(1)
      expect(getProperty(assembled!, FIELD_NAMES.TODO_STATE)).toBe('done')
    })

    it('toggling done -> todo -> done still leaves exactly one row', () => {
      const nodeId = createNode(db, { content: 'Ping-pong task' })
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'todo')
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'done')
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'todo')
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'done')

      const todoField = getSystemNode(db, SYSTEM_FIELDS.TODO_STATE)!
      const rows = db
        .select()
        .from(nodeProperties)
        .where(and(eq(nodeProperties.nodeId, nodeId), eq(nodeProperties.fieldNodeId, todoField.id)))
        .all()

      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0].value ?? 'null')).toBe('done')
    })
  })

  describe('soft-delete interaction', () => {
    it('excludes a soft-deleted todo from query evaluation but its todoState survives for undelete', () => {
      const nodeId = createNode(db, { content: 'Ephemeral task', supertagId: SYSTEM_SUPERTAGS.TASK })
      setProperty(db, nodeId, SYSTEM_FIELDS.TODO_STATE, 'todo')

      const matchesBefore = evaluateQuery(db, {
        filters: [{ type: 'property', fieldId: SYSTEM_FIELDS.TODO_STATE, op: 'eq', value: 'todo' }],
        limit: 500,
      })
      expect(matchesBefore.nodes.map((n) => n.id)).toContain(nodeId)

      deleteNode(db, nodeId)

      const matchesAfterDelete = evaluateQuery(db, {
        filters: [{ type: 'property', fieldId: SYSTEM_FIELDS.TODO_STATE, op: 'eq', value: 'todo' }],
        limit: 500,
      })
      expect(matchesAfterDelete.nodes.map((n) => n.id)).not.toContain(nodeId)

      // The property row itself is untouched by a soft delete — reading the
      // node directly (bypassing query evaluation) still sees 'todo'.
      const deletedNode = findNodeById(db, nodeId)
      expect(deletedNode?.deletedAt).not.toBeNull()
      expect(getProperty(deletedNode!, FIELD_NAMES.TODO_STATE)).toBe('todo')

      restoreNode(db, nodeId)

      const matchesAfterRestore = evaluateQuery(db, {
        filters: [{ type: 'property', fieldId: SYSTEM_FIELDS.TODO_STATE, op: 'eq', value: 'todo' }],
        limit: 500,
      })
      expect(matchesAfterRestore.nodes.map((n) => n.id)).toContain(nodeId)
    })
  })

  describe('property filter systemId resolution', () => {
    it("{ fieldId: 'field:todo_state', op: 'eq', value: 'done' } matches done nodes and not todo nodes", () => {
      const doneNode = createNode(db, { content: 'Done task', supertagId: SYSTEM_SUPERTAGS.TASK })
      setProperty(db, doneNode, SYSTEM_FIELDS.TODO_STATE, 'done')

      const todoNode = createNode(db, { content: 'Todo task', supertagId: SYSTEM_SUPERTAGS.TASK })
      setProperty(db, todoNode, SYSTEM_FIELDS.TODO_STATE, 'todo')

      const untaggedNode = createNode(db, { content: 'Not a todo at all' })

      const result = evaluateQuery(db, {
        filters: [{ type: 'property', fieldId: 'field:todo_state', op: 'eq', value: 'done' }],
        limit: 500,
      })

      expect(result.nodes.map((n) => n.id)).toEqual([doneNode])
      expect(result.nodes.map((n) => n.id)).not.toContain(todoNode)
      expect(result.nodes.map((n) => n.id)).not.toContain(untaggedNode)
    })

    it('a node with no todoState property matches neither eq:todo nor eq:done', () => {
      const untaggedNode = createNode(db, { content: 'Plain node' })

      const todoMatches = evaluateQuery(db, {
        filters: [{ type: 'property', fieldId: 'field:todo_state', op: 'eq', value: 'todo' }],
        limit: 500,
      })
      const doneMatches = evaluateQuery(db, {
        filters: [{ type: 'property', fieldId: 'field:todo_state', op: 'eq', value: 'done' }],
        limit: 500,
      })

      expect(todoMatches.nodes.map((n) => n.id)).not.toContain(untaggedNode)
      expect(doneMatches.nodes.map((n) => n.id)).not.toContain(untaggedNode)
    })
  })

  describe('bootstrap parity — fieldType', () => {
    it('field:todo_state is seeded with fieldType "select" (not left as the text default)', () => {
      const todoStateNode = getSystemNode(db, SYSTEM_FIELDS.TODO_STATE)
      expect(todoStateNode).not.toBeNull()

      const assembled = findNodeById(db, todoStateNode!.id)
      expect(assembled).not.toBeNull()
      expect(getProperty(assembled!, FIELD_NAMES.FIELD_TYPE)).toBe('select')
    })
  })
})
