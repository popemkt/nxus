import { z } from 'zod'

/**
 * Tag schema for hierarchical tag organization
 * Tags use integer ID for efficient indexing
 */
export const TagSchema = z.object({
  id: z.number().describe('Integer primary key'),
  name: z.string().min(1).describe('Display name'),
  parentId: z
    .number()
    .nullable()
    .describe('Parent tag ID for nesting, null for root'),
  order: z.number().describe('Sort order within siblings'),
  color: z.string().nullable().optional().describe('Optional hex color'),
  icon: z
    .string()
    .nullable()
    .optional()
    .describe('Optional Phosphor icon name'),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Tag = z.infer<typeof TagSchema>

/**
 * Input for creating a new tag
 */
export const CreateTagInputSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().nullable().default(null),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export type CreateTagInput = z.infer<typeof CreateTagInputSchema>

/**
 * Input for updating a tag
 */
export const UpdateTagInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  parentId: z.number().nullable().optional(),
  order: z.number().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

export type UpdateTagInput = z.infer<typeof UpdateTagInputSchema>

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
