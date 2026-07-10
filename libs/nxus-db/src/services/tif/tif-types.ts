/**
 * tif-types.ts - Tana Intermediate Format (TIF) v0.1 schema
 *
 * Zod schemas + inferred types for the JSON shape produced/consumed by
 * tanainc/tana-import-tools (`TanaIntermediateFile V0.1`). Parsed at the
 * import boundary (see tif-import.ts) — invalid files are rejected fail-fast,
 * never partially trusted.
 *
 * This module only covers the JSON TIF wire format. It does NOT parse the
 * separate "Tana Paste" plain-text format — see spec/product/tif-interchange.md.
 */

import { z } from 'zod'

// ============================================================================
// Literal unions
// ============================================================================

export const TifNodeTypeSchema = z.enum(['field', 'image', 'codeblock', 'node', 'date'])
export type TifNodeType = z.infer<typeof TifNodeTypeSchema>

export const TifFlagTypeSchema = z.enum(['section'])
export type TifFlagType = z.infer<typeof TifFlagTypeSchema>

export const TifViewTypeSchema = z.enum(['list', 'table'])
export type TifViewType = z.infer<typeof TifViewTypeSchema>

export const TifTodoStateSchema = z.enum(['todo', 'done'])
export type TifTodoState = z.infer<typeof TifTodoStateSchema>

export const TifAttributeDataTypeSchema = z.enum(['any', 'url', 'email', 'number', 'date', 'checkbox'])
export type TifAttributeDataType = z.infer<typeof TifAttributeDataTypeSchema>

// ============================================================================
// Summary / attributes / supertags
// ============================================================================

export const TanaIntermediateSummarySchema = z.object({
  leafNodes: z.number(),
  topLevelNodes: z.number(),
  totalNodes: z.number(),
  calendarNodes: z.number(),
  fields: z.number(),
  brokenRefs: z.number(),
})
export type TanaIntermediateSummary = z.infer<typeof TanaIntermediateSummarySchema>

export const TanaIntermediateAttributeSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
  count: z.number(),
  dataType: TifAttributeDataTypeSchema.optional(),
})
export type TanaIntermediateAttribute = z.infer<typeof TanaIntermediateAttributeSchema>

export const TanaIntermediateSupertagSchema = z.object({
  uid: z.string(),
  name: z.string(),
})
export type TanaIntermediateSupertag = z.infer<typeof TanaIntermediateSupertagSchema>

// ============================================================================
// Node (recursive)
// ============================================================================

export interface TanaIntermediateNode {
  uid: string
  name: string
  description?: string
  children?: TanaIntermediateNode[]
  refs?: string[]
  createdAt: number
  editedAt: number
  type: TifNodeType
  mediaUrl?: string
  codeLanguage?: string
  supertags?: string[]
  flags?: TifFlagType[]
  viewType?: TifViewType
  todoState?: TifTodoState
}

// z.lazy() is required for the recursive `children` field; the explicit
// z.ZodType<TanaIntermediateNode> annotation ties the schema to the
// hand-written interface above so the two cannot silently drift.
export const TanaIntermediateNodeSchema: z.ZodType<TanaIntermediateNode> = z.lazy(() =>
  z.object({
    uid: z.string(),
    name: z.string(),
    description: z.string().optional(),
    children: z.array(TanaIntermediateNodeSchema).optional(),
    refs: z.array(z.string()).optional(),
    createdAt: z.number(),
    editedAt: z.number(),
    type: TifNodeTypeSchema,
    mediaUrl: z.string().optional(),
    codeLanguage: z.string().optional(),
    supertags: z.array(z.string()).optional(),
    flags: z.array(TifFlagTypeSchema).optional(),
    viewType: TifViewTypeSchema.optional(),
    todoState: TifTodoStateSchema.optional(),
  }),
)

// ============================================================================
// Top-level file
// ============================================================================

export const TanaIntermediateFileSchema = z.object({
  version: z.literal('TanaIntermediateFile V0.1'),
  summary: TanaIntermediateSummarySchema,
  nodes: z.array(TanaIntermediateNodeSchema),
  homeNodeIds: z.array(z.string()).optional(),
  attributes: z.array(TanaIntermediateAttributeSchema).optional(),
  supertags: z.array(TanaIntermediateSupertagSchema).optional(),
})
export type TanaIntermediateFile = z.infer<typeof TanaIntermediateFileSchema>
