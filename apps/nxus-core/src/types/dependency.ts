import { z } from 'zod'

/**
 * Known dependency IDs - use these for type-safe references
 * Add new dependencies here first, then register in dependency-registry.ts
 */
export const DEPENDENCY_IDS = {
  GEMINI_CLI: 'gemini-cli',
  POWERSHELL_CORE: 'powershell-core',
  GIT: 'git',
  PYTHON3: 'python3',
} as const

export type DependencyId = (typeof DEPENDENCY_IDS)[keyof typeof DEPENDENCY_IDS]

/**
 * How to check if a dependency is installed
 */
export const DependencyCheckTypeSchema = z.enum([
  'cli-exists', // Check if CLI command exists in PATH
  'file-exists', // Check if a file exists at path
  'env-var', // Check if environment variable is set
  'custom', // Custom server function check
])
export type DependencyCheckType = z.infer<typeof DependencyCheckTypeSchema>

/**
 * Configuration for CLI existence check
 */
export const CliExistsConfigSchema = z.object({
  type: z.literal('cli-exists'),
  command: z.string().describe('Command to check for in PATH'),
})
export type CliExistsConfig = z.infer<typeof CliExistsConfigSchema>

/**
 * Configuration for file existence check
 */
export const FileExistsConfigSchema = z.object({
  type: z.literal('file-exists'),
  path: z.string().describe('Absolute path to check'),
})
export type FileExistsConfig = z.infer<typeof FileExistsConfigSchema>

/**
 * Configuration for environment variable check
 */
export const EnvVarConfigSchema = z.object({
  type: z.literal('env-var'),
  variable: z.string().describe('Environment variable name'),
  expectedValue: z.string().optional().describe('Expected value (if any)'),
})
export type EnvVarConfig = z.infer<typeof EnvVarConfigSchema>

/**
 * Configuration for custom check (server function)
 */
export const CustomCheckConfigSchema = z.object({
  type: z.literal('custom'),
  checkFnId: z.string().describe('ID of registered check function'),
})
export type CustomCheckConfig = z.infer<typeof CustomCheckConfigSchema>

/**
 * Union of all check configurations
 */
export const CheckConfigSchema = z.discriminatedUnion('type', [
  CliExistsConfigSchema,
  FileExistsConfigSchema,
  EnvVarConfigSchema,
  CustomCheckConfigSchema,
])
export type CheckConfig = z.infer<typeof CheckConfigSchema>

/**
 * Full dependency definition
 */
export const DependencySchema = z.object({
  id: z.string() as z.ZodType<DependencyId>,
  name: z.string().min(1).describe('Human-readable name'),
  description: z.string().describe('What this dependency is for'),
  checkConfig: CheckConfigSchema,
  installInstructions: z.string().describe('How to install if missing'),
  installUrl: z.string().url().optional().describe('Link to installation docs'),
})
export type Dependency = z.infer<typeof DependencySchema>

/**
 * Result of checking a dependency
 */
export const DependencyCheckResultSchema = z.object({
  dependencyId: z.string() as z.ZodType<DependencyId>,
  isInstalled: z.boolean(),
  error: z.string().optional().describe('Error message if check failed'),
  checkedAt: z.number().describe('Timestamp of check'),
})
export type DependencyCheckResult = z.infer<typeof DependencyCheckResultSchema>
