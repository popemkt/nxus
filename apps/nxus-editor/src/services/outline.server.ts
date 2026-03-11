import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupertagColor } from '@/lib/supertag-colors'
import { HIDDEN_FIELD_SYSTEM_IDS } from '@/types/outline'
import type {
  FieldType,
  OutlineCommandCatalog,
  OutlineFieldDefinition,
  OutlineNode,
  OutlineSupertagDefinition,
} from '@/types/outline'

type DbModule = typeof import('@nxus/db/server')
type Database = Awaited<ReturnType<DbModule['initDatabaseWithBootstrap']>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function inferFieldType(
  declared: FieldType,
  values: Array<{ value: unknown }>,
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

function defaultValueForFieldType(fieldType: FieldType): unknown {
  switch (fieldType) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'json':
      return null
    case 'node':
      return ''
    case 'nodes':
      return []
    case 'date':
    case 'email':
    case 'select':
    case 'text':
    case 'url':
    default:
      return ''
  }
}

function normalizeSupertagName(name: string): string {
  const trimmed = name.trim().replace(/^#+/, '')
  return trimmed ? `#${trimmed}` : '#Untitled'
}

function resolveFieldType(
  api: DbModule,
  db: Database,
  cache: Map<string, FieldType>,
  fieldNodeId: string,
): FieldType {
  const cached = cache.get(fieldNodeId)
  if (cached) return cached

  const fieldNode = api.assembleNode(db, fieldNodeId)
  const fieldType = fieldNode
    ? (api.getProperty(fieldNode, api.FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text'
    : 'text'

  const result = fieldType as FieldType
  cache.set(fieldNodeId, result)
  return result
}

function extractFields(
  api: DbModule,
  db: Database,
  cache: Map<string, FieldType>,
  assembled: {
    properties: Record<string, Array<{
      value: unknown
      rawValue: string
      fieldNodeId: string
      fieldName: string
      fieldSystemId: string | null
      order: number
    }>>
  },
): OutlineNode['fields'] {
  const fields: OutlineNode['fields'] = []

  for (const [, propValues] of Object.entries(assembled.properties)) {
    if (!propValues || propValues.length === 0) continue

    const first = propValues[0]!
    if (first.fieldSystemId && HIDDEN_FIELD_SYSTEM_IDS.has(first.fieldSystemId)) continue

    const sortedValues = [...propValues]
      .sort((a, b) => a.order - b.order)
      .map((pv) => ({ value: pv.value ?? null, order: pv.order }))

    const declaredType = resolveFieldType(api, db, cache, first.fieldNodeId)
    const fieldType = inferFieldType(declaredType, sortedValues)

    fields.push({
      fieldName: first.fieldName,
      fieldNodeId: first.fieldNodeId,
      fieldSystemId: first.fieldSystemId,
      fieldType,
      values: sortedValues,
    })
  }

  return fields
}

function toSupertagDefinition(
  api: DbModule,
  db: Database,
  supertag: { id: string; content: string; systemId: string | null },
): OutlineSupertagDefinition {
  const tagNode = api.assembleNode(db, supertag.id)
  const color = tagNode
    ? (api.getProperty(tagNode, api.FIELD_NAMES.COLOR) as string | undefined) ?? null
    : null
  const icon = tagNode
    ? (api.getProperty(tagNode, api.FIELD_NAMES.ICON) as string | undefined) ?? null
    : null

  return {
    id: supertag.id,
    name: supertag.content,
    color: color ?? getSupertagColor(supertag.id),
    icon,
    systemId: supertag.systemId,
  }
}

function getNodeOrder(api: DbModule, db: Database, nodeId: string): number {
  const assembled = api.assembleNode(db, nodeId)
  if (!assembled) return 0
  return Number(api.getProperty(assembled, api.FIELD_NAMES.ORDER) ?? 0)
}

function buildNodeTree(
  api: DbModule,
  db: Database,
  nodeId: string,
  maxDepth: number,
): OutlineNode[] {
  const nodeMap = new Map<string, OutlineNode>()
  const fieldTypeCache = new Map<string, FieldType>()

  function loadNode(currentNodeId: string, depth: number): void {
    if (nodeMap.has(currentNodeId)) return

    const assembled = api.assembleNodeWithInheritance(db, currentNodeId)
    if (!assembled || assembled.deletedAt) return

    const order = Number(api.getProperty(assembled, api.FIELD_NAMES.ORDER) ?? 0)
    const outlineNode: OutlineNode = {
      id: assembled.id,
      content: assembled.content ?? '',
      parentId: assembled.ownerId,
      children: [],
      order: String(order).padStart(8, '0'),
      collapsed: false,
      supertags: assembled.supertags.map((tag) => {
        const definition = toSupertagDefinition(api, db, tag)
        return {
          id: definition.id,
          name: definition.name,
          color: definition.color,
          systemId: definition.systemId,
        }
      }),
      fields: extractFields(api, db, fieldTypeCache, assembled),
    }

    nodeMap.set(currentNodeId, outlineNode)

    if (depth >= maxDepth) return

    const childRows = db
      .select()
      .from(api.nodes)
      .where(api.and(
        api.eq(api.nodes.ownerId, currentNodeId),
        api.isNull(api.nodes.deletedAt),
      ))
      .all()

    const childIds = childRows
      .map((child) => child.id)
      .sort((a, b) => getNodeOrder(api, db, a) - getNodeOrder(api, db, b))

    outlineNode.children = childIds

    for (const childId of childIds) {
      loadNode(childId, depth + 1)
    }
  }

  loadNode(nodeId, 0)
  return Array.from(nodeMap.values())
}

function cloneTemplateChildren(
  api: DbModule,
  db: Database,
  templateParentId: string,
  targetParentId: string,
): void {
  const templateChildren = db
    .select()
    .from(api.nodes)
    .where(api.and(
      api.eq(api.nodes.ownerId, templateParentId),
      api.isNull(api.nodes.deletedAt),
    ))
    .all()
    .sort((a, b) => getNodeOrder(api, db, a.id) - getNodeOrder(api, db, b.id))

  for (const child of templateChildren) {
    const templateNode = api.assembleNodeWithInheritance(db, child.id)
    if (!templateNode || templateNode.deletedAt) continue

    const cloneId = api.createNode(db, {
      content: templateNode.content ?? '',
      ownerId: targetParentId,
    })

    const cloneOrder = Number(api.getProperty(templateNode, api.FIELD_NAMES.ORDER) ?? 0)
    api.setProperty(db, cloneId, api.SYSTEM_FIELDS.ORDER, cloneOrder)

    for (const supertag of templateNode.supertags) {
      api.addNodeSupertag(db, cloneId, supertag.id)
    }

    for (const values of Object.values(templateNode.properties)) {
      for (const property of [...values].sort((a, b) => a.order - b.order)) {
        if (property.fieldSystemId && HIDDEN_FIELD_SYSTEM_IDS.has(property.fieldSystemId)) {
          continue
        }

        api.setPropertyByIdOrSystemId(
          db,
          cloneId,
          property.fieldNodeId,
          property.value,
          property.order,
        )
      }
    }

    cloneTemplateChildren(api, db, child.id, cloneId)
  }
}

function applySupertagTemplate(
  api: DbModule,
  db: Database,
  nodeId: string,
  supertagId: string,
): boolean {
  const added = api.addNodeSupertag(db, nodeId, supertagId)
  if (!added) return false

  const node = api.assembleNode(db, nodeId)
  if (!node) return true

  const fieldTypeCache = new Map<string, FieldType>()
  const existingFields = new Set<string>()
  for (const values of Object.values(node.properties)) {
    for (const property of values) {
      existingFields.add(property.fieldSystemId ?? property.fieldNodeId)
    }
  }

  const supertagChain = [
    ...api.getAncestorSupertags(db, supertagId),
    supertagId,
  ]

  for (const chainSupertagId of supertagChain) {
    const fieldDefs = api.getSupertagFieldDefinitions(db, chainSupertagId)
    for (const [fieldSystemId, definition] of fieldDefs) {
      const fieldKey = fieldSystemId || definition.fieldNodeId
      if (existingFields.has(fieldKey)) continue

      const fieldType = resolveFieldType(
        api,
        db,
        fieldTypeCache,
        definition.fieldNodeId,
      )

      api.setPropertyByIdOrSystemId(
        db,
        nodeId,
        definition.fieldNodeId,
        definition.defaultValue ?? defaultValueForFieldType(fieldType),
      )
      existingFields.add(fieldKey)
    }
  }

  cloneTemplateChildren(api, db, supertagId, nodeId)
  return true
}

/**
 * Get a node and its descendants assembled with inherited properties and supertags.
 */
export const getNodeTreeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string(), depth: z.number().optional() }))
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()
    const nodes = buildNodeTree(api, db, ctx.data.nodeId, ctx.data.depth ?? 10)

    return { success: true as const, nodes, rootId: ctx.data.nodeId }
  })

