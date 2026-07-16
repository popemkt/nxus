/**
 * tif-edge-cases.test.ts - Adversarial edge cases for TIF import/export
 * (extends tif.test.ts without editing it). Backend-parameterized like
 * tif.test.ts.
 *
 * Covers:
 *  - todoState 'done' round-trips through FIELD_NAMES.TODO_STATE and does
 *    NOT also get emitted as a duplicate generic field-carrier on export.
 *  - a `refs[]` entry that points at a `type:'field'` carrier's uid (which is
 *    never added to the import uidMap, since carriers aren't real outline
 *    nodes) is counted as a broken ref but does not fail the import.
 *  - deeply nested children (depth 10) preserve monotonic per-sibling-group
 *    `field:order` values.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIELD_NAMES, type FieldContentName } from '../../schemas/node-schema.js'
import { getProperty } from '../node.service.js'
import type { NodeBackend } from '../backends/types.js'
import {
  createTestSqliteBackend,
  createTestSurrealBackend,
} from '../backends/backend-test-factories.js'
import { importTanaIntermediateFile } from './tif-import.js'
import { exportSubtreeToTif } from './tif-export.js'
import type { TanaIntermediateFile, TanaIntermediateNode } from './tif-types.js'

const NOW = 1_700_000_000_000

function node(partial: Partial<TanaIntermediateNode> & Pick<TanaIntermediateNode, 'uid' | 'name' | 'type'>): TanaIntermediateNode {
  return { createdAt: NOW, editedAt: NOW, ...partial }
}

describe.each([
  ['sqlite', createTestSqliteBackend],
  ['surreal', createTestSurrealBackend],
] as const)('TIF edge cases (%s)', (_name, factory) => {
  let backend: NodeBackend
  let cleanup: () => Promise<void>

  async function childrenOf(ownerId: string) {
    const byParent = await backend.getChildrenByParents([ownerId])
    return byParent.get(ownerId) ?? []
  }

  beforeEach(async () => {
    const ctx = await factory()
    backend = ctx.backend
    cleanup = ctx.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('todoState "done" round-trip', () => {
    it('TIF-B6: import sets field:todo_state to "done" via FIELD_NAMES.TODO_STATE', async () => {
      const fixture: TanaIntermediateFile = {
        version: 'TanaIntermediateFile V0.1',
        summary: { leafNodes: 1, topLevelNodes: 1, totalNodes: 1, calendarNodes: 0, fields: 0, brokenRefs: 0 },
        nodes: [node({ uid: 'n-done', name: 'Finished task', type: 'node', todoState: 'done' })],
      }

      const summary = await importTanaIntermediateFile(backend, fixture)
      const imported = await backend.findNodeById(summary.topLevelNodeIds[0])

      expect(imported).not.toBeNull()
      expect(getProperty(imported!, FIELD_NAMES.TODO_STATE)).toBe('done')
    })

    it('TIF-B7: export reproduces todoState "done" and does NOT also emit a duplicate generic field-carrier for it', async () => {
      const fixture: TanaIntermediateFile = {
        version: 'TanaIntermediateFile V0.1',
        summary: { leafNodes: 1, topLevelNodes: 1, totalNodes: 1, calendarNodes: 0, fields: 0, brokenRefs: 0 },
        nodes: [node({ uid: 'n-done', name: 'Finished task', type: 'node', todoState: 'done' })],
      }
      const summary = await importTanaIntermediateFile(backend, fixture)

      // Export starting AT the imported node itself (not a wrapper) —
      // exportSubtreeToTif(backend, rootNodeId) returns that node as `nodes[0]`.
      const exported = await exportSubtreeToTif(backend, summary.topLevelNodeIds[0])
      const exportedNode = exported.nodes[0]

      expect(exportedNode.todoState).toBe('done')

      // The exported node MUST NOT also carry a `type:'field'` carrier child
      // named after the todoState field's content — that would be a duplicate
      // representation of the same fact via two different TIF mechanisms.
      const fieldCarrierNames = (exportedNode.children ?? [])
        .filter((c) => c.type === 'field')
        .map((c) => c.name)
      expect(fieldCarrierNames).not.toContain(FIELD_NAMES.TODO_STATE)
      expect(fieldCarrierNames).not.toContain('todoState')
      expect(exported.summary.fields).toBe(0)
    })

    it('todoState "todo" also round-trips without a duplicate carrier (not just "done")', async () => {
      const fixture: TanaIntermediateFile = {
        version: 'TanaIntermediateFile V0.1',
        summary: { leafNodes: 1, topLevelNodes: 1, totalNodes: 1, calendarNodes: 0, fields: 0, brokenRefs: 0 },
        nodes: [node({ uid: 'n-todo', name: 'Pending task', type: 'node', todoState: 'todo' })],
      }
      const summary = await importTanaIntermediateFile(backend, fixture)

      const exported = await exportSubtreeToTif(backend, summary.topLevelNodeIds[0])
      expect(exported.nodes[0].todoState).toBe('todo')
      expect((exported.nodes[0].children ?? []).some((c) => c.type === 'field')).toBe(false)
    })
  })

  describe('refs pointing at a field-carrier uid', () => {
    it('TIF-B8: a ref to a `type:field` carrier uid counts as a broken ref but import still succeeds', async () => {
      // 'owner' has a field carrier 'f-status' (never added to the uidMap —
      // field carriers are not real outline nodes). 'other' references that
      // carrier's uid via refs[], which cannot resolve.
      const fixture: TanaIntermediateFile = {
        version: 'TanaIntermediateFile V0.1',
        summary: { leafNodes: 1, topLevelNodes: 2, totalNodes: 4, calendarNodes: 0, fields: 1, brokenRefs: 1 },
        nodes: [
          node({
            uid: 'owner',
            name: 'Owner node',
            type: 'node',
            children: [
              node({
                uid: 'f-status',
                name: 'Status',
                type: 'field',
                children: [node({ uid: 'v-status', name: 'active', type: 'node' })],
              }),
            ],
          }),
          node({ uid: 'other', name: 'Refers to the field carrier', type: 'node', refs: ['f-status'] }),
        ],
      }

      const summary = await importTanaIntermediateFile(backend, fixture)

      expect(summary.brokenRefs).toBeGreaterThanOrEqual(1)
      expect(summary.topLevelNodeIds).toHaveLength(2)

      const owner = await backend.findNodeById(summary.topLevelNodeIds[0])
      const other = await backend.findNodeById(summary.topLevelNodeIds[1])
      expect(owner).not.toBeNull()
      expect(other).not.toBeNull()
      expect(getProperty(owner!, 'Status' as FieldContentName)).toBe('active')
      // The unresolved ref must not have silently become a mention/property —
      // 'other' has no resolved refs at all.
      expect(other?.properties['mentions' as FieldContentName]).toBeUndefined()
    })
  })

  describe('deeply nested children (depth 10) preserve monotonic order per sibling group', () => {
    it('TIF-B9: a 10-level single-child chain plus a 3-way sibling group at the leaf all get correctly ordered field:order values', async () => {
      const DEPTH = 10

      // Build depth-9 -> depth-0 (innermost first), each wrapping the next,
      // with the deepest level fanning out into 3 named siblings.
      const innermost: TanaIntermediateNode[] = [
        node({ uid: 'leaf-c', name: 'Leaf C', type: 'node' }),
        node({ uid: 'leaf-b', name: 'Leaf B', type: 'node' }),
        node({ uid: 'leaf-a', name: 'Leaf A', type: 'node' }),
      ] // deliberately out of alphabetical order — the fixture order is what must be preserved

      let current: TanaIntermediateNode = node({
        uid: `level-${DEPTH - 1}`,
        name: `Level ${DEPTH - 1}`,
        type: 'node',
        children: innermost,
      })

      for (let level = DEPTH - 2; level >= 0; level--) {
        current = node({
          uid: `level-${level}`,
          name: `Level ${level}`,
          type: 'node',
          children: [current],
        })
      }

      const fixture: TanaIntermediateFile = {
        version: 'TanaIntermediateFile V0.1',
        summary: { leafNodes: 3, topLevelNodes: 1, totalNodes: DEPTH + 3, calendarNodes: 0, fields: 0, brokenRefs: 0 },
        nodes: [current],
      }

      const summary = await importTanaIntermediateFile(backend, fixture)
      expect(summary.brokenRefs).toBe(0)
      expect(summary.nodesImported).toBe(DEPTH + 3)

      // Walk down the single-child chain, confirming each level has exactly
      // one child (order 0) and the right content, all the way to depth 10.
      let ownerId = summary.topLevelNodeIds[0]
      for (let level = 0; level < DEPTH; level++) {
        const kids = await childrenOf(ownerId)
        expect(kids, `level ${level} should have exactly its expected child count`).toHaveLength(
          level === DEPTH - 1 ? 3 : 1,
        )
        if (level < DEPTH - 1) {
          expect(kids[0].content).toBe(`Level ${level + 1}`)
          expect(getProperty(kids[0], FIELD_NAMES.ORDER)).toBe(0)
          ownerId = kids[0].id
        } else {
          // Deepest level: 3 siblings, order keys monotonic 0,1,2 matching
          // the ORIGINAL fixture order (C, B, A), not alphabetical or id order.
          const byOrder = [...kids].sort(
            (a, b) => (getProperty<number>(a, FIELD_NAMES.ORDER) ?? -1) - (getProperty<number>(b, FIELD_NAMES.ORDER) ?? -1),
          )
          expect(byOrder.map((n) => getProperty<number>(n, FIELD_NAMES.ORDER))).toEqual([0, 1, 2])
          expect(byOrder.map((n) => n.content)).toEqual(['Leaf C', 'Leaf B', 'Leaf A'])
        }
      }
    })
  })
})
