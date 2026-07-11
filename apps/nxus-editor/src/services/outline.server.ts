import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { QueryDefinitionSchema, formatOrderKey } from '@nxus/db'
import { getSupertagColor } from '@/lib/supertag-colors'
import { HIDDEN_FIELD_SYSTEM_IDS } from '@/types/outline'
import type { FieldType, HideWhen } from '@/types/outline'
import type { AssembledNode } from '@nxus/db'
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
      assembleNodes,
      createAssemblyCache,
      nodes,
      inArray,
      isNull,
      and,
      sql,
      getProperty,
      FIELD_NAMES,
      getSupertagFieldDefinitions,
      getAncestorSupertags,
    } = await import('@nxus/db/server')
    const seededDb = await initDatabaseSeeded()
    if (!seededDb) {
      // Graph mode has no SQLite handle; this raw frontier read is node-mode
      // only until the facade composite tree read (S3) replaces it.
      throw new Error('getNodeTreeServerFn requires node mode (SQLite)')
    }
    const db = seededDb

    const maxDepth = ctx.data.depth ?? Number.MAX_SAFE_INTEGER

    const assemblyCache = createAssemblyCache()

    type OutlineNodeResult = {
      id: string
      content: string
      parentId: string | null
      children: string[]
      hasUnloadedChildren: boolean
      order: string
      createdAt: number
      collapsed: boolean
      supertags: { id: string; name: string; color: string | null; systemId: string | null }[]
      fields: { fieldId: string; fieldName: string; fieldNodeId: string; fieldSystemId: string | null; fieldType: FieldType; values: { value: unknown; order: number }[]; required?: boolean; hideWhen?: HideWhen; pinned?: boolean }[]
    }

    const nodeMap = new Map<string, OutlineNodeResult>()
    const childIdsByParent = new Map<string, string[]>()
    const supertagDisplayCache = new Map<string, { name: string; color: string | null; systemId: string | null }>()
    // Cache field types and constraints to avoid redundant lookups
    const fieldTypeCache = new Map<string, FieldType>()
    const fieldConstraintCache = new Map<string, { required?: boolean; hideWhen?: HideWhen; pinned?: boolean }>()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    function resolveFieldType(fieldNodeId: string): FieldType {
      const cached = fieldTypeCache.get(fieldNodeId)
      if (cached) return cached

      const fieldNode = assembleNode(db, fieldNodeId, assemblyCache)
      const ft = fieldNode
        ? (getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text'
        : 'text'
      const result = ft as FieldType
      fieldTypeCache.set(fieldNodeId, result)

      // Cache constraints, normalizing string 'true' → boolean true at the read boundary
      if (fieldNode && !fieldConstraintCache.has(fieldNodeId)) {
        const requiredRaw = getProperty(fieldNode, FIELD_NAMES.REQUIRED)
        const hideWhenRaw = getProperty(fieldNode, FIELD_NAMES.HIDE_WHEN)
        const pinnedRaw = getProperty(fieldNode, FIELD_NAMES.PINNED)
        fieldConstraintCache.set(fieldNodeId, {
          required: requiredRaw === true || requiredRaw === 'true' ? true : undefined,
          hideWhen: parseHideWhen(hideWhenRaw),
          pinned: pinnedRaw === true || pinnedRaw === 'true' ? true : undefined,
        })
      }

      return result
    }

    function parseHideWhen(value: unknown): HideWhen | undefined {
      if (
        value === 'never' ||
        value === 'when_empty' ||
        value === 'when_not_empty' ||
        value === 'always'
      ) {
        return value
      }
      return undefined
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

        const constraints = fieldConstraintCache.get(first.fieldNodeId)
        fields.push({
          fieldId: first.fieldSystemId ?? first.fieldNodeId,
          fieldName: first.fieldName,
          fieldNodeId: first.fieldNodeId,
          fieldSystemId: first.fieldSystemId,
          fieldType,
          values: sortedValues,
          ...(constraints?.required && { required: true }),
          ...(constraints?.hideWhen && { hideWhen: constraints.hideWhen }),
          ...(constraints?.pinned && { pinned: true }),
        })
      }

      // Build definition-order priority map from supertag field definitions
      const priorityMap = new Map<string, number>()
      let priority = 0
      for (const st of assembled.supertags) {
        const defs = getSupertagFieldDefinitions(db, st.id, assemblyCache)
        const ancestors = getAncestorSupertags(db, st.id, undefined, assemblyCache)
        // Own fields first
        for (const [systemId] of defs) {
          if (!priorityMap.has(systemId)) priorityMap.set(systemId, priority++)
        }
        // Then inherited
        for (const ancestorId of ancestors) {
          const ancestorDefs = getSupertagFieldDefinitions(db, ancestorId, assemblyCache)
          for (const [systemId] of ancestorDefs) {
            if (!priorityMap.has(systemId)) priorityMap.set(systemId, priority++)
          }
        }
      }

      // Include empty fields from supertag definitions that have no stored values yet.
      // Without this, fields from a supertag only appear after the user sets a value.
      const existingFieldSystemIds = new Set(fields.map((f) => f.fieldSystemId).filter(Boolean))
      for (const st of assembled.supertags) {
        const defs = getSupertagFieldDefinitions(db, st.id, assemblyCache)
        const ancestors = getAncestorSupertags(db, st.id, undefined, assemblyCache)
        const allDefs = new Map(defs)
        for (const ancestorId of ancestors) {
          const ancestorDefs = getSupertagFieldDefinitions(db, ancestorId, assemblyCache)
          for (const [key, val] of ancestorDefs) {
            if (!allDefs.has(key)) allDefs.set(key, val)
          }
        }
        for (const [systemId, def] of allDefs) {
          if (HIDDEN_FIELD_SYSTEM_IDS.has(systemId)) continue
          if (existingFieldSystemIds.has(systemId)) continue
          existingFieldSystemIds.add(systemId)

          const declaredType = resolveFieldType(def.fieldNodeId)
          const constraints = fieldConstraintCache.get(def.fieldNodeId)
          fields.push({
            fieldId: systemId,
            fieldName: def.fieldName,
            fieldNodeId: def.fieldNodeId,
            fieldSystemId: systemId,
            fieldType: declaredType,
            values: [],
            ...(constraints?.required && { required: true }),
            ...(constraints?.hideWhen && { hideWhen: constraints.hideWhen }),
            ...(constraints?.pinned && { pinned: true }),
          })
        }
      }

      // Sort: pinned first, then definition priority, then alphabetically
      fields.sort((a, b) => {
        // Pinned fields always come first
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1

        const aPriority = a.fieldSystemId ? priorityMap.get(a.fieldSystemId) : undefined
        const bPriority = b.fieldSystemId ? priorityMap.get(b.fieldSystemId) : undefined
        if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority
        if (aPriority !== undefined) return -1
        if (bPriority !== undefined) return 1
        return a.fieldName.localeCompare(b.fieldName)
      })
      return fields
    }

    function getSupertagDisplay(st: { id: string; content: string; systemId: string | null }) {
      const cached = supertagDisplayCache.get(st.id)
      if (cached) return { id: st.id, ...cached }
      const stNode = assembleNode(db, st.id, assemblyCache)
      const dbColor = stNode
        ? (getProperty(stNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
        : null
      const display = {
        name: stNode?.content ?? st.content,
        color: dbColor ?? getSupertagColor(st.id),
        systemId: stNode?.systemId ?? st.systemId,
      }
      supertagDisplayCache.set(st.id, display)
      return { id: st.id, ...display }
    }

    function addOutlineNode(assembled: AssembledNode): void {
      if (nodeMap.has(assembled.id) || assembled.deletedAt) return
      const orderValue = getProperty(assembled, FIELD_NAMES.ORDER) as number | undefined

      const outlineNode: OutlineNodeResult = {
        id: assembled.id,
        content: assembled.content ?? '',
        parentId: assembled.ownerId,
        children: [],
        hasUnloadedChildren: false,
        order: formatOrderKey(orderValue),
        createdAt: assembled.createdAt?.getTime() ?? 0,
        collapsed: false,
        supertags: assembled.supertags.map(getSupertagDisplay),
        fields: extractFields(assembled),
      }

      nodeMap.set(assembled.id, outlineNode)
    }

    let frontier = [ctx.data.nodeId]
    let currentDepth = 0
    let depthBoundaryIds: string[] = []
    while (frontier.length > 0) {
      const uniqueFrontier = [...new Set(frontier)].filter((id) => !nodeMap.has(id))
      if (uniqueFrontier.length === 0) break

      const assembledNodes = assembleNodes(db, uniqueFrontier, assemblyCache)
      const loadedIds: string[] = []
      for (const assembled of assembledNodes) {
        if (assembled.deletedAt) continue
        addOutlineNode(assembled)
        loadedIds.push(assembled.id)
      }

      if (currentDepth >= maxDepth || loadedIds.length === 0) {
        if (currentDepth >= maxDepth) depthBoundaryIds = loadedIds
        break
      }

      const childRows = db
        .select()
        .from(nodes)
        .where(and(inArray(nodes.ownerId, loadedIds), isNull(nodes.deletedAt)))
        .all()

      const nextFrontier: string[] = []
      for (const child of childRows) {
        if (!child.ownerId) continue
        const existing = childIdsByParent.get(child.ownerId) ?? []
        existing.push(child.id)
        childIdsByParent.set(child.ownerId, existing)
        nextFrontier.push(child.id)
      }

      frontier = nextFrontier
      currentDepth++
    }

    if (depthBoundaryIds.length > 0 && maxDepth < Number.MAX_SAFE_INTEGER) {
      const childCounts = db
        .select({
          ownerId: nodes.ownerId,
          count: sql<number>`count(*)`,
        })
        .from(nodes)
        .where(and(inArray(nodes.ownerId, depthBoundaryIds), isNull(nodes.deletedAt)))
        .groupBy(nodes.ownerId)
        .all()

      for (const row of childCounts) {
        if (!row.ownerId || row.count <= 0) continue
        const node = nodeMap.get(row.ownerId)
        if (node) node.hasUnloadedChildren = true
      }
    }

    for (const [parentId, childIds] of childIdsByParent) {
      const parent = nodeMap.get(parentId)
      if (!parent) continue
      parent.children = childIds
        .filter((childId) => nodeMap.has(childId))
        .sort((a, b) => {
          const na = nodeMap.get(a)
          const nb = nodeMap.get(b)
          const orderCmp = (na?.order ?? '').localeCompare(nb?.order ?? '')
          if (orderCmp !== 0) return orderCmp
          return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0)
        })
    }

    const nodesArray = Array.from(nodeMap.values())
    return { success: true as const, nodes: nodesArray, rootId: ctx.data.nodeId }
  })

