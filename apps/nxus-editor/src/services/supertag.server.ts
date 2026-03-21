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
