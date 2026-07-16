/**
 * tif.test.ts - Tests for Tana Intermediate Format import/export.
 *
 * Backend-parameterized: the importer/exporter run through NodeBackend, so
 * the same suite proves both SQLite and SurrealDB behavior (TIF-B* clauses).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIELD_NAMES, type FieldContentName } from '../../schemas/node-schema.js'
import { getProperty, getPropertyValues } from '../node.service.js'
import type { NodeBackend } from '../backends/types.js'
import {
  createTestSqliteBackend,
  createTestSurrealBackend,
} from '../backends/backend-test-factories.js'
import { importTanaIntermediateFile } from './tif-import.js'
import { exportSubtreeToTif } from './tif-export.js'
import type { TanaIntermediateFile, TanaIntermediateNode } from './tif-types.js'

const NOW = 1_700_000_000_000

function buildFixture(): TanaIntermediateFile {
  const linkedUid = 'n-linked'
  const rootUid = 'n-root'
  const childUid = 'n-child'
  const grandchildUid = 'n-grandchild'
  const dateUid = 'n-date'
  const codeUid = 'n-code'

  const node = (partial: Partial<TanaIntermediateNode> & Pick<TanaIntermediateNode, 'uid' | 'name' | 'type'>): TanaIntermediateNode => ({
    createdAt: NOW,
    editedAt: NOW,
    ...partial,
  })

  const fieldCarrier = (uid: string, name: string, valueUid: string, valueName: string): TanaIntermediateNode =>
    node({
      uid,
      name,
      type: 'field',
      children: [node({ uid: valueUid, name: valueName, type: 'node' })],
    })

  return {
    version: 'TanaIntermediateFile V0.1',
    summary: { leafNodes: 3, topLevelNodes: 4, totalNodes: 20, calendarNodes: 1, fields: 6, brokenRefs: 0 },
    supertags: [{ uid: 'st-task', name: 'Task' }],
    attributes: [
      { name: 'Status', values: ['active'], count: 1, dataType: 'any' },
      { name: 'Website', values: ['https://example.com'], count: 1, dataType: 'url' },
      { name: 'Contact', values: ['owner@example.com'], count: 1, dataType: 'email' },
      { name: 'Priority', values: ['3'], count: 1, dataType: 'number' },
      { name: 'Due', values: ['2024-01-15'], count: 1, dataType: 'date' },
      { name: 'Urgent', values: ['True'], count: 1, dataType: 'checkbox' },
    ],
    nodes: [
      node({
        uid: rootUid,
        name: 'Project Alpha',
        type: 'node',
        supertags: ['st-task'],
        refs: [linkedUid],
        children: [
          fieldCarrier('f-status', 'Status', 'v-status', 'active'),
          fieldCarrier('f-website', 'Website', 'v-website', 'https://example.com'),
          fieldCarrier('f-contact', 'Contact', 'v-contact', 'owner@example.com'),
          fieldCarrier('f-priority', 'Priority', 'v-priority', '3'),
          fieldCarrier('f-due', 'Due', 'v-due', '2024-01-15'),
          fieldCarrier('f-urgent', 'Urgent', 'v-urgent', 'True'),
          node({
            uid: childUid,
            name: `See also [[${linkedUid}]]`,
            type: 'node',
            todoState: 'todo',
            children: [node({ uid: grandchildUid, name: 'Nested detail', type: 'node' })],
          }),
        ],
      }),
      node({ uid: linkedUid, name: 'Linked Reference Node', type: 'node' }),
      node({ uid: dateUid, name: '2024-01-15', type: 'date' }),
      node({ uid: codeUid, name: 'console.log(1)', type: 'codeblock' , codeLanguage: 'javascript' }),
    ],
  }
}

describe.each([
  ['sqlite', createTestSqliteBackend],
  ['surreal', createTestSurrealBackend],
] as const)('TIF import (%s)', (_name, factory) => {
  let backend: NodeBackend
  let cleanup: () => Promise<void>
  let baselineRootCount: number

  async function childrenOf(ownerId: string) {
    const byParent = await backend.getChildrenByParents([ownerId])
    return byParent.get(ownerId) ?? []
  }

  beforeEach(async () => {
    const ctx = await factory()
    backend = ctx.backend
    cleanup = ctx.cleanup
    baselineRootCount = (await backend.getRootNodes()).length
  })

  afterEach(async () => {
    await cleanup()
  })

  it('TIF-B1: imports nested children, supertags, fields (each dataType), refs, todo, date, codeblock', async () => {
    const fixture = buildFixture()
    const summary = await importTanaIntermediateFile(backend, fixture)

    expect(summary.brokenRefs).toBe(0)
    expect(summary.skipped).toEqual([])
    expect(summary.supertagsImported).toBe(1)
    expect(summary.fieldsImported).toBe(6)
    expect(summary.topLevelNodesImported).toBe(4)
    expect(summary.refsResolved).toBe(1)
    expect(summary.topLevelNodeIds).toHaveLength(4)

    const [rootId, linkedId, dateId, codeId] = summary.topLevelNodeIds
    // Content tokens always carry the bare uuid, even where the backend's
    // canonical id form is prefixed ('node:<uuid>' on Surreal).
    const bareLinkedId = linkedId.replace(/^node:/, '')

    const root = await backend.findNodeById(rootId)
    expect(root).not.toBeNull()
    expect(root?.content).toBe(`Project Alpha [[node:${bareLinkedId}]]`)
    expect(root?.supertags.map((st) => st.systemId)).toEqual(['supertag:tif_task'])
    const mentionValues = getPropertyValues<string>(root!, 'mentions' as FieldContentName)
    expect(mentionValues).toHaveLength(1)
    expect(String(mentionValues[0])).toContain(bareLinkedId)

    expect(getProperty(root!, 'Status' as FieldContentName)).toBe('active')
    expect(getProperty(root!, 'Website' as FieldContentName)).toBe('https://example.com')
    expect(getProperty(root!, 'Contact' as FieldContentName)).toBe('owner@example.com')
    expect(getProperty(root!, 'Priority' as FieldContentName)).toBe(3)
    expect(getProperty(root!, 'Due' as FieldContentName)).toBe('2024-01-15')
    expect(getProperty(root!, 'Urgent' as FieldContentName)).toBe(true)

    // Field carriers collapse into properties — root has exactly one real outline child.
    const rootChildren = await childrenOf(root!.id)
    expect(rootChildren).toHaveLength(1)
    const childNode = rootChildren[0]
    expect(childNode.content).toBe(`See also [[node:${bareLinkedId}]]`)
    expect(getProperty(childNode, FIELD_NAMES.TODO_STATE)).toBe('todo')

    const grandchildren = await childrenOf(childNode.id)
    expect(grandchildren).toHaveLength(1)
    expect(grandchildren[0].content).toBe('Nested detail')

    const dateNode = await backend.findNodeById(dateId)
    expect(dateNode?.content).toBe('2024-01-15')
    expect(getProperty(dateNode!, 'TIF node type' as FieldContentName)).toBe('date')

    const codeNode = await backend.findNodeById(codeId)
    expect(codeNode?.content).toBe('console.log(1)')
    expect(getProperty(codeNode!, 'TIF node type' as FieldContentName)).toBe('codeblock')
    expect(getProperty(codeNode!, 'TIF code language' as FieldContentName)).toBe('javascript')
  })

  it('TIF-B2: round-trips — export what was imported, re-import into a fresh backend, structurally equal (uids differ)', async () => {
    // System nodes live at root level — import under a wrapper node so the
    // exported subtree is exactly our fixture data.
    const wrapperId = await backend.createNode({ content: 'Import root' })
    const fixture = buildFixture()
    await importTanaIntermediateFile(backend, fixture, { ownerId: wrapperId })
    const exported = await exportSubtreeToTif(backend, wrapperId)

    const fresh = await factory()
    try {
      const summary2 = await importTanaIntermediateFile(fresh.backend, exported)
      expect(summary2.brokenRefs).toBe(0)
      expect(summary2.topLevelNodeIds).toHaveLength(1)
      const reExported = await exportSubtreeToTif(fresh.backend, summary2.topLevelNodeIds[0])

      // uids are real DB ids and MUST differ across the two databases.
      expect(reExported.nodes[0].uid).not.toBe(exported.nodes[0].uid)

      // Structural equality: same shape/content/tags/fields once uid-bearing
      // fields are normalized away.
      expect(normalizeFile(reExported)).toEqual(normalizeFile(exported))
      expect(reExported.summary).toEqual(exported.summary)
    } finally {
      await fresh.cleanup()
    }
  })

  it('TIF-B3: rejects a malformed file (Zod) and leaves the database untouched', async () => {
    const malformed = { version: 'not-a-tif-version', nodes: [] }
    await expect(importTanaIntermediateFile(backend, malformed)).rejects.toThrow()
    expect((await backend.getRootNodes()).length).toBe(baselineRootCount)
  })

  it('TIF-B4: rejects a duplicate uid before anything is written', async () => {
    const dup: TanaIntermediateFile = {
      version: 'TanaIntermediateFile V0.1',
      summary: { leafNodes: 0, topLevelNodes: 2, totalNodes: 2, calendarNodes: 0, fields: 0, brokenRefs: 0 },
      nodes: [
        { uid: 'dup-1', name: 'First', type: 'node', createdAt: NOW, editedAt: NOW },
        { uid: 'dup-1', name: 'Second (duplicate uid)', type: 'node', createdAt: NOW, editedAt: NOW },
      ],
    }

    await expect(importTanaIntermediateFile(backend, dup)).rejects.toThrow(/duplicate uid/)
    // Id preallocation means the duplicate check runs before the bulk write —
    // nothing lands in the database, on either backend.
    expect((await backend.getRootNodes()).length).toBe(baselineRootCount)
  })

  it('TIF-B5: counts an unknown supertag uid as broken but still imports the node', async () => {
    const tifWithUnknownTag: TanaIntermediateFile = {
      version: 'TanaIntermediateFile V0.1',
      summary: { leafNodes: 1, topLevelNodes: 1, totalNodes: 1, calendarNodes: 0, fields: 0, brokenRefs: 1 },
      nodes: [
        {
          uid: 'n-1',
          name: 'Tagged with ghost',
          type: 'node',
          createdAt: NOW,
          editedAt: NOW,
          supertags: ['ghost-uid'],
        },
      ],
    }

    const summary = await importTanaIntermediateFile(backend, tifWithUnknownTag)
    expect(summary.brokenRefs).toBe(1)
    expect(summary.skipped.some((s) => s.uid === 'ghost-uid')).toBe(true)
    expect(summary.nodesImported).toBe(1)

    const node = await backend.findNodeById(summary.topLevelNodeIds[0])
    expect(node?.supertags).toHaveLength(0)
  })
})

// ============================================================================
// Round-trip comparison helper
// ============================================================================

const BRACKET_REF = /\[\[[^[\]]+\]\]/g

function normalizeNode(n: TanaIntermediateNode): unknown {
  return {
    name: n.name.replace(BRACKET_REF, '[[REF]]'),
    description: n.description?.replace(BRACKET_REF, '[[REF]]'),
    type: n.type,
    mediaUrl: n.mediaUrl,
    codeLanguage: n.codeLanguage,
    todoState: n.todoState,
    viewType: n.viewType,
    flags: n.flags,
    refsCount: n.refs?.length ?? 0,
    supertagCount: n.supertags?.length ?? 0,
    children: (n.children ?? []).map(normalizeNode),
  }
}

function normalizeFile(f: TanaIntermediateFile): unknown {
  return {
    nodes: f.nodes.map(normalizeNode),
    attributes: (f.attributes ?? [])
      .map((a) => ({ name: a.name, values: [...a.values].sort(), count: a.count, dataType: a.dataType }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    supertagNames: (f.supertags ?? []).map((s) => s.name).sort(),
  }
}
