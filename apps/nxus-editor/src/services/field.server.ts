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
 * Get all distinct values that have been used for a given field across all nodes.
 * This powers the "self-collecting" suggestions: even if a value isn't in the
 * field definition's options list, it shows up because it's been used elsewhere.
 */
export const getUsedFieldValuesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ fieldNodeId: z.string() }))
  .handler(async (ctx) => {
    const { nodeProperties, eq } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const rows = db
      .select({ value: nodeProperties.value })
      .from(nodeProperties)
      .where(eq(nodeProperties.fieldNodeId, ctx.data.fieldNodeId))
      .all()

    // Collect distinct string values (parse JSON where needed)
    const seen = new Set<string>()
    for (const row of rows) {
      if (!row.value) continue
      try {
        const parsed = JSON.parse(row.value)
        if (typeof parsed === 'string' && parsed.trim()) {
          seen.add(parsed.trim())
        }
      } catch {
        // Raw string value
        if (row.value.trim()) seen.add(row.value.trim())
      }
    }

    return { success: true as const, values: Array.from(seen).sort() }
  })

/**
 * Add a new option to a select field's options list (auto-collect behavior).
 * If the field definition already has options, appends the new value.
 * If no options exist yet, creates the options array with the new value.
 */
export const addFieldOptionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ fieldNodeId: z.string(), option: z.string() }))
  .handler(async (ctx) => {
    const { assembleNode, getProperty, setProperty, FIELD_NAMES, SYSTEM_FIELDS } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseSeeded()

    const fieldNode = assembleNode(db, ctx.data.fieldNodeId)
    if (!fieldNode) return { success: false as const, error: 'Field not found' }

    // Read existing options
    const optionsRaw = getProperty(fieldNode, FIELD_NAMES.OPTIONS)
    let options: string[] = []
    if (typeof optionsRaw === 'string') {
      try {
        const parsed = JSON.parse(optionsRaw)
        if (Array.isArray(parsed)) options = parsed.map(String)
      } catch {
        options = optionsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } else if (Array.isArray(optionsRaw)) {
      options = optionsRaw.map(String)
    }

    // Don't add duplicates
    const newOption = ctx.data.option.trim()
    if (!newOption || options.includes(newOption)) {
      return { success: true as const, options }
    }

    options.push(newOption)
    setProperty(db, ctx.data.fieldNodeId, SYSTEM_FIELDS.OPTIONS, JSON.stringify(options))

    return { success: true as const, options }
  })

/**
 * Get nodes tagged with a specific supertag — used for "options from supertag" field type.
 * Returns node id + content for dropdown population.
 */
export const getNodesBySupertagServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ supertagId: z.string() }))
  .handler(async (ctx) => {
    const { getNodeIdsBySupertagWithInheritance, assembleNode } = await import('@nxus/db/server')
    const db = await initDatabaseSeeded()

    const nodeIds = getNodeIdsBySupertagWithInheritance(db, ctx.data.supertagId)
    const results: { id: string; content: string }[] = []

    for (const nodeId of nodeIds) {
      const node = assembleNode(db, nodeId)
      if (node && !node.deletedAt) {
        results.push({ id: node.id, content: node.content ?? '' })
      }
    }

    return { success: true as const, nodes: results }
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
