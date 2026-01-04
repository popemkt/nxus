import { z } from 'zod'

/**
 * Tag schema for hierarchical tag organization
 * Tags can be nested via parentId to create a tree structure
 */
export const TagSchema = z.object({
  id: z.string().describe('Unique identifier (slug format)'),
  name: z.string().min(1).describe('Display name'),
  parentId: z
    .string()
    .nullable()
    .describe('Parent tag ID for nesting, null for root'),
  order: z.number().describe('Sort order within siblings'),
  color: z.string().optional().describe('Optional hex color'),
  icon: z.string().optional().describe('Optional Phosphor icon name'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Tag = z.infer<typeof TagSchema>

/**
 * Input for creating a new tag
 */
export const CreateTagInputSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().default(null),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export type CreateTagInput = z.infer<typeof CreateTagInputSchema>

/**
 * Input for updating a tag
 */
export const UpdateTagInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export type UpdateTagInput = z.infer<typeof UpdateTagInputSchema>

/**
 * Generate a slug from a tag name
 */
export function generateTagId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Parse a tag from unknown data
 */
export function parseTag(
  data: unknown,
): { success: true; data: Tag } | { success: false; error: z.ZodError } {
  const result = TagSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}
