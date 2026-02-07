import { z } from 'zod'

/**
 * Script parameter types that map to UI input fields
 */
export const ScriptParamTypeSchema = z.enum([
  'string', // Text input
  'number', // Number input
  'boolean', // Checkbox
  'path', // Folder/file picker
  'select', // Dropdown
])
export type ScriptParamType = z.infer<typeof ScriptParamTypeSchema>

/**
 * A script parameter parsed from the script file
 */
export const ScriptParamSchema = z.object({
  name: z.string().describe('Parameter name'),
  type: ScriptParamTypeSchema.describe('UI input type'),
  required: z.boolean().describe('Whether parameter is mandatory'),
  defaultValue: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .describe('Default value if any'),
  options: z
    .array(z.string())
    .optional()
    .describe('Options for select type (from ValidateSet)'),
  description: z
    .string()
    .optional()
    .describe('Parameter description from help'),
})
export type ScriptParam = z.infer<typeof ScriptParamSchema>

/**
 * Result from parsing script parameters
 */
export type ParseScriptParamsResult =
  | { success: true; params: ScriptParam[] }
  | { success: false; error: string }

/**
 * Script parameter adapter interface
 * Each script type (PowerShell, Bash, etc.) implements this
 */
export interface ScriptParamAdapter {
  /**
   * Parse parameters from a script file
   * @param scriptPath Absolute path to script file
   * @returns Parsed parameters or error
   */
  parseParams(scriptPath: string): Promise<ParseScriptParamsResult>
}
