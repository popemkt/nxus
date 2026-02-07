import { z } from 'zod'

/**
 * Command Parameters & Requirements
 *
 * Commands can declare:
 * - requirements: Selectors on tagged items (e.g., pick an AI provider)
 * - params: User input values with type-safe dataType/uiType pairs
 *
 * ## Design Principles
 *
 * 1. **Requirements ≠ Params** - Requirements select apps by tag (with health checks),
 *    Params collect user inputs. They serve fundamentally different purposes.
 *
 * 2. **Required = No Default** - Params without `defaultValue` are automatically required.
 *    This simplifies the API: just omit defaultValue to make a param required.
 *
 * 3. **Type-Safe dataType + uiType** - Uses discriminated union for polymorphic type safety.
 *    Most dataTypes have fixed uiTypes; only `string` allows choosing `input` or `textarea`.
 *
 * 4. **Health Check Blocking** - Requirements run health checks on selected items.
 *    If the selected tool is not installed, execution is blocked.
 *
 * @see /docs/command-params-architecture.md for full documentation
 */

// ============================================================================
// Requirements (Tagged Item Selectors)
// ============================================================================

/**
 * A requirement selects an app/item that has a specific tag
 * Example: { name: 'provider', tagId: 14 } selects an AI provider
 */
export const CommandRequirementSchema = z.object({
  /** Key for this requirement in execution context */
  name: z.string(),
  /** Tag ID to filter items by */
  tagId: z.number(),
  /** Label shown in UI selector */
  label: z.string().optional(),
  /** Help text */
  description: z.string().optional(),
})
export type CommandRequirement = z.infer<typeof CommandRequirementSchema>

// ============================================================================
// Params (User Inputs) - Discriminated Union
// ============================================================================

/**
 * Base fields shared by all param types
 */
const BaseParamFields = {
  name: z.string().describe('Parameter key'),
  label: z.string().optional().describe('UI label (defaults to name)'),
  description: z.string().optional().describe('Help text'),
}

/**
 * String param - can use 'input' or 'textarea' UI
 */
export const StringParamSchema = z.object({
  ...BaseParamFields,
  dataType: z.literal('string'),
  uiType: z.enum(['input', 'textarea']).default('input'),
  defaultValue: z.string().optional(),
})
export type StringParam = z.infer<typeof StringParamSchema>

/**
 * Number param - uses number input
 */
export const NumberParamSchema = z.object({
  ...BaseParamFields,
  dataType: z.literal('number'),
  defaultValue: z.number().optional(),
})
export type NumberParam = z.infer<typeof NumberParamSchema>

/**
 * Boolean param - uses checkbox
 */
export const BooleanParamSchema = z.object({
  ...BaseParamFields,
  dataType: z.literal('boolean'),
  defaultValue: z.boolean().optional(),
})
export type BooleanParam = z.infer<typeof BooleanParamSchema>

/**
 * Path param - uses folder picker
 */
export const PathParamSchema = z.object({
  ...BaseParamFields,
  dataType: z.literal('path'),
  defaultValue: z.string().optional(),
})
export type PathParam = z.infer<typeof PathParamSchema>

/**
 * Select param - uses dropdown
 */
export const SelectParamSchema = z.object({
  ...BaseParamFields,
  dataType: z.literal('select'),
  options: z.array(z.string()).min(1),
  defaultValue: z.string().optional(),
})
export type SelectParam = z.infer<typeof SelectParamSchema>

/**
 * Union of all param types - discriminated by dataType
 */
export const CommandParamSchema = z.discriminatedUnion('dataType', [
  StringParamSchema,
  NumberParamSchema,
  BooleanParamSchema,
  PathParamSchema,
  SelectParamSchema,
])
export type CommandParam = z.infer<typeof CommandParamSchema>

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a param is required (no default value)
 */
export function isParamRequired(param: CommandParam): boolean {
  return param.defaultValue === undefined
}

/**
 * Get display label for a param
 */
export function getParamLabel(param: CommandParam): string {
  return param.label ?? param.name
}

/**
 * Get default value for a param based on its type
 */
export function getParamDefaultValue(
  param: CommandParam,
): string | number | boolean {
  if (param.defaultValue !== undefined) {
    return param.defaultValue
  }

  switch (param.dataType) {
    case 'string':
    case 'path':
    case 'select':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
  }
}