/**
 * Get workspace root nodes (nodes with no parent).
 * Falls back to creating a workspace root if none exists.
 */
export const getWorkspaceRootServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await initDatabaseSeeded()
    const { nodeFacade } = await import('@nxus/db/server')
    await nodeFacade.init()
    return {
      success: true as const,
      rootIds: await nodeFacade.getWorkspaceRoots(),
    }
  },
)

/**
 * Create a new node as a child of a parent.
 * If the parent has supertags with a default_child_supertag configured,
 * automatically applies that supertag (and its field schema) to the new node.
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
    await initDatabaseSeeded()
    const { createOutlineNode } = await import('@nxus/node-api/server')
    const result = await createOutlineNode({
      ...ctx.data,
      hiddenFieldSystemIds: Array.from(HIDDEN_FIELD_SYSTEM_IDS),
    })
    const appliedSupertag = result.appliedSupertag
      ? {
          ...result.appliedSupertag,
          color: result.appliedSupertag.color ?? getSupertagColor(result.appliedSupertag.id),
        }
      : null

    return {
      success: true as const,
      nodeId: result.nodeId,
      appliedSupertag,
      appliedFields: result.appliedFields,
    }
  })

/**
 * Update node content.
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), content: z.string() }))
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { updateNodeContent } = await import('@nxus/node-api/server')
    await updateNodeContent(ctx.data)
    return { success: true as const }
  })

/**
 * Soft delete a node.
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { deleteNode } = await import('@nxus/node-api/server')
    await deleteNode(ctx.data.nodeId)
    return { success: true as const }
  })

/**
 * Restore a soft-deleted node (clears deletedAt).
 * Used by undo: undoing a delete resurrects the node server-side rather
 * than trying to re-create it (which would mint a new id).
 */