/**
 * Command catalog for the outline inline menus.
 */
export const getOutlineCommandCatalogServerFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<OutlineCommandCatalog> => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    const supertags = api
      .getNodesBySupertagWithInheritance(db, api.SYSTEM_SUPERTAGS.SUPERTAG)
      .filter((node) => !node.deletedAt)
      .map((node) => toSupertagDefinition(api, db, {
        id: node.id,
        content: node.content ?? '',
        systemId: node.systemId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const fieldTypeCache = new Map<string, FieldType>()
    const fields = api
      .getNodesBySupertagWithInheritance(db, api.SYSTEM_SUPERTAGS.FIELD)
      .filter((node) => !node.deletedAt)
      .map((node): OutlineFieldDefinition | null => {
        if (node.systemId && HIDDEN_FIELD_SYSTEM_IDS.has(node.systemId)) return null

        return {
          id: node.id,
          name: node.content ?? '',
          systemId: node.systemId,
          fieldType: resolveFieldType(api, db, fieldTypeCache, node.id),
        }
      })
      .filter((field): field is OutlineFieldDefinition => field !== null)
      .sort((a, b) => a.name.localeCompare(b.name))

    return { supertags, fields }
  })

/**
 * Get workspace root nodes (nodes with no parent).
 * Falls back to creating a workspace root if none exists.
 */
export const getWorkspaceRootServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    const rootNodes = db
      .select()
      .from(api.nodes)
      .where(api.and(api.isNull(api.nodes.ownerId), api.isNull(api.nodes.deletedAt)))
      .all()

    if (rootNodes.length === 0) {
      const anyNode = db
        .select()
        .from(api.nodes)
        .where(api.isNull(api.nodes.deletedAt))
        .limit(1)
        .get()

      return {
        success: true as const,
        rootIds: anyNode ? [anyNode.id] : [],
      }
    }

    return {
      success: true as const,
      rootIds: rootNodes.map((node) => node.id),
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
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    const nodeId = api.createNode(db, {
      content: ctx.data.content,
      ...(ctx.data.parentId ? { ownerId: ctx.data.parentId } : {}),
    })

    if (ctx.data.order !== undefined) {
      api.setProperty(db, nodeId, api.SYSTEM_FIELDS.ORDER, ctx.data.order)
    }

    return { success: true as const, nodeId }
  })

