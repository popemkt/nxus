import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { HIDDEN_FIELD_SYSTEM_IDS } from '@/types/outline'
import type { FieldType } from '@/types/outline'
import { initDatabaseSeeded } from './ensure-seeded.server'

/**
 * Get the options for a select field by reading the field definition node's options property.
 */
export const getFieldOptionsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ fieldNodeId: z.string() }))
  .handler(async (ctx) => {
    const { assembleNode, getProperty, FIELD_NAMES } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const fieldNode = assembleNode(db, ctx.data.fieldNodeId)
    if (!fieldNode) return { success: true as const, options: [] as string[] }

    const optionsRaw = getProperty(fieldNode, FIELD_NAMES.OPTIONS)
    let options: string[] = []
    if (typeof optionsRaw === 'string') {
      try {
        const parsed = JSON.parse(optionsRaw)
        if (Array.isArray(parsed)) options = parsed.map(String)
      } catch {
        // Not JSON — try comma-separated
        options = optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      }
    } else if (Array.isArray(optionsRaw)) {
      options = optionsRaw.map(String)
    }

    return { success: true as const, options }
  })

/**
 * Get all available fields for a node based on its supertags.
 * Walks inheritance chains to collect all field definitions.
 */
export const getAvailableFieldsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const {
      assembleNode,
      getSupertagFieldDefinitions,
      getAncestorSupertags,
      getProperty,
      FIELD_NAMES,
    } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const node = assembleNode(db, ctx.data.nodeId)
    if (!node) return { success: true as const, fields: [] }

    const allDefs = new Map<string, { fieldNodeId: string; fieldName: string; fieldType: FieldType; fieldSystemId: string }>()
    const fieldTypeCache = new Map<string, FieldType>()

    function resolveFieldType(fieldNodeId: string): FieldType {
      if (fieldTypeCache.has(fieldNodeId)) return fieldTypeCache.get(fieldNodeId)!
      const fNode = assembleNode(db, fieldNodeId)
      const ft = fNode ? (getProperty(fNode, FIELD_NAMES.FIELD_TYPE) as string | undefined) ?? 'text' : 'text'
      const result = ft as FieldType
      fieldTypeCache.set(fieldNodeId, result)
      return result
    }

    for (const st of node.supertags) {
      const defs = getSupertagFieldDefinitions(db, st.id)
      const ancestors = getAncestorSupertags(db, st.id)

      for (const [systemId, def] of defs) {
        if (HIDDEN_FIELD_SYSTEM_IDS.has(systemId)) continue
        if (!allDefs.has(systemId)) {
          allDefs.set(systemId, {
            fieldNodeId: def.fieldNodeId,
            fieldName: def.fieldName,
            fieldType: resolveFieldType(def.fieldNodeId),
            fieldSystemId: systemId,
          })
        }
      }

      for (const ancestorId of ancestors) {
        const ancestorDefs = getSupertagFieldDefinitions(db, ancestorId)
        for (const [systemId, def] of ancestorDefs) {
          if (HIDDEN_FIELD_SYSTEM_IDS.has(systemId)) continue
          if (!allDefs.has(systemId)) {
            allDefs.set(systemId, {
              fieldNodeId: def.fieldNodeId,
              fieldName: def.fieldName,
              fieldType: resolveFieldType(def.fieldNodeId),
              fieldSystemId: systemId,
            })
          }
        }
      }
    }

    return {
      success: true as const,
      fields: Array.from(allDefs.values()),
    }
  })

/**
 * Clear a field value from a node (remove the property).
 */
export const clearFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), fieldId: z.string() }))
  .handler(async (ctx) => {
    const { clearProperty } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()
    clearProperty(
      db,
      ctx.data.nodeId,
      ctx.data.fieldId as import('@nxus/db/server').FieldSystemId,
    )
    return { success: true as const }
  })