export const restoreNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { nodeFacade } = await import('@nxus/db/server')
    await nodeFacade.init()
    await nodeFacade.restoreNode(ctx.data.nodeId)
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
    await initDatabaseSeeded()
    const { nodeFacade } = await import('@nxus/db/server')
    await nodeFacade.init()
    await nodeFacade.reparentNode(ctx.data.nodeId, ctx.data.newParentId, ctx.data.order)
    return { success: true as const }
  })

/**
 * Update the order property of a node.
 */
export const reorderNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), order: z.number() }))
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { nodeFacade, SYSTEM_FIELDS } = await import('@nxus/db/server')
    await nodeFacade.init()
    await nodeFacade.setProperty(ctx.data.nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
    return { success: true as const }
  })

export const swapOrderServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      updates: z.array(z.object({ nodeId: z.string(), order: z.number() })).min(1),
    }),
  )
  .handler(async (ctx) => {
    try {
      await initDatabaseSeeded()
      const { swapOrder } = await import('@nxus/node-api/server')
      const data = await swapOrder(ctx.data)
      return { success: true as const, data }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

/**
 * Evaluate a query definition and return matching nodes.
 * Used by query supertag nodes to render live results in the outline.
 */
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ definition: QueryDefinitionSchema }))
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { evaluateEditorQuery } = await import('@nxus/node-api/server')
    const result = await evaluateEditorQuery(ctx.data.definition)

    return {
      success: true as const,
      nodes: result.nodes,
      totalCount: result.totalCount,
    }
  })