/**
 * Update node content.
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), content: z.string() }))
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()
    api.updateNodeContent(db, ctx.data.nodeId, ctx.data.content)
    return { success: true as const }
  })

/**
 * Soft delete a node.
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()
    api.deleteNode(db, ctx.data.nodeId)
    return { success: true as const }
  })

/**
 * Restore a soft-deleted node.
 */
export const undeleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()
    api.restoreNode(db, ctx.data.nodeId)
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
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    db.update(api.nodes)
      .set({
        ownerId: ctx.data.newParentId,
        updatedAt: new Date(),
      })
      .where(api.eq(api.nodes.id, ctx.data.nodeId))
      .run()

    if (ctx.data.order !== undefined) {
      api.setProperty(db, ctx.data.nodeId, api.SYSTEM_FIELDS.ORDER, ctx.data.order)
    }

    return { success: true as const }
  })

/**
 * Update the order property of a node.
 */
export const reorderNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), order: z.number() }))
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()
    api.setProperty(db, ctx.data.nodeId, api.SYSTEM_FIELDS.ORDER, ctx.data.order)
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
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()
    api.setPropertyByIdOrSystemId(db, ctx.data.nodeId, ctx.data.fieldId, ctx.data.value)
    return { success: true as const }
  })

/**
 * Add a field to a node from an arbitrary field definition UUID or systemId.
 */
export const addFieldToNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      fieldId: z.string(),
      value: z.unknown(),
    }),
  )
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    api.setPropertyByIdOrSystemId(db, ctx.data.nodeId, ctx.data.fieldId, ctx.data.value)

    return {
      success: true as const,
      nodes: buildNodeTree(api, db, ctx.data.nodeId, 4),
    }
  })

/**
 * Apply an existing supertag and its template to a node.
 */
export const applySupertagToNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      supertagId: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    applySupertagTemplate(api, db, ctx.data.nodeId, ctx.data.supertagId)

    return {
      success: true as const,
      nodes: buildNodeTree(api, db, ctx.data.nodeId, 4),
    }
  })

/**
 * Create a new supertag definition and apply it to a node immediately.
 */
export const createSupertagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      name: z.string().min(1),
    }),
  )
  .handler(async (ctx) => {
    const api = await import('@nxus/db/server')
    const db = await api.initDatabaseWithBootstrap()

    const content = normalizeSupertagName(ctx.data.name)
    const existing = api
      .getNodesBySupertagWithInheritance(db, api.SYSTEM_SUPERTAGS.SUPERTAG)
      .find((node) => (node.content ?? '').toLowerCase() === content.toLowerCase())

    const supertagId = existing
      ? existing.id
      : api.createNode(db, { content })

    if (!existing) {
      api.addNodeSupertag(db, supertagId, api.SYSTEM_SUPERTAGS.SUPERTAG)
      api.setProperty(db, supertagId, api.SYSTEM_FIELDS.COLOR, getSupertagColor(supertagId))
      api.setProperty(db, supertagId, api.SYSTEM_FIELDS.ICON, 'Tag')
    }

    applySupertagTemplate(api, db, ctx.data.nodeId, supertagId)

    const supertagNode = api.assembleNode(db, supertagId)
    const supertag = toSupertagDefinition(api, db, {
      id: supertagId,
      content: supertagNode?.content ?? content,
      systemId: supertagNode?.systemId ?? null,
    })

    return {
      success: true as const,
      supertag,
      nodes: buildNodeTree(api, db, ctx.data.nodeId, 4),
    }
  })
