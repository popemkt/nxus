/**
 * tag-config.server.ts - Server functions for tag configuration system
 *
 * Provides CRUD operations for configurable tags and their per-app values.
 * Tags like "ai-provider" can have schema definitions that require
 * apps to provide configuration values.
 *
 * Uses integer tag IDs for proper foreign key relationships.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, saveDatabase } from '@/db/client'
import { tagSchemas, itemTagConfigs } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// ============================================================================
// Schema definitions for tag config fields
// ============================================================================

/**
 * Field types supported in tag configuration schemas
 */
export type TagConfigFieldType =
  | 'text'
  | 'password'
  | 'boolean'
  | 'number'
  | 'select'

/**
 * Individual field definition in a tag config schema
 */
export interface TagConfigField {
  key: string
  label: string
  type: TagConfigFieldType
  required?: boolean
  default?: string | number | boolean
  placeholder?: string
  options?: string[] // For select type
}

/**
 * Complete schema definition for a configurable tag
 */
export interface TagConfigSchema {
  fields: TagConfigField[]
}

// ============================================================================
// Zod schemas for validation
// ============================================================================

const TagConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'password', 'boolean', 'number', 'select']),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
})

const TagConfigSchemaValidator = z.object({
  fields: z.array(TagConfigFieldSchema),
})

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get schema for a configurable tag by integer ID
 */
export const getTagConfigServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ tagId: z.number() }))
  .handler(async (ctx) => {
    console.log('[getTagConfigServerFn] Fetching:', ctx.data.tagId)
    const db = initDatabase()

    const config = await db
      .select()
      .from(tagSchemas)
      .where(eq(tagSchemas.tagId, ctx.data.tagId))
      .get()

    if (!config) {
      return { success: false as const, error: 'Tag config not found' }
    }

    return {
      success: true as const,
      data: {
        tagId: config.tagId,
        schema: config.schema as TagConfigSchema,
        description: config.description,
      },
    }
  })

/**
 * Get all configurable tags (tags with schema definitions)
 */
export const getAllConfigurableTagsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  console.log('[getAllConfigurableTagsServerFn] Fetching all')
  const db = initDatabase()

  const configs = await db.select().from(tagSchemas)

  return {
    success: true as const,
    data: configs.map((c) => ({
      tagId: c.tagId,
      schema: c.schema as TagConfigSchema,
      description: c.description,
    })),
  }
})

/**
 * Create or update a tag config schema
 */
export const setTagConfigServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      tagId: z.number(),
      schema: TagConfigSchemaValidator,
      description: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    console.log('[setTagConfigServerFn] Setting:', ctx.data.tagId)
    const db = initDatabase()
    const now = new Date()

    // Check if exists
    const existing = await db
      .select()
      .from(tagSchemas)
      .where(eq(tagSchemas.tagId, ctx.data.tagId))
      .get()

    if (existing) {
      // Update
      await db
        .update(tagSchemas)
        .set({
          schema: ctx.data.schema,
          description: ctx.data.description ?? null,
          updatedAt: now,
        })
        .where(eq(tagSchemas.tagId, ctx.data.tagId))
    } else {
      // Insert
      await db.insert(tagSchemas).values({
        tagId: ctx.data.tagId,
        schema: ctx.data.schema,
        description: ctx.data.description ?? null,
        createdAt: now,
        updatedAt: now,
      })
    }

    saveDatabase()
    console.log('[setTagConfigServerFn] Success:', ctx.data.tagId)
    return { success: true as const }
  })

/**
 * Get an app's configuration values for a specific tag
 */
export const getAppTagValuesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ appId: z.string(), tagId: z.number() }))
  .handler(async (ctx) => {
    console.log('[getAppTagValuesServerFn] Fetching:', ctx.data)
    const db = initDatabase()

    const values = await db
      .select()
      .from(itemTagConfigs)
      .where(
        and(
          eq(itemTagConfigs.appId, ctx.data.appId),
          eq(itemTagConfigs.tagId, ctx.data.tagId),
        ),
      )
      .get()

    if (!values) {
      return { success: false as const, error: 'Values not found' }
    }

    return {
      success: true as const,
      data: {
        appId: values.appId,
        values: values.configValues as Record<string, any>,
      },
    }
  })

/**
 * Get all tag values for an app (all configured tags)
 */
export const getAllAppTagValuesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ appId: z.string() }))
  .handler(async (ctx) => {
    console.log('[getAllAppTagValuesServerFn] Fetching:', ctx.data.appId)
    const db = initDatabase()

    const allValues = await db
      .select()
      .from(itemTagConfigs)
      .where(eq(itemTagConfigs.appId, ctx.data.appId))

    return {
      success: true as const,
      data: allValues.map((v) => ({
        tagId: v.tagId,
        values: v.configValues as Record<string, any>,
      })),
    }
  })

/**
 * Set an app's configuration values for a tag
 * Validates against the tag's schema before saving
 */