/**
 * Get backlinks grouped by origin and field name — "Appears as [fieldName] in..."
 * Uses the facade's evaluateQuery with linksTo for architecture portability,
 * then post-processes assembled nodes' properties to extract field grouping.
 */
export const getBacklinksServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { getGroupedBacklinks } = await import('@nxus/node-api/server')
    const result = await getGroupedBacklinks(ctx.data.nodeId)

    return {
      success: true as const,
      groups: result.groups,
      totalCount: result.totalCount,
    }
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
    await initDatabaseSeeded()
    const { nodeFacade, SYSTEM_FIELDS } = await import('@nxus/db/server')
    await nodeFacade.init()
    await nodeFacade.setProperty(
      ctx.data.nodeId,
      SYSTEM_FIELDS.QUERY_DEFINITION,
      ctx.data.definition,
    )
    return { success: true as const }
  })

/**
 * Set a field value on a node.
 */
/**
 * Daily note: find (or create) the #Day node for a calendar date.
 * Deterministic per date — one #Day node per YYYY-MM-DD, keyed by
 * field:start_date. Content is the ISO date; display formatting is a
 * lens concern (spec/product/data-model.md, day nodes).
 */
export const getOrCreateDayNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
    }),
  )
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { getOrCreateDayNode } = await import('@nxus/node-api/server')
    return getOrCreateDayNode({ date: ctx.data.date })
  })

export const setFieldValueServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      fieldId: z.string(),
      value: z.unknown(),
    }),
  )
  .handler(async (ctx) => {
    await initDatabaseSeeded()
    const { nodeFacade } = await import('@nxus/db/server')
    await nodeFacade.init()
    await nodeFacade.setProperty(
      ctx.data.nodeId,
      ctx.data.fieldId as import('@nxus/db/server').FieldSystemId,
      ctx.data.value,
    )
    return { success: true as const }
  })
