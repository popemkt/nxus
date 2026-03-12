import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupertagColor } from '@/lib/supertag-colors'
import { extractOutlineSpecial } from '@/lib/outline-specials'
import { HIDDEN_FIELD_SYSTEM_IDS } from '@/types/outline'
import type { FieldType, OutlineSpecial } from '@/types/outline'

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

    const maxDepth = ctx.data.depth ?? Number.MAX_SAFE_INTEGER

    type OutlineNodeResult = {
      id: string
      content: string
      parentId: string | null
      children: string[]
      order: string
      collapsed: boolean
      supertags: { id: string; name: string; color: string | null; systemId: string | null }[]
      fields: { fieldId: string; fieldName: string; fieldNodeId: string; fieldSystemId: string | null; fieldType: FieldType; values: { value: unknown; order: number }[] }[]
      special: OutlineSpecial | null
    }

    const nodeMap = new Map<string, OutlineNodeResult>()
    // Cache field types to avoid redundant lookups
    const fieldTypeCache = new Map<string, FieldType>()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    /**
     * When field_type isn't explicitly set (defaults to 'text'), infer
     * from the actual values — UUIDs are almost certainly node references.
     */
    function inferFieldType(
      declared: FieldType,
      values: { value: unknown }[],
    ): FieldType {
      if (declared !== 'text' || values.length === 0) return declared
      const first = values[0]?.value
      if (Array.isArray(first)) {
        if (first.length > 0 && first.every((v) => typeof v === 'string' && UUID_RE.test(v))) {
          return 'nodes'
        }
      }
      if (typeof first === 'string' && UUID_RE.test(first)) {
        return values.length > 1 ? 'nodes' : 'node'
      }
      return declared
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

        const sortedValues = propValues
          .sort((a, b) => a.order - b.order)
          .map((pv) => ({ value: pv.value ?? null, order: pv.order }))

        const declaredType = resolveFieldType(first.fieldNodeId)
        const fieldType = inferFieldType(declaredType, sortedValues)

        fields.push({
          fieldId: first.fieldSystemId ?? first.fieldNodeId,
          fieldName: first.fieldName,
          fieldNodeId: first.fieldNodeId,
          fieldSystemId: first.fieldSystemId,
          fieldType,
          values: sortedValues,
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
        supertags: assembled.supertags.map((st: { id: string; content: string; systemId: string | null }) => {
          const stNode = assembleNode(db, st.id)
          const dbColor = stNode
            ? (getProperty(stNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
            : null
          return { id: st.id, name: st.content, color: dbColor ?? getSupertagColor(st.id), systemId: st.systemId }
        }),
        fields: extractFields(assembled),
        special: extractOutlineSpecial({
          supertags: assembled.supertags,
          queryDefinition: getProperty(assembled, FIELD_NAMES.QUERY_DEFINITION),
        }),
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

export const executeQueryNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const {
      nodeFacade,
      getProperty,
      FIELD_NAMES,
      SYSTEM_SUPERTAGS,
      QueryDefinitionSchema,
    } = await import('@nxus/db/server')

    await nodeFacade.init()

    const queryNode = await nodeFacade.findNodeById(ctx.data.nodeId)
    if (!queryNode) {
      return { success: false as const, error: 'Query node not found' }
    }

    const isQueryNode = queryNode.supertags.some(
      (tag: { systemId: string | null }) => tag.systemId === SYSTEM_SUPERTAGS.QUERY,
    )
    if (!isQueryNode) {
      return { success: false as const, error: 'Node is not a query' }
    }

    const parsedDefinition = QueryDefinitionSchema.safeParse(
      getProperty(queryNode, FIELD_NAMES.QUERY_DEFINITION),
    )
    if (!parsedDefinition.success) {
      return { success: false as const, error: 'Invalid query definition' }
    }

    const result = await nodeFacade.evaluateQuery(parsedDefinition.data)

    return {
      success: true as const,
      definition: parsedDefinition.data,
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt.toISOString(),
      nodes: result.nodes.map((node: {
        id: string
        content: string | null
        systemId: string | null
        supertags: Array<{ id: string; content: string; systemId: string | null }>
      }) => ({
        id: node.id,
        content: node.content,
        systemId: node.systemId,
        supertags: node.supertags.map((tag: {
          id: string
          content: string
          systemId: string | null
        }) => ({
          id: tag.id,
          name: tag.content,
          color: getSupertagColor(tag.id),
          systemId: tag.systemId,
        })),
      })),
    }
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
      fieldId: z.string(),
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
      ctx.data.fieldId as import('@nxus/db/server').FieldSystemId,
      ctx.data.value,
    )
    return { success: true as const }
  })
