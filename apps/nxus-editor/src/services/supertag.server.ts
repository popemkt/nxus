import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupertagColor } from '@/lib/supertag-colors'
import type { FieldType } from '@/types/outline'
import { HIDDEN_FIELD_SYSTEM_IDS, SUPERTAG_DEFINITION_SYSTEM_ID } from '@/types/outline'
import { initDatabaseSeeded } from './ensure-seeded.server'

/**
 * List all supertag definitions (nodes tagged with supertag:supertag).
 * Used for autocomplete when typing `#` in a node.
 */
export const listSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const {
      getNodeIdsBySupertagWithInheritance,
      assembleNodes,
      getProperty,
      FIELD_NAMES,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const ids = getNodeIdsBySupertagWithInheritance(db, SUPERTAG_DEFINITION_SYSTEM_ID)
    const assembled = assembleNodes(db, ids)

    const supertags: { id: string; name: string; systemId: string | null; color: string | null }[] = []

    for (const node of assembled) {
      if (node.deletedAt) continue
      const dbColor = (getProperty(node, FIELD_NAMES.COLOR) as string | undefined) ?? null
      supertags.push({
        id: node.id,
        name: node.content ?? '',
        systemId: node.systemId,
        color: dbColor ?? getSupertagColor(node.id),
      })
    }

    return { success: true as const, supertags }
  },
)

/**
 * Add a supertag to a node. Returns the updated supertag badge and any new fields
 * from the supertag's field definitions (including inherited fields).
 */
export const addSupertagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      supertagSystemId: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const {
      addNodeSupertag,
      assembleNode,
      getSupertagFieldDefinitions,
      getAncestorSupertags,
      getProperty,
      FIELD_NAMES,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const added = addNodeSupertag(db, ctx.data.nodeId, ctx.data.supertagSystemId)

    // Always re-assemble to get the current state
    const supertagNode = (await import('@nxus/db/server')).findNodeBySystemId(db, ctx.data.supertagSystemId)
    if (!supertagNode) {
      return { success: false as const, error: 'Supertag not found' }
    }

    const dbColor = (getProperty(supertagNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
    const badge = {
      id: supertagNode.id,
      name: supertagNode.content ?? '',
      systemId: supertagNode.systemId as string | null,
      color: dbColor ?? getSupertagColor(supertagNode.id),
    }

    // Collect field definitions from this supertag + ancestors
    const fieldDefs = getSupertagFieldDefinitions(db, supertagNode.id)
    const ancestors = getAncestorSupertags(db, supertagNode.id)
    for (const ancestorId of ancestors) {
      const ancestorDefs = getSupertagFieldDefinitions(db, ancestorId)
      for (const [key, val] of ancestorDefs) {
        if (!fieldDefs.has(key)) fieldDefs.set(key, val)
      }
    }

    // Build new fields for the client
    const newFields: { fieldId: string; fieldName: string; fieldNodeId: string; fieldSystemId: string | null; fieldType: FieldType; values: { value: null; order: number }[] }[] = []
    const fieldTypeCache = new Map<string, FieldType>()

    for (const [systemId, def] of fieldDefs) {
      if (HIDDEN_FIELD_SYSTEM_IDS.has(systemId)) continue

      let fieldType: FieldType = 'text'
      if (!fieldTypeCache.has(def.fieldNodeId)) {
        const fieldNode = assembleNode(db, def.fieldNodeId)
        if (fieldNode) {
          const ft = (getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text'
          fieldType = ft as FieldType
          fieldTypeCache.set(def.fieldNodeId, fieldType)
        }
      } else {
        fieldType = fieldTypeCache.get(def.fieldNodeId)!
      }

      newFields.push({
        fieldId: systemId,
        fieldName: def.fieldName,
        fieldNodeId: def.fieldNodeId,
        fieldSystemId: systemId,
        fieldType,
        values: [],
      })
    }

    return { success: true as const, added, badge, newFields }
  })

/**
 * Add a supertag to a node by the supertag's node ID (UUID) instead of system ID.
 * Used by InstanceField when creating a new node that should be tagged with a supertag
 * whose system ID is not known on the client.
 */
export const addSupertagByNodeIdServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      supertagNodeId: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const { addNodeSupertag, assembleNode } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const supertagNode = assembleNode(db, ctx.data.supertagNodeId)
    if (!supertagNode || !supertagNode.systemId) {
      return { success: false as const, error: 'Supertag not found or has no system ID' }
    }

    const added = addNodeSupertag(db, ctx.data.nodeId, supertagNode.systemId)
    return { success: true as const, added }
  })

/**
 * Remove a supertag from a node. Fields are kept (Tana behavior — no data loss).
 */
export const removeSupertagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      supertagSystemId: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const { removeNodeSupertag } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    const removed = removeNodeSupertag(db, ctx.data.nodeId, ctx.data.supertagSystemId)
    return { success: true as const, removed }
  })

/**
 * Get the full configuration for a supertag definition.
 * Returns field definitions (own + inherited), default child supertag,
 * content template, extends chain, and color.
 */
