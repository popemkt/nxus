/**
 * surreal-reopen.test.ts - Data survival across embedded file-DB reopen
 *
 * Guards the app-boot path: `initGraphDatabase()` runs `initGraphSchema()` on
 * every start against the persistent surrealkv:// file. Schema bootstrap must
 * be non-destructive — nodes, has_field edges, and has_supertag edges written
 * in a previous session must survive a reopen that re-runs the schema.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Surreal } from 'surrealdb'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createEmbeddedFileGraphDatabase,
  initGraphSchema,
} from '../../client/graph-client.js'
import { SurrealBackend } from './surreal-backend.js'
import { SYSTEM_FIELDS } from '../../schemas/node-schema.js'

const dir = mkdtempSync(join(tmpdir(), 'nxus-surreal-reopen-'))
const dbPath = join(dir, 'reopen.db')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function countAll(db: Surreal, table: string): Promise<number> {
  const [rows] = await db.query<[Array<{ count: number }>]>(
    `SELECT count() FROM ${table} GROUP ALL`,
  )
  return rows?.[0]?.count ?? 0
}

describe('embedded file DB reopen', () => {
  it('preserves nodes and relations when initGraphSchema re-runs on reopen', async () => {
    // Session 1: fresh schema + seed through the backend
    const db1 = await createEmbeddedFileGraphDatabase({ path: dbPath })
    const backend1 = new SurrealBackend()
    backend1.initWithDb(db1)
    const targetId = await backend1.createNode({ content: 'reopen target' })
    const sourceId = await backend1.createNode({
      content: `mentions [[node:${targetId}]]`,
    })
    await backend1.setProperty(sourceId, SYSTEM_FIELDS.ORDER, 5)

    const nodesBefore = await countAll(db1, 'node')
    const edgesBefore = await countAll(db1, 'has_field')
    expect(nodesBefore).toBeGreaterThanOrEqual(2)
    expect(edgesBefore).toBeGreaterThanOrEqual(2) // mention edge + order edge
    await db1.close()

    // Session 2: reopen the same file and re-run schema bootstrap (app boot path)
    const db2 = await createEmbeddedFileGraphDatabase({ path: dbPath, skipSchema: true })
    const nodesReopened = await countAll(db2, 'node')
    expect(nodesReopened).toBe(nodesBefore)

    await initGraphSchema(db2)
    const nodesAfterSchema = await countAll(db2, 'node')
    const edgesAfterSchema = await countAll(db2, 'has_field')

    const backend2 = new SurrealBackend()
    backend2.initWithDb(db2)
    const assembled = await backend2.assembleNode(sourceId)
    await db2.close()

    expect(nodesAfterSchema).toBe(nodesBefore)
    expect(edgesAfterSchema).toBe(edgesBefore)
    expect(assembled?.content).toBe(`mentions [[node:${targetId}]]`)
    expect(assembled?.properties).toBeDefined()
  }, 60_000)
})
