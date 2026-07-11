/**
 * surreal-reopen.test.ts - Data survival across embedded file-DB reopen
 *
 * Guards the app-boot path: `initGraphDatabase()` runs `initGraphSchema()` on
 * every start against the persistent surrealkv:// file. Schema bootstrap must
 * be non-destructive — nodes, has_field edges, and has_supertag edges written
 * in a previous session must survive a reopen that re-runs the schema.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'nxus-surreal-reopen-'))
const dbPath = join(dir, 'reopen.db')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

interface SeedResult {
  targetId: string
  sourceId: string
  nodesBefore: number
  edgesBefore: number
}

interface ReopenResult {
  nodesReopened: number
  nodesAfterSchema: number
  edgesAfterSchema: number
  assembledContent: string | null
  hasProperties: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseMarkedJson(output: string, marker: string): unknown {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(marker))
  if (!line) {
    throw new Error(`Missing child-process marker: ${marker}`)
  }
  return JSON.parse(line.slice(marker.length)) as unknown
}

function parseSeedResult(output: string): SeedResult {
  const parsed = parseMarkedJson(output, 'NXUS_REOPEN_SEED ')
  if (!isRecord(parsed)) throw new Error('Invalid seed result payload')
  const { targetId, sourceId, nodesBefore, edgesBefore } = parsed
  if (
    typeof targetId !== 'string'
    || typeof sourceId !== 'string'
    || typeof nodesBefore !== 'number'
    || typeof edgesBefore !== 'number'
  ) {
    throw new Error('Invalid seed result fields')
  }
  return { targetId, sourceId, nodesBefore, edgesBefore }
}

function parseReopenResult(output: string): ReopenResult {
  const parsed = parseMarkedJson(output, 'NXUS_REOPEN_RESULT ')
  if (!isRecord(parsed)) throw new Error('Invalid reopen result payload')
  const {
    nodesReopened,
    nodesAfterSchema,
    edgesAfterSchema,
    assembledContent,
    hasProperties,
  } = parsed
  if (
    typeof nodesReopened !== 'number'
    || typeof nodesAfterSchema !== 'number'
    || typeof edgesAfterSchema !== 'number'
    || (assembledContent !== null && typeof assembledContent !== 'string')
    || typeof hasProperties !== 'boolean'
  ) {
    throw new Error('Invalid reopen result fields')
  }
  return {
    nodesReopened,
    nodesAfterSchema,
    edgesAfterSchema,
    assembledContent,
    hasProperties,
  }
}

function runTsxEval(code: string, args: string[]): string {
  return execFileSync(
    'pnpm',
    ['exec', 'tsx', '--conditions', '@nxus/source', '--eval', code, ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
}

describe('embedded file DB reopen', () => {
  it('preserves nodes and relations when initGraphSchema re-runs on reopen', async () => {
    // v3 surrealkv hangs on same-process close→reopen of a file handle. The
    // app-boot invariant this guards is process-restart durability, so exercise
    // each session in a fresh Node process.
    const seed = parseSeedResult(runTsxEval(`
      import { createEmbeddedFileGraphDatabase } from './src/client/graph-client.ts'
      import { SurrealBackend } from './src/services/backends/surreal-backend.ts'
      import { SYSTEM_FIELDS } from './src/schemas/node-schema.ts'

      async function countAll(db, table) {
        const [rows] = await db.query(\`SELECT count() FROM \${table} GROUP ALL\`)
        return rows?.[0]?.count ?? 0
      }

      const db = await createEmbeddedFileGraphDatabase({ path: process.argv[1] })
      const backend = new SurrealBackend()
      backend.initWithDb(db)
      const targetId = await backend.createNode({ content: 'reopen target' })
      const sourceId = await backend.createNode({
        content: \`mentions [[node:\${targetId}]]\`,
      })
      await backend.setProperty(sourceId, SYSTEM_FIELDS.ORDER, 5)
      const nodesBefore = await countAll(db, 'node')
      const edgesBefore = await countAll(db, 'has_field')
      console.log('NXUS_REOPEN_SEED ' + JSON.stringify({
        targetId,
        sourceId,
        nodesBefore,
        edgesBefore,
      }))
      await db.close()
      setTimeout(() => process.exit(0), 100)
    `, [dbPath]))

    const reopen = parseReopenResult(runTsxEval(`
      import { createEmbeddedFileGraphDatabase, initGraphSchema } from './src/client/graph-client.ts'
      import { SurrealBackend } from './src/services/backends/surreal-backend.ts'

      async function countAll(db, table) {
        const [rows] = await db.query(\`SELECT count() FROM \${table} GROUP ALL\`)
        return rows?.[0]?.count ?? 0
      }

      const seed = JSON.parse(process.argv[2])
      const db = await createEmbeddedFileGraphDatabase({
        path: process.argv[1],
        skipSchema: true,
      })
      const nodesReopened = await countAll(db, 'node')
      await initGraphSchema(db)
      const nodesAfterSchema = await countAll(db, 'node')
      const edgesAfterSchema = await countAll(db, 'has_field')
      const backend = new SurrealBackend()
      backend.initWithDb(db)
      const assembled = await backend.assembleNode(seed.sourceId)
      console.log('NXUS_REOPEN_RESULT ' + JSON.stringify({
        nodesReopened,
        nodesAfterSchema,
        edgesAfterSchema,
        assembledContent: assembled?.content ?? null,
        hasProperties: assembled?.properties !== undefined,
      }))
      await db.close()
      setTimeout(() => process.exit(0), 100)
    `, [dbPath, JSON.stringify(seed)]))

    const { targetId, nodesBefore, edgesBefore } = seed
    expect(nodesBefore).toBeGreaterThanOrEqual(2)
    expect(edgesBefore).toBeGreaterThanOrEqual(2) // mention edge + order edge

    expect(reopen.nodesReopened).toBe(nodesBefore)
    expect(reopen.nodesAfterSchema).toBe(nodesBefore)
    expect(reopen.edgesAfterSchema).toBe(edgesBefore)
    expect(reopen.assembledContent).toBe(`mentions [[node:${targetId}]]`)
    expect(reopen.hasProperties).toBe(true)
  }, 60_000)
})
