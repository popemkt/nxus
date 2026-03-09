import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupertagColor } from '@/lib/supertag-colors'
import { HIDDEN_FIELD_SYSTEM_IDS } from '@/types/outline'
import type { FieldType } from '@/types/outline'

/**
 * Get a node and its children (one level deep), assembled with properties/supertags.
 * Used to populate the outline view for a given root.
 */
export const getNodeTreeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string(), depth: z.number().optional() }))
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      assembleNode,
      nodes,
      eq,
      isNull,
      and,
      getProperty,
      FIELD_NAMES,
    } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()

    const maxDepth = ctx.data.depth ?? 10

    type OutlineNodeResult = {
      id: string
      content: string
      parentId: string | null
      children: string[]
      order: string
      collapsed: boolean
      supertags: { id: string; name: string; color: string | null }[]
      fields: { fieldName: string; fieldSystemId: string | null; fieldType: FieldType; values: { value: unknown; order: number }[] }[]
    }

    const nodeMap = new Map<string, OutlineNodeResult>()
    // Cache field types to avoid redundant lookups
    const fieldTypeCache = new Map<string, FieldType>()

    function resolveFieldType(fieldNodeId: string): FieldType {
      const cached = fieldTypeCache.get(fieldNodeId)
      if (cached) return cached

      const fieldNode = assembleNode(db, fieldNodeId)
      const ft = fieldNode
        ? (getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text'
        : 'text'
      const result = ft as FieldType
      fieldTypeCache.set(fieldNodeId, result)
      return result
    }

    function extractFields(assembled: {
      properties: Record<string, { value: unknown; rawValue: string; fieldNodeId: string; fieldName: string; fieldSystemId: string | null; order: number }[]>
    }): OutlineNodeResult['fields'] {
      const fields: OutlineNodeResult['fields'] = []

      for (const [, propValues] of Object.entries(assembled.properties)) {
        if (!propValues || propValues.length === 0) continue

        const first = propValues[0]!
        // Skip hidden system fields
        if (first.fieldSystemId && HIDDEN_FIELD_SYSTEM_IDS.has(first.fieldSystemId)) continue

        const fieldType = resolveFieldType(first.fieldNodeId)

        fields.push({
          fieldName: first.fieldName,
          fieldSystemId: first.fieldSystemId,
          fieldType,
          values: propValues
            .sort((a, b) => a.order - b.order)
            .map((pv) => ({ value: pv.value ?? null, order: pv.order })),
        })
      }

      // Sort fields alphabetically by name for consistent display
      fields.sort((a, b) => a.fieldName.localeCompare(b.fieldName))
      return fields
    }

    function loadNode(nodeId: string, currentDepth: number): void {
      if (nodeMap.has(nodeId)) return

      const assembled = assembleNode(db, nodeId)
      if (!assembled || assembled.deletedAt) return

      const orderValue = getProperty(assembled, FIELD_NAMES.ORDER) as number | undefined

      const outlineNode: OutlineNodeResult = {
        id: assembled.id,
        content: assembled.content ?? '',
        parentId: assembled.ownerId,
        children: [],
        order: String(orderValue ?? 0).padStart(8, '0'),
        collapsed: false,
        supertags: assembled.supertags.map((st: { id: string; content: string }) => {
          const stNode = assembleNode(db, st.id)
          const dbColor = stNode
            ? (getProperty(stNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
            : null
          return { id: st.id, name: st.content, color: dbColor ?? getSupertagColor(st.id) }
        }),
        fields: extractFields(assembled),
      }

      nodeMap.set(nodeId, outlineNode)

      if (currentDepth < maxDepth) {
        const childRows = db
          .select()
          .from(nodes)
          .where(and(eq(nodes.ownerId, nodeId), isNull(nodes.deletedAt)))
          .all()

        const childIds: string[] = []
        for (const child of childRows) {
          childIds.push(child.id)
          loadNode(child.id, currentDepth + 1)
        }

        childIds.sort((a, b) => {
          const na = nodeMap.get(a)
          const nb = nodeMap.get(b)
          return (na?.order ?? '').localeCompare(nb?.order ?? '')
        })

        outlineNode.children = childIds
      }
    }

    loadNode(ctx.data.nodeId, 0)

    const nodesArray = Array.from(nodeMap.values())
    return { success: true as const, nodes: nodesArray, rootId: ctx.data.nodeId }
  })

/**
 * Get workspace root nodes (nodes with no parent).
 * Falls back to creating a workspace root if none exists.
 */
export const getWorkspaceRootServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const {
      initDatabaseWithBootstrap,
      nodes,
      isNull,
      and,
    } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()

    const rootNodes = db
      .select()
      .from(nodes)
      .where(and(isNull(nodes.ownerId), isNull(nodes.deletedAt)))
      .all()

    if (rootNodes.length === 0) {
      const anyNode = db.select().from(nodes).where(isNull(nodes.deletedAt)).limit(1).get()
      return {
        success: true as const,
        rootIds: anyNode ? [anyNode.id] : [],
      }
    }

    return {
      success: true as const,
      rootIds: rootNodes.map((n: { id: string }) => n.id as string),
    }
  },
)

/**
 * Create a new node as a child of a parent.
 */
export const createNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      content: z.string(),
      parentId: z.string().nullable(),
      order: z.number().optional(),
    }),
  )
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      createNode,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()

    const nodeId = createNode(db, {
      content: ctx.data.content,
      ...(ctx.data.parentId ? { ownerId: ctx.data.parentId } : {}),
    })

    if (ctx.data.order !== undefined) {
      setProperty(db, nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
    }

    return { success: true as const, nodeId }
  })

/**
 * Update node content.
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), content: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, updateNodeContent } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    updateNodeContent(db, ctx.data.nodeId, ctx.data.content)
    return { success: true as const }
  })

/**
 * Soft delete a node.
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, deleteNode } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    deleteNode(db, ctx.data.nodeId)
    return { success: true as const }
  })

/**
 * Reparent a node — change its owner and optionally its order.
 */
export const reparentNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      newParentId: z.string().nullable(),
      order: z.number().optional(),
    }),
  )
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      nodes,
      eq,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()

    db.update(nodes)
      .set({
        ownerId: ctx.data.newParentId,
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, ctx.data.nodeId))
      .run()

    if (ctx.data.order !== undefined) {
      setProperty(db, ctx.data.nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
    }

    return { success: true as const }
  })

/**
 * Update the order property of a node.
 */
export const reorderNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), order: z.number() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, setProperty, SYSTEM_FIELDS } =
      await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    setProperty(db, ctx.data.nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
    return { success: true as const }
  })

/**
 * Set a field value on a node.
 */
export const setFieldValueServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      fieldSystemId: z.string(),
      value: z.unknown(),
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, setProperty } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    setProperty(
      db,
      ctx.data.nodeId,
      ctx.data.fieldSystemId as import('@nxus/db/server').FieldSystemId,
      ctx.data.value,
    )
    return { success: true as const }
  })