export const setAppTagValuesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      tagId: z.number(),
      configValues: z.any(), // Use z.any() instead of z.record() to avoid validation issues
    }),
  )
  .handler(async (ctx) => {
    console.log('[setAppTagValuesServerFn] Setting:', ctx.data)

    // Manual validation that configValues is an object
    if (!ctx.data.configValues || typeof ctx.data.configValues !== 'object') {
      return {
        success: false as const,
        error: 'configValues must be an object',
      }
    }

    const db = initDatabase()

    // 1. Get tag schema for validation
    const tagConfig = await db
      .select()
      .from(tagSchemas)
      .where(eq(tagSchemas.tagId, ctx.data.tagId))
      .get()

    if (!tagConfig) {
      return {
        success: false as const,
        error: `Tag ID ${ctx.data.tagId} has no configuration schema`,
      }
    }

    // 2. Build dynamic Zod validator from schema
    const schema = tagConfig.schema as TagConfigSchema
    const validationResult = validateValuesAgainstSchema(
      ctx.data.configValues,
      schema,
    )

    if (!validationResult.valid) {
      return {
        success: false as const,
        error: `Validation failed: ${validationResult.errors?.join(', ')}`,
      }
    }

    // 3. Check if existing record
    const now = new Date()
    const existing = await db
      .select()
      .from(itemTagConfigs)
      .where(
        and(
          eq(itemTagConfigs.appId, ctx.data.appId),
          eq(itemTagConfigs.tagId, ctx.data.tagId),
        ),
      )
      .get()

    if (existing) {
      // Update
      await db
        .update(itemTagConfigs)
        .set({
          configValues: validationResult.data,
          updatedAt: now,
        })
        .where(
          and(
            eq(itemTagConfigs.appId, ctx.data.appId),
            eq(itemTagConfigs.tagId, ctx.data.tagId),
          ),
        )
    } else {
      // Insert
      await db.insert(itemTagConfigs).values({
        appId: ctx.data.appId,
        tagId: ctx.data.tagId,
        configValues: validationResult.data,
        createdAt: now,
        updatedAt: now,
      })
    }

    saveDatabase()
    console.log('[setAppTagValuesServerFn] Success')
    return { success: true as const, data: validationResult.data }
  })

/**
 * Delete an app's configuration values for a tag
 */
export const deleteAppTagValuesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ appId: z.string(), tagId: z.number() }))
  .handler(async (ctx) => {
    console.log('[deleteAppTagValuesServerFn] Deleting:', ctx.data)
    const db = initDatabase()

    await db
      .delete(itemTagConfigs)
      .where(
        and(
          eq(itemTagConfigs.appId, ctx.data.appId),
          eq(itemTagConfigs.tagId, ctx.data.tagId),
        ),
      )

    saveDatabase()
    console.log('[deleteAppTagValuesServerFn] Success')
    return { success: true as const }
  })

/**
 * Get apps that have a specific configurable tag with values
 * Useful for finding all AI providers, for example
 */
export const getAppsByConfiguredTagServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ tagId: z.number() }))
  .handler(async (ctx) => {
    console.log('[getAppsByConfiguredTagServerFn] Fetching:', ctx.data.tagId)
    const db = initDatabase()

    const results = await db
      .select()
      .from(itemTagConfigs)
      .where(eq(itemTagConfigs.tagId, ctx.data.tagId))

    return {
      success: true as const,
      data: results.map((r) => ({
        appId: r.appId,
        values: r.configValues as Record<string, any>,
      })),
    }
  })

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate values against a tag config schema
 */
function validateValuesAgainstSchema(
  values: Record<string, any>,
  schema: TagConfigSchema,
): { valid: boolean; errors?: string[]; data?: Record<string, any> } {
  const errors: string[] = []
  const validatedData: Record<string, any> = {}

  for (const field of schema.fields) {
    const value = values[field.key]

    // Check required
    if (
      field.required &&
      (value === undefined || value === null || value === '')
    ) {
      errors.push(`${field.label} is required`)
      continue
    }

    // Apply default if no value
    if (value === undefined || value === null || value === '') {
      if (field.default !== undefined) {
        validatedData[field.key] = field.default
      }
      continue
    }

    // Type validation
    switch (field.type) {
      case 'text':
      case 'password':
        if (typeof value !== 'string') {
          errors.push(`${field.label} must be a string`)
        } else {
          validatedData[field.key] = value
        }
        break

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${field.label} must be a boolean`)
        } else {
          validatedData[field.key] = value
        }
        break

      case 'number':
        if (typeof value !== 'number') {
          errors.push(`${field.label} must be a number`)
        } else {
          validatedData[field.key] = value
        }
        break

      case 'select':
        if (typeof value !== 'string') {
          errors.push(`${field.label} must be a string`)
        } else if (field.options && !field.options.includes(value)) {
          errors.push(
            `${field.label} must be one of: ${field.options.join(', ')}`,
          )
        } else {
          validatedData[field.key] = value
        }
        break
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, data: validatedData }
}
