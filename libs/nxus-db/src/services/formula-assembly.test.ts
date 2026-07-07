import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  type FieldContentName,
  type FieldSystemId,
} from '../schemas/node-schema.js'
import { bootstrapSystemNodesSync } from './bootstrap.js'
import {
  addNodeSupertag,
  assembleNode,
  clearSystemNodeCache,
  createNode,
  getProperty,
  setProperty,
} from './node.service.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

beforeEach(() => {
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

describe('formula field assembly stories', () => {
  it('computes a formula field declared on a supertag from same-node operands', () => {
    const productTag = createNode(db, { content: '#Product', systemId: 'supertag:product' })
    addNodeSupertag(db, productTag, SYSTEM_SUPERTAGS.SUPERTAG)

    const priceField = createNode(db, { content: 'Price', systemId: 'field:price' })
    addNodeSupertag(db, priceField, SYSTEM_SUPERTAGS.FIELD)
    setProperty(db, priceField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

    const quantityField = createNode(db, { content: 'Quantity', systemId: 'field:quantity' })
    addNodeSupertag(db, quantityField, SYSTEM_SUPERTAGS.FIELD)
    setProperty(db, quantityField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

    const totalField = createNode(db, { content: 'Total', systemId: 'field:total' })
    addNodeSupertag(db, totalField, SYSTEM_SUPERTAGS.FIELD)
    setProperty(db, totalField, SYSTEM_FIELDS.FIELD_TYPE, 'formula')
    setProperty(db, totalField, SYSTEM_FIELDS.FORMULA, '{Price} * {Quantity}')

    setProperty(db, productTag, 'field:price' as FieldSystemId, null)
    setProperty(db, productTag, 'field:quantity' as FieldSystemId, null)
    setProperty(db, productTag, 'field:total' as FieldSystemId, null)

    const product = createNode(db, { content: 'Widget' })
    addNodeSupertag(db, product, 'supertag:product')
    setProperty(db, product, 'field:price' as FieldSystemId, 12)
    setProperty(db, product, 'field:quantity' as FieldSystemId, 3)

    const assembled = assembleNode(db, product)
    expect(assembled).not.toBeNull()
    expect(getProperty(assembled!, 'Total' as FieldContentName)).toBe(36)
  })

  it('rejects formula fields that reference formula fields during assembly', () => {
    const tag = createNode(db, { content: '#Calc', systemId: 'supertag:calc' })
    addNodeSupertag(db, tag, SYSTEM_SUPERTAGS.SUPERTAG)

    const baseField = createNode(db, { content: 'Base', systemId: 'field:base' })
    addNodeSupertag(db, baseField, SYSTEM_SUPERTAGS.FIELD)
    setProperty(db, baseField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

    const subtotalField = createNode(db, { content: 'Subtotal', systemId: 'field:subtotal' })
    addNodeSupertag(db, subtotalField, SYSTEM_SUPERTAGS.FIELD)
    setProperty(db, subtotalField, SYSTEM_FIELDS.FIELD_TYPE, 'formula')
    setProperty(db, subtotalField, SYSTEM_FIELDS.FORMULA, '{Base} + 1')

    const totalField = createNode(db, { content: 'Total', systemId: 'field:total' })
    addNodeSupertag(db, totalField, SYSTEM_SUPERTAGS.FIELD)
    setProperty(db, totalField, SYSTEM_FIELDS.FIELD_TYPE, 'formula')
    setProperty(db, totalField, SYSTEM_FIELDS.FORMULA, '{Subtotal} + 1')

    setProperty(db, tag, 'field:base' as FieldSystemId, null)
    setProperty(db, tag, 'field:subtotal' as FieldSystemId, null)
    setProperty(db, tag, 'field:total' as FieldSystemId, null)

    const nodeId = createNode(db, { content: 'Calc node' })
    addNodeSupertag(db, nodeId, 'supertag:calc')
    setProperty(db, nodeId, 'field:base' as FieldSystemId, 1)

    const assembled = assembleNode(db, nodeId)
    expect(getProperty(assembled!, 'Total' as FieldContentName)).toEqual({
      error: 'Formula field cannot reference formula field: Subtotal',
    })
  })
})
