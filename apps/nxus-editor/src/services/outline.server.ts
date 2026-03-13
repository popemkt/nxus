import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { QueryDefinitionSchema } from '@nxus/db'
import { getSupertagColor } from '@/lib/supertag-colors'
import { HIDDEN_FIELD_SYSTEM_IDS } from '@/types/outline'
import type { FieldType } from '@/types/outline'
import { initDatabaseSeeded } from './ensure-seeded.server'

/**
 * Get a node and its children (one level deep), assembled with properties/supertags.
 * Used to populate the outline view for a given root.
 */
export const getNodeTreeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string(), depth: z.number().optional() }))
  .handler(async (ctx) => {
    const {
      assembleNode,
      nodes,
      eq,
      isNull,
      and,
      getProperty,
      FIELD_NAMES,
      getSupertagFieldDefinitions,
      getAncestorSupertags,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const maxDepth = ctx.data.depth ?? Number.MAX_SAFE_INTEGER

    type OutlineNodeResult = {
      id: string
      content: string
      parentId: string | null
      children: string[]
      order: string
      createdAt: number
      collapsed: boolean
      supertags: { id: string; name: string; color: string | null; systemId: string | null }[]
      fields: { fieldId: string; fieldName: string; fieldNodeId: string; fieldSystemId: string | null; fieldType: FieldType; values: { value: unknown; order: number }[] }[]
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
      supertags: { id: string }[]
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

      // Build definition-order priority map from supertag field definitions
      const priorityMap = new Map<string, number>()
      let priority = 0
      for (const st of assembled.supertags) {
        const defs = getSupertagFieldDefinitions(db, st.id)
        const ancestors = getAncestorSupertags(db, st.id)
        // Own fields first
        for (const [systemId] of defs) {
          if (!priorityMap.has(systemId)) priorityMap.set(systemId, priority++)
        }
        // Then inherited
        for (const ancestorId of ancestors) {
          const ancestorDefs = getSupertagFieldDefinitions(db, ancestorId)
          for (const [systemId] of ancestorDefs) {
            if (!priorityMap.has(systemId)) priorityMap.set(systemId, priority++)
          }
        }
      }

      // Sort: fields with definition priority first (in order), remaining alphabetically
      fields.sort((a, b) => {
        const aPriority = a.fieldSystemId ? priorityMap.get(a.fieldSystemId) : undefined
        const bPriority = b.fieldSystemId ? priorityMap.get(b.fieldSystemId) : undefined
        if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority
        if (aPriority !== undefined) return -1
        if (bPriority !== undefined) return 1
        return a.fieldName.localeCompare(b.fieldName)
      })
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
        createdAt: assembled.createdAt?.getTime() ?? 0,
        collapsed: false,
        supertags: assembled.supertags.map((st: { id: string; content: string; systemId: string | null }) => {
          const stNode = assembleNode(db, st.id)
          const dbColor = stNode
            ? (getProperty(stNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
            : null
          return { id: st.id, name: st.content, color: dbColor ?? getSupertagColor(st.id), systemId: st.systemId }
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
          const orderCmp = (na?.order ?? '').localeCompare(nb?.order ?? '')
          if (orderCmp !== 0) return orderCmp
          return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0)
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
      nodes,
      isNull,
      and,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

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
      createNode,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

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
    const { updateNodeContent } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    updateNodeContent(db, ctx.data.nodeId, ctx.data.content)
    return { success: true as const }
  })

/**
 * Soft delete a node.
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { deleteNode } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
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
      nodes,
      eq,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

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
    const { setProperty, SYSTEM_FIELDS } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    setProperty(db, ctx.data.nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
    return { success: true as const }
  })

/**
 * Evaluate a query definition and return matching nodes.
 * Used by query supertag nodes to render live results in the outline.
 */
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ definition: QueryDefinitionSchema }))
  .handler(async (ctx) => {
    // Ensure seeded first, then use nodeFacade for query evaluation
    await initDatabaseSeeded()
    const { nodeFacade } = await import('@nxus/db/server')
    await nodeFacade.init()

    const result = await nodeFacade.evaluateQuery(ctx.data.definition)

    return {
      success: true as const,
      nodes: result.nodes.map((n) => ({
        id: n.id,
        content: n.content ?? '',
        supertags: n.supertags,
      })),
      totalCount: result.totalCount,
    }
  })

/**
 * Get backlinks grouped by field name — "Appears as [fieldName] in..."
 * Uses the facade's evaluateQuery with linksTo for architecture portability,
 * then post-processes assembled nodes' properties to extract field grouping.
 */
export const getBacklinksServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { nodeFacade } = await import('@nxus/db/server')
    await initDatabaseSeeded()
    await nodeFacade.init()

    const targetNodeId = ctx.data.nodeId

    // Use facade evaluateQuery with linksTo filter (architecture-portable)
    const result = await nodeFacade.evaluateQuery({
      filters: [{ type: 'relation', relationType: 'linksTo', targetNodeId }],
      limit: 50,
    })

    // Skip system field names used for internal wiring
    const systemFieldNames = new Set(['supertag', 'extends', 'order', 'field_type', 'query_definition', 'color'])

    // Post-process: group nodes by which field references the target
    const fieldGroups = new Map<string, { fieldName: string; nodeIds: Set<string> }>()

    for (const assembled of result.nodes) {
      // Scan properties to find which fields reference the target
      for (const [, propValues] of Object.entries(assembled.properties)) {
        if (!propValues || propValues.length === 0) continue
        const first = propValues[0]!
        if (systemFieldNames.has(first.fieldName)) continue

        const referencesTarget = propValues.some((pv) => {
          if (pv.value === targetNodeId) return true
          if (Array.isArray(pv.value) && pv.value.includes(targetNodeId)) return true
          return false
        })

        if (referencesTarget) {
          const fieldName = first.fieldName
          if (!fieldGroups.has(fieldName)) {
            fieldGroups.set(fieldName, { fieldName, nodeIds: new Set() })
          }
          fieldGroups.get(fieldName)!.nodeIds.add(assembled.id)
        }
      }
    }

    // Count children for each linking node (for bullet rendering)
    const { nodes: nodesTable, isNull, eq, and } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    const childCountMap = new Map<string, number>()
    for (const assembled of result.nodes) {
      const childRows = db
        .select()
        .from(nodesTable)
        .where(and(eq(nodesTable.ownerId, assembled.id), isNull(nodesTable.deletedAt)))
        .all()
      childCountMap.set(assembled.id, childRows.length)
    }

    // Build grouped result with node data
    const nodeDataMap = new Map(
      result.nodes.map((n) => [
        n.id,
        {
          id: n.id,
          content: n.content ?? '',
          childCount: childCountMap.get(n.id) ?? 0,
          supertags: n.supertags.map((st: { id: string; content: string; systemId: string | null }) => ({
            id: st.id,
            content: st.content,
            systemId: st.systemId,
          })),
        },
      ]),
    )

    const groups = Array.from(fieldGroups.values())
      .map((group) => ({
        fieldName: group.fieldName,
        nodes: Array.from(group.nodeIds)
          .map((id) => nodeDataMap.get(id))
          .filter((n): n is NonNullable<typeof n> => n !== null),
      }))
      .filter((g) => g.nodes.length > 0)

    const totalCount = groups.reduce((sum, g) => sum + g.nodes.length, 0)

    return { success: true as const, groups, totalCount }
  })

/**
 * Update a query node's definition.
 * Serializes the QueryDefinition to JSON and stores it on field:query_definition.
 */
export const updateQueryDefinitionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      definition: QueryDefinitionSchema,
    }),
  )
  .handler(async (ctx) => {
    const { setProperty, SYSTEM_FIELDS } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    setProperty(
      db,
      ctx.data.nodeId,
      SYSTEM_FIELDS.QUERY_DEFINITION,
      JSON.stringify(ctx.data.definition),
    )
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
    const { setProperty } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    setProperty(
      db,
      ctx.data.nodeId,
      ctx.data.fieldId as import('@nxus/db/server').FieldSystemId,
      ctx.data.value,
    )
    return { success: true as const }
  })