export const getSupertagConfigServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ supertagId: z.string() }))
  .handler(async (ctx) => {
    const {
      assembleNode,
      getProperty,
      getSupertagFieldDefinitions,
      getAncestorSupertags,
      FIELD_NAMES,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const supertagNode = assembleNode(db, ctx.data.supertagId)
    if (!supertagNode) {
      return { success: false as const, error: 'Supertag not found' }
    }

    // Helper to read constraint properties from a field definition node
    function readFieldConstraints(fieldNode: ReturnType<typeof assembleNode>) {
      if (!fieldNode) return {}
      const required = getProperty(fieldNode, FIELD_NAMES.REQUIRED) as boolean | string | undefined
      const hideWhen = getProperty(fieldNode, FIELD_NAMES.HIDE_WHEN) as string | undefined
      const pinned = getProperty(fieldNode, FIELD_NAMES.PINNED) as boolean | string | undefined
      return {
        ...(required === true || required === 'true' ? { required: true } : {}),
        ...(hideWhen ? { hideWhen } : {}),
        ...(pinned === true || pinned === 'true' ? { pinned: true } : {}),
      }
    }

    // Own field definitions (not inherited)
    const ownDefs = getSupertagFieldDefinitions(db, ctx.data.supertagId)
    const ownFields: { fieldNodeId: string; fieldName: string; fieldSystemId: string; fieldType: string; required?: boolean; hideWhen?: string; pinned?: boolean }[] = []

    for (const [systemId, def] of ownDefs) {
      if (HIDDEN_FIELD_SYSTEM_IDS.has(systemId)) continue
      const fieldNode = assembleNode(db, def.fieldNodeId)
      const fieldType = fieldNode
        ? (getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text'
        : 'text'
      ownFields.push({
        fieldNodeId: def.fieldNodeId,
        fieldName: def.fieldName,
        fieldSystemId: systemId,
        fieldType,
        ...readFieldConstraints(fieldNode),
      })
    }

    // Inherited fields from ancestors
    const ancestors = getAncestorSupertags(db, ctx.data.supertagId)
    const inheritedFields: { fieldNodeId: string; fieldName: string; fieldSystemId: string; fieldType: string; fromSupertagId: string; fromSupertagName: string; required?: boolean; hideWhen?: string; pinned?: boolean }[] = []
    const ownFieldIds = new Set(ownFields.map((f) => f.fieldSystemId))

    for (const ancestorId of ancestors) {
      const ancestorNode = assembleNode(db, ancestorId)
      const ancestorDefs = getSupertagFieldDefinitions(db, ancestorId)
      for (const [systemId, def] of ancestorDefs) {
        if (HIDDEN_FIELD_SYSTEM_IDS.has(systemId)) continue
        if (ownFieldIds.has(systemId)) continue
        if (inheritedFields.some((f) => f.fieldSystemId === systemId)) continue
        const fieldNode = assembleNode(db, def.fieldNodeId)
        const fieldType = fieldNode
          ? (getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text'
          : 'text'
        inheritedFields.push({
          fieldNodeId: def.fieldNodeId,
          fieldName: def.fieldName,
          fieldSystemId: systemId,
          fieldType,
          fromSupertagId: ancestorId,
          fromSupertagName: ancestorNode?.content ?? '',
          ...readFieldConstraints(fieldNode),
        })
      }
    }

    // Default child supertag
    const defaultChildRef = getProperty(supertagNode, FIELD_NAMES.DEFAULT_CHILD_SUPERTAG) as string | undefined
    let defaultChildSupertag: { id: string; name: string; systemId: string | null; color: string | null } | null = null
    if (defaultChildRef) {
      const childTagNode = assembleNode(db, defaultChildRef)
      if (childTagNode) {
        const dbColor = (getProperty(childTagNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
        defaultChildSupertag = {
          id: childTagNode.id,
          name: childTagNode.content ?? '',
          systemId: childTagNode.systemId,
          color: dbColor ?? getSupertagColor(childTagNode.id),
        }
      }
    }

    // Content template
    const templateRaw = getProperty(supertagNode, FIELD_NAMES.CONTENT_TEMPLATE) as string | undefined
    let contentTemplate: string | null = null
    if (templateRaw) {
      contentTemplate = typeof templateRaw === 'string' ? templateRaw : JSON.stringify(templateRaw)
    }

    // Extends (parent supertag)
    let extendsSupertag: { id: string; name: string; systemId: string | null; color: string | null } | null = null
    if (ancestors.length > 0) {
      const parentNode = assembleNode(db, ancestors[0]!)
      if (parentNode) {
        const dbColor = (getProperty(parentNode, FIELD_NAMES.COLOR) as string | undefined) ?? null
        extendsSupertag = {
          id: parentNode.id,
          name: parentNode.content ?? '',
          systemId: parentNode.systemId,
          color: dbColor ?? getSupertagColor(parentNode.id),
        }
      }
    }

    // Color
    const color = (getProperty(supertagNode, FIELD_NAMES.COLOR) as string | undefined) ?? null

    return {
      success: true as const,
      config: {
        id: supertagNode.id,
        name: supertagNode.content ?? '',
        systemId: supertagNode.systemId,
        color: color ?? getSupertagColor(supertagNode.id),
        ownFields,
        inheritedFields,
        defaultChildSupertag,
        contentTemplate,
        extendsSupertag,
      },
    }
  })

/**
 * Add a field definition to a supertag's schema.
 * Creates a new field node and links it as a property on the supertag.
 */
export const addSupertagFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      supertagId: z.string(),
      fieldName: z.string(),
      fieldType: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    const {
      createNode,
      setProperty,
      addNodeSupertag,
      SYSTEM_FIELDS,
      SYSTEM_SUPERTAGS,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    // Create a new field node
    const fieldNodeId = createNode(db, {
      content: ctx.data.fieldName,
    })

    // Tag it as a field
    addNodeSupertag(db, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)

    // Set field type
    if (ctx.data.fieldType && ctx.data.fieldType !== 'text') {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, ctx.data.fieldType)
    }

    // Generate a system ID for the field
    const systemId = `field:${ctx.data.fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${fieldNodeId.slice(0, 8)}`
    db.update((await import('@nxus/db/server')).nodes)
      .set({ systemId })
      .where((await import('@nxus/db/server')).eq((await import('@nxus/db/server')).nodes.id, fieldNodeId))
      .run()

    // Link the field to the supertag as a property (declares the field in the schema)
    setProperty(
      db,
      ctx.data.supertagId,
      fieldNodeId as unknown as import('@nxus/db/server').FieldSystemId,
      JSON.stringify(null),
    )

    return {
      success: true as const,
      field: {
        fieldNodeId,
        fieldName: ctx.data.fieldName,
        fieldSystemId: systemId,
        fieldType: ctx.data.fieldType ?? 'text',
      },
    }
  })

/**
 * Remove a field definition from a supertag's schema.
 * Removes the property link from the supertag node, but does not delete the field node.
 */
export const removeSupertagFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      supertagId: z.string(),
      fieldNodeId: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const { nodeProperties, eq, and } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    // Remove the property linking the field to the supertag
    db.delete(nodeProperties)
      .where(
        and(
          eq(nodeProperties.nodeId, ctx.data.supertagId),
          eq(nodeProperties.fieldNodeId, ctx.data.fieldNodeId),
        ),
      )
      .run()

    return { success: true as const }
  })

/**
 * Update a field's type on its definition node.
 */
export const updateFieldTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      fieldNodeId: z.string(),
      fieldType: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const { setProperty, SYSTEM_FIELDS } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    setProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, ctx.data.fieldType)
    return { success: true as const }
  })

