import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

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

    type OutlineNode = {
      id: string
      content: string
      parentId: string | null
      children: string[]
      order: string
      collapsed: boolean
      supertags: { id: string; name: string; color: string | null }[]
    }

    const nodeMap = new Map<string, OutlineNode>()

    function loadNode(nodeId: string, currentDepth: number): void {
      if (nodeMap.has(nodeId)) return

      const assembled = assembleNode(db, nodeId)
      if (!assembled || assembled.deletedAt) return

      const orderValue = getProperty<number>(assembled, FIELD_NAMES.ORDER)
      const colorValue = assembled.supertags.length > 0
        ? getProperty<string>(assembled, FIELD_NAMES.COLOR) ?? null
        : null

      const outlineNode: OutlineNode = {
        id: assembled.id,
        content: assembled.content ?? '',
        parentId: assembled.ownerId,
        children: [],
        order: String(orderValue ?? 0).padStart(8, '0'),
        collapsed: false,
        supertags: assembled.supertags.map((st) => ({
          id: st.id,
          name: st.content,
          color: null,
        })),
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

        // Sort by order
        childIds.sort((a, b) => {
          const na = nodeMap.get(a)
          const nb = nodeMap.get(b)
          return (na?.order ?? '').localeCompare(nb?.order ?? '')
        })

        outlineNode.children = childIds
      }
    }

    loadNode(ctx.data.nodeId, 0)

    // Serialize Map to array for JSON transport
    const nodesArray = Array.from(nodeMap.entries()).map(([id, node]) => ({
      id,
      ...node,
    }))

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

    // Find nodes with no owner (top-level workspace nodes)
    const rootNodes = db
      .select()
      .from(nodes)
      .where(and(isNull(nodes.ownerId), isNull(nodes.deletedAt)))
      .all()

    // If no roots exist, find any node to start from
    if (rootNodes.length === 0) {
      const anyNode = db.select().from(nodes).where(isNull(nodes.deletedAt)).limit(1).get()
      return {
        success: true as const,
        rootIds: anyNode ? [anyNode.id] : [],
      }
    }

    return {
      success: true as const,
      rootIds: rootNodes.map((n) => n.id),
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
      parentId: z.string(),
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
      ownerId: ctx.data.parentId,
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
      newParentId: z.string(),
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

    // Update ownerId directly
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
