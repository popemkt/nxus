/**
 * backend-equivalence.test.ts - Parametric tests verifying both backends
 * produce equivalent AssembledNode output.
 *
 * Uses describe.each to run the same test suite against both SqliteBackend
 * and SurrealBackend. Tests compare content, properties, and supertags
 * (not IDs, since formats differ: UUID vs RecordId string).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  FIELD_NAMES,
} from '../../schemas/node-schema.js'
import type { FieldSystemId, FieldContentName } from '../../schemas/node-schema.js'
import type { NodeBackend } from './types.js'
import {
  createTestSqliteBackend,
  createTestSurrealBackend,
} from './backend-test-factories.js'

// ---------------------------------------------------------------------------
// Parametric test suite
// ---------------------------------------------------------------------------

describe.each(['sqlite', 'surreal'] as const)(
  'Backend equivalence (%s)',
  (backendType) => {
    let backend: NodeBackend
    let cleanup: () => Promise<void>

    beforeEach(async () => {
      const ctx = backendType === 'sqlite'
        ? await createTestSqliteBackend()
        : await createTestSurrealBackend()
      backend = ctx.backend
      cleanup = ctx.cleanup
    })

    afterEach(async () => {
      await cleanup()
    })

    // -----------------------------------------------------------------------
    // createNode → assembleNode round-trip
    // -----------------------------------------------------------------------

    describe('createNode → assembleNode', () => {
      it('should create and assemble a node with correct content', async () => {
        const nodeId = await backend.createNode({ content: 'Equivalence Test' })
        expect(nodeId).toBeTruthy()

        const node = await backend.assembleNode(nodeId)
        expect(node).not.toBeNull()
        expect(node!.content).toBe('Equivalence Test')
        expect(node!.id).toBe(nodeId)
        expect(node!.properties).toBeDefined()
        expect(node!.supertags).toEqual([])
        expect(node!.createdAt).toBeInstanceOf(Date)
        expect(node!.updatedAt).toBeInstanceOf(Date)
        expect(node!.deletedAt).toBeNull()
      })

      it('should create a node with systemId', async () => {
        const nodeId = await backend.createNode({
          content: 'System Node',
          systemId: 'test:equiv-node',
        })

        const node = await backend.findNodeBySystemId('test:equiv-node')
        expect(node).not.toBeNull()
        expect(node!.id).toBe(nodeId)
        expect(node!.systemId).toBe('test:equiv-node')
        expect(node!.content).toBe('System Node')
      })
    })

    // -----------------------------------------------------------------------
    // setProperty → assembleNode → getProperty round-trip
    // -----------------------------------------------------------------------

    describe('setProperty → assembleNode round-trip', () => {
      it('should set a property and see it in assembled node', async () => {
        const nodeId = await backend.createNode({ content: 'Prop Node' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test/path')

        const node = await backend.assembleNode(nodeId)
        expect(node).not.toBeNull()
        expect(node!.properties[FIELD_NAMES.PATH]).toBeDefined()
        expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
        expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/test/path')
        expect(node!.properties[FIELD_NAMES.PATH][0].fieldName).toBe('path')
      })

      it('should replace property on re-set', async () => {
        const nodeId = await backend.createNode({ content: 'Node' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/first')
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/second')

        const node = await backend.assembleNode(nodeId)
        expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
        expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/second')
      })

      it('should set multiple different properties', async () => {
        const nodeId = await backend.createNode({ content: 'Multi-prop' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')
        await backend.setProperty(nodeId, SYSTEM_FIELDS.DESCRIPTION, 'A desc')
        await backend.setProperty(nodeId, SYSTEM_FIELDS.STATUS, 'active')

        const node = await backend.assembleNode(nodeId)
        expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/test')
        expect(node!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe('A desc')
        expect(node!.properties[FIELD_NAMES.STATUS][0].value).toBe('active')
      })
    })

    // -----------------------------------------------------------------------
    // addPropertyValue × N → verify ordering preserved
    // -----------------------------------------------------------------------

    describe('addPropertyValue ordering', () => {
      it('should preserve order across multiple addPropertyValue calls', async () => {
        const nodeId = await backend.createNode({ content: 'Multi' })
        await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val1')
        await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val2')
        await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val3')

        const node = await backend.assembleNode(nodeId)
        const pathProps = node!.properties[FIELD_NAMES.PATH]
        expect(pathProps).toHaveLength(3)

        const sorted = [...pathProps].sort((a, b) => a.order - b.order)
        expect(sorted[0].value).toBe('val1')
        expect(sorted[1].value).toBe('val2')
        expect(sorted[2].value).toBe('val3')
      })
    })

    // -----------------------------------------------------------------------
    // clearProperty → verify property removed
    // -----------------------------------------------------------------------

    describe('clearProperty', () => {
      it('should remove all values for a field', async () => {
        const nodeId = await backend.createNode({ content: 'Node' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')

        const before = await backend.assembleNode(nodeId)
        expect(before!.properties[FIELD_NAMES.PATH]).toBeDefined()

        await backend.clearProperty(nodeId, SYSTEM_FIELDS.PATH)

        const after = await backend.assembleNode(nodeId)
        expect(after!.properties[FIELD_NAMES.PATH]).toBeUndefined()
      })
    })

    // -----------------------------------------------------------------------
    // addNodeSupertag → verify supertag in assembled node
    // -----------------------------------------------------------------------

    describe('addNodeSupertag', () => {
      it('should add supertag visible in assembled node', async () => {
        const nodeId = await backend.createNode({ content: 'Plain' })
        const added = await backend.addNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
        expect(added).toBe(true)

        const node = await backend.assembleNode(nodeId)
        expect(node!.supertags).toHaveLength(1)
        expect(node!.supertags[0].systemId).toBe(SYSTEM_SUPERTAGS.ITEM)
      })

      it('should return false when adding duplicate supertag', async () => {
        const nodeId = await backend.createNode({
          content: 'Item',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })

        const added = await backend.addNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
        expect(added).toBe(false)
      })
    })

    // -----------------------------------------------------------------------
    // removeNodeSupertag → verify supertag removed
    // -----------------------------------------------------------------------

    describe('removeNodeSupertag', () => {
      it('should remove supertag from node', async () => {
        const nodeId = await backend.createNode({
          content: 'Item',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })

        const removed = await backend.removeNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
        expect(removed).toBe(true)

        const node = await backend.assembleNode(nodeId)
        expect(node!.supertags).toHaveLength(0)
      })

      it('should return false when removing non-existent supertag', async () => {
        const nodeId = await backend.createNode({ content: 'Node' })
        const removed = await backend.removeNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
        expect(removed).toBe(false)
      })
    })

    // -----------------------------------------------------------------------
    // deleteNode → findNodeById returns null or soft-deleted
    // -----------------------------------------------------------------------

    describe('deleteNode', () => {
      it('should soft-delete a node', async () => {
        const nodeId = await backend.createNode({ content: 'To Delete' })
        await backend.deleteNode(nodeId)

        // findNodeById returns the record (with deletedAt set)
        const node = await backend.findNodeById(nodeId)
        expect(node).not.toBeNull()
        expect(node!.deletedAt).not.toBeNull()
      })
    })

    // -----------------------------------------------------------------------
    // getNodesBySupertags returns correct nodes
    // -----------------------------------------------------------------------

    describe('getNodesBySupertags', () => {
      it('should return nodes matching supertag', async () => {
        await backend.createNode({
          content: 'Item 1',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Item 2',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Command 1',
          supertagId: SYSTEM_SUPERTAGS.COMMAND,
        })

        const items = await backend.getNodesBySupertags([SYSTEM_SUPERTAGS.ITEM])
        expect(items).toHaveLength(2)
        expect(items.map((n) => n.content).sort()).toEqual(['Item 1', 'Item 2'])
      })

      it('should return empty for non-existent supertag', async () => {
        const items = await backend.getNodesBySupertags(['supertag:nonexistent'])
        expect(items).toHaveLength(0)
      })
    })

    // -----------------------------------------------------------------------
    // updateNodeContent → content updated in assembled node
    // -----------------------------------------------------------------------

    describe('updateNodeContent', () => {
      it('should update content visible in assembled node', async () => {
        const nodeId = await backend.createNode({ content: 'Original' })
        await backend.updateNodeContent(nodeId, 'Updated')

        const node = await backend.assembleNode(nodeId)
        expect(node!.content).toBe('Updated')
      })

      it('should reconcile inline mentions on create and update', async () => {
        const targetId = await backend.createNode({ content: 'Mention target' })
        const sourceId = await backend.createNode({
          content: `Mentions [[node:${targetId}]] inline`,
        })

        const created = await backend.assembleNode(sourceId)
        expect(created!.properties[FIELD_NAMES.MENTIONS]).toBeDefined()
        expect(created!.properties[FIELD_NAMES.MENTIONS].map((prop) => prop.value)).toEqual([
          targetId,
        ])

        await backend.updateNodeContent(sourceId, 'Mention removed')

        const updated = await backend.assembleNode(sourceId)
        expect(updated!.properties[FIELD_NAMES.MENTIONS]).toBeUndefined()
      })
    })

    // -----------------------------------------------------------------------
    // evaluateQuery with supertag filter → same nodes returned
    // -----------------------------------------------------------------------

    describe('evaluateQuery', () => {
      it('should find nodes by supertag filter', async () => {
        await backend.createNode({
          content: 'Item A',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Item B',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Command',
          supertagId: SYSTEM_SUPERTAGS.COMMAND,
        })

        const result = await backend.evaluateQuery({
          filters: [
            {
              type: 'supertag',
              supertagId: SYSTEM_SUPERTAGS.ITEM,
              includeInherited: false,
            },
          ],
          limit: 500,
        })

        expect(result.nodes).toHaveLength(2)
        expect(result.totalCount).toBe(2)
        expect(result.evaluatedAt).toBeInstanceOf(Date)
        expect(result.nodes.map((n) => n.content).sort()).toEqual(['Item A', 'Item B'])
      })

      it('should find nodes by content filter', async () => {
        await backend.createNode({ content: 'Hello World' })
        await backend.createNode({ content: 'Goodbye World' })
        await backend.createNode({ content: 'Hello Mars' })

        const result = await backend.evaluateQuery({
          filters: [
            { type: 'content', query: 'hello', caseSensitive: false },
          ],
          limit: 500,
        })

        // Both backends may also include system nodes whose content matches.
        // At minimum, our two "Hello" nodes should be present.
        const contents = result.nodes.map((n) => n.content)
        expect(contents).toContain('Hello World')
        expect(contents).toContain('Hello Mars')
        expect(contents).not.toContain('Goodbye World')
      })

      it('should find nodes by property filter', async () => {
        const id1 = await backend.createNode({ content: 'Active' })
        await backend.setProperty(id1, SYSTEM_FIELDS.STATUS, 'active')

        const id2 = await backend.createNode({ content: 'Inactive' })
        await backend.setProperty(id2, SYSTEM_FIELDS.STATUS, 'inactive')

        await backend.createNode({ content: 'No Status' })

        const result = await backend.evaluateQuery({
          filters: [
            { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, op: 'eq', value: 'active' },
          ],
          limit: 500,
        })

        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].content).toBe('Active')
      })

      it('should exclude soft-deleted nodes', async () => {
        const id = await backend.createNode({
          content: 'To Delete',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.deleteNode(id)

        const result = await backend.evaluateQuery({
          filters: [
            {
              type: 'supertag',
              supertagId: SYSTEM_SUPERTAGS.ITEM,
              includeInherited: false,
            },
          ],
          limit: 500,
        })

        expect(result.nodes).toHaveLength(0)
      })
    })

    // -----------------------------------------------------------------------
    // linkNodes
    // -----------------------------------------------------------------------

    describe('linkNodes', () => {
      it('should link two nodes via a field', async () => {
        const parentId = await backend.createNode({ content: 'Parent' })
        const childId = await backend.createNode({ content: 'Child' })

        await backend.linkNodes(childId, SYSTEM_FIELDS.PARENT, parentId)

        const child = await backend.assembleNode(childId)
        expect(child!.properties[FIELD_NAMES.PARENT]).toBeDefined()
        expect(child!.properties[FIELD_NAMES.PARENT][0].value).toBe(parentId)
      })

      it('FORMULA-B1: computes a formula field from sibling number fields in assembly', async () => {
        // A supertag with Price(number), Quantity(number), Total(formula).
        const suffix = backendType
        const tagSystemId = `supertag:formula_product_${suffix}`
        const priceSystemId = `field:formula_price_${suffix}` as FieldSystemId
        const qtySystemId = `field:formula_qty_${suffix}` as FieldSystemId
        const totalSystemId = `field:formula_total_${suffix}` as FieldSystemId

        const tag = await backend.createNode({ content: `#FormulaProduct${suffix}`, systemId: tagSystemId })
        await backend.addNodeSupertag(tag, SYSTEM_SUPERTAGS.SUPERTAG)

        const priceField = await backend.createNode({ content: 'Price', systemId: priceSystemId })
        await backend.addNodeSupertag(priceField, SYSTEM_SUPERTAGS.FIELD)
        await backend.setProperty(priceField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

        const qtyField = await backend.createNode({ content: 'Quantity', systemId: qtySystemId })
        await backend.addNodeSupertag(qtyField, SYSTEM_SUPERTAGS.FIELD)
        await backend.setProperty(qtyField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

        const totalField = await backend.createNode({ content: 'Total', systemId: totalSystemId })
        await backend.addNodeSupertag(totalField, SYSTEM_SUPERTAGS.FIELD)
        await backend.setProperty(totalField, SYSTEM_FIELDS.FIELD_TYPE, 'formula')
        await backend.setProperty(totalField, SYSTEM_FIELDS.FORMULA, '{Price} * {Quantity}')

        // Declare the fields on the supertag.
        await backend.setProperty(tag, priceSystemId, null)
        await backend.setProperty(tag, qtySystemId, null)
        await backend.setProperty(tag, totalSystemId, null)

        const nodeId = await backend.createNode({ content: 'Widget' })
        await backend.addNodeSupertag(nodeId, tagSystemId)
        await backend.setProperty(nodeId, priceSystemId, 10)
        await backend.setProperty(nodeId, qtySystemId, 3)

        const assembled = await backend.assembleNode(nodeId)
        expect(assembled!.properties['Total' as FieldContentName]?.[0]?.value).toBe(30)
      })
    })

    // -----------------------------------------------------------------------
    // S2 facade convergence methods
    // -----------------------------------------------------------------------

    describe('facade convergence S2 methods', () => {
      it('should expose workspace roots, restore, reparent, reorder, field reads, row removal, stats, and base-type reads', async () => {
        const rootId = await backend.createNode({ content: 'Workspace Root' })
        const childId = await backend.createNode({
          content: 'Child',
          ownerId: rootId,
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        const siblingId = await backend.createNode({
          content: 'Sibling',
          ownerId: rootId,
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })

        const roots = await backend.getWorkspaceRoots()
        expect(roots).toContain(rootId)
        expect(roots).not.toContain(childId)

        await backend.deleteNode(childId)
        const deletedChild = await backend.findNodeById(childId)
        expect(deletedChild!.deletedAt).not.toBeNull()
        await backend.restoreNode(childId)
        expect((await backend.assembleNode(childId))!.content).toBe('Child')

        await backend.reparentNode(childId, null, 10)
        const reparented = await backend.assembleNode(childId)
        expect(reparented!.ownerId).toBeNull()
        expect(reparented!.properties[FIELD_NAMES.ORDER][0].value).toBe(10)

        await backend.reorderNodes([
          { nodeId: childId, order: 20 },
          { nodeId: siblingId, order: 30 },
        ])
        expect((await backend.assembleNode(childId))!.properties[FIELD_NAMES.ORDER][0].value).toBe(20)
        expect((await backend.assembleNode(siblingId))!.properties[FIELD_NAMES.ORDER][0].value).toBe(30)

        await backend.setProperty(childId, SYSTEM_FIELDS.STATUS, 'todo')
        await backend.setProperty(siblingId, SYSTEM_FIELDS.STATUS, 'todo')
        const statusFieldNodeId = (await backend.assembleNode(childId))!
          .properties[FIELD_NAMES.STATUS][0].fieldNodeId

        const distinctValues = await backend.getDistinctPropertyValues(statusFieldNodeId)
        expect(distinctValues).toEqual(['todo'])

        const beforeStats = await backend.getFieldUsageStats(statusFieldNodeId)
        expect(beforeStats.nodeCount).toBe(2)
        expect(beforeStats.supertagCount).toBe(0)

        await backend.removePropertyRow(childId, statusFieldNodeId)
        expect((await backend.assembleNode(childId))!.properties[FIELD_NAMES.STATUS]).toBeUndefined()
        const afterStats = await backend.getFieldUsageStats(statusFieldNodeId)
        expect(afterStats.nodeCount).toBe(1)

        let itemDefinition = await backend.findNodeBySystemId(SYSTEM_SUPERTAGS.ITEM)
        if (!itemDefinition) {
          const itemDefinitionId = await backend.createNode({
            content: '#Item',
            systemId: SYSTEM_SUPERTAGS.ITEM,
          })
          itemDefinition = await backend.assembleNode(itemDefinitionId)
        }
        expect(itemDefinition).not.toBeNull()
        await backend.setProperty(itemDefinition!.id, SYSTEM_FIELDS.BASE_TYPE, 'task')

        const baseTypeNodes = await backend.getNodesBySupertagBaseType('task')
        const baseTypeNodeContents = baseTypeNodes.map((node) => node.content).sort()
        expect(baseTypeNodeContents).toEqual(['Child', 'Sibling'])

        await backend.deleteNode(siblingId)
        const liveBaseTypeNodes = await backend.getNodesBySupertagBaseType('task')
        expect(liveBaseTypeNodes.map((node) => node.content)).toEqual(['Child'])
      })
    })

    // -----------------------------------------------------------------------
    // Facade tree-read batch methods
    // -----------------------------------------------------------------------

    describe('facade tree-read batch methods', () => {
      it('should batch children by parents in outline order and exclude deleted children', async () => {
        const parentA = await backend.createNode({ content: 'Parent A' })
        const parentB = await backend.createNode({ content: 'Parent B' })
        const lateChild = await backend.createNode({
          content: 'A child order 20',
          ownerId: parentA,
        })
        const earlyChild = await backend.createNode({
          content: 'A child order 10',
          ownerId: parentA,
        })
        const deletedChild = await backend.createNode({
          content: 'A deleted child',
          ownerId: parentA,
        })
        const onlyChild = await backend.createNode({
          content: 'B child',
          ownerId: parentB,
        })

        await backend.setProperty(lateChild, SYSTEM_FIELDS.ORDER, 20)
        await backend.setProperty(earlyChild, SYSTEM_FIELDS.ORDER, 10)
        await backend.setProperty(deletedChild, SYSTEM_FIELDS.ORDER, 0)
        await backend.setProperty(onlyChild, SYSTEM_FIELDS.ORDER, 0)
        await backend.deleteNode(deletedChild)

        const childrenByParent = await backend.getChildrenByParents([parentA, parentB])
        expect(childrenByParent.get(parentA)?.map((node) => node.id)).toEqual([
          earlyChild,
          lateChild,
        ])
        expect(childrenByParent.get(parentB)?.map((node) => node.id)).toEqual([
          onlyChild,
        ])

        const childPresence = await backend.hasChildren([
          parentA,
          parentB,
          lateChild,
          deletedChild,
        ])
        expect(childPresence.get(parentA)).toBe(true)
        expect(childPresence.get(parentB)).toBe(true)
        expect(childPresence.get(lateChild)).toBe(false)
        expect(childPresence.get(deletedChild)).toBe(false)
      })
    })

    // -----------------------------------------------------------------------
    // save (no-op)
    // -----------------------------------------------------------------------

    describe('save', () => {
      it('should not throw', async () => {
        await expect(backend.save()).resolves.toBeUndefined()
      })
    })
  },
)