/**
 * Update field constraints (required, hideWhen, pinned) on a field definition node.
 */
export const updateFieldConstraintsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      fieldNodeId: z.string(),
      required: z.boolean().nullable().optional(),
      hideWhen: z.enum(['never', 'when_empty', 'when_not_empty', 'always']).nullable().optional(),
      pinned: z.boolean().nullable().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { setProperty, clearProperty, SYSTEM_FIELDS } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    if (ctx.data.required !== undefined) {
      if (ctx.data.required) {
        setProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.REQUIRED, 'true')
      } else {
        clearProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.REQUIRED)
      }
    }

    if (ctx.data.hideWhen !== undefined) {
      if (ctx.data.hideWhen && ctx.data.hideWhen !== 'never') {
        setProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN, ctx.data.hideWhen)
      } else {
        clearProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN)
      }
    }

    if (ctx.data.pinned !== undefined) {
      if (ctx.data.pinned) {
        setProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.PINNED, 'true')
      } else {
        clearProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.PINNED)
      }
    }

    return { success: true as const }
  })

/**
 * Update supertag configuration: default child supertag, content template, extends, color.
 */
export const updateSupertagConfigServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      supertagId: z.string(),
      defaultChildSupertagId: z.string().nullable().optional(),
      contentTemplate: z.string().nullable().optional(),
      extendsId: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { setProperty, clearProperty, SYSTEM_FIELDS } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    if (ctx.data.defaultChildSupertagId !== undefined) {
      if (ctx.data.defaultChildSupertagId) {
        setProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG, JSON.stringify(ctx.data.defaultChildSupertagId))
      } else {
        clearProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG)
      }
    }

    if (ctx.data.contentTemplate !== undefined) {
      if (ctx.data.contentTemplate) {
        setProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.CONTENT_TEMPLATE, ctx.data.contentTemplate)
      } else {
        clearProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.CONTENT_TEMPLATE)
      }
    }

    if (ctx.data.extendsId !== undefined) {
      if (ctx.data.extendsId) {
        setProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.EXTENDS, JSON.stringify(ctx.data.extendsId))
      } else {
        clearProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.EXTENDS)
      }
    }

    if (ctx.data.color !== undefined) {
      if (ctx.data.color) {
        setProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.COLOR, ctx.data.color)
      } else {
        clearProperty(db, ctx.data.supertagId, SYSTEM_FIELDS.COLOR)
      }
    }

    return { success: true as const }
  })
