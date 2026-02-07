import { createServerFn } from '@tanstack/react-start'
import { spawn } from 'child_process'
import { z } from 'zod'
import { existsSync } from 'fs'
import { getPlatformCommands } from '@/lib/platform-commands'
import type { DependencyCheckResult, DependencyId } from '@/types/dependency'

const CheckDependencyInputSchema = z.object({
  dependencyId: z.string(),
  checkConfig: z.object({
    type: z.enum(['cli-exists', 'file-exists', 'env-var', 'custom']),
    command: z.string().optional(),
    path: z.string().optional(),
    variable: z.string().optional(),
    expectedValue: z.string().optional(),
    checkFnId: z.string().optional(),
  }),
})

/**
 * Check if a CLI command exists in PATH using 'which' (or 'where' on Windows)
 */
function checkCliExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const whichCommand = getPlatformCommands().whichCommand
    const child = spawn(whichCommand, [command], { shell: true })

    child.on('close', (code) => {
      resolve(code === 0)
    })

    child.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * Check if a file exists at the given path
 */
function checkFileExists(path: string): boolean {
  return existsSync(path)
}

/**
 * Check if an environment variable is set (and optionally matches expected value)
 */
function checkEnvVar(variable: string, expectedValue?: string): boolean {
  const value = process.env[variable]
  if (expectedValue !== undefined) {
    return value === expectedValue
  }
  return value !== undefined && value !== ''
}

/**
 * Server function to check if a dependency is installed
 */
export const checkDependencyServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CheckDependencyInputSchema)
  .handler(async (ctx): Promise<DependencyCheckResult> => {
    console.log('[checkDependencyServerFn] Input:', ctx.data)
    const { dependencyId, checkConfig } = ctx.data
    const checkedAt = Date.now()

    try {
      let isInstalled = false

      switch (checkConfig.type) {
        case 'cli-exists':
          if (checkConfig.command) {
            isInstalled = await checkCliExists(checkConfig.command)
          }
          break

        case 'file-exists':
          if (checkConfig.path) {
            isInstalled = checkFileExists(checkConfig.path)
          }
          break

        case 'env-var':
          if (checkConfig.variable) {
            isInstalled = checkEnvVar(
              checkConfig.variable,
              checkConfig.expectedValue,
            )
          }
          break

        case 'custom':
          // Custom checks can be added here by registering check functions
          // For now, return false for unknown custom checks
          isInstalled = false
          break
      }

      console.log(
        '[checkDependencyServerFn] Result:',
        dependencyId,
        isInstalled,
      )
      return {
        dependencyId: dependencyId as DependencyId,
        isInstalled,
        checkedAt,
      }
    } catch (error) {
      console.error('[checkDependencyServerFn] Error:', dependencyId, error)
      return {
        dependencyId: dependencyId as DependencyId,
        isInstalled: false,
        error:
          error instanceof Error ? error.message : 'Unknown error during check',
        checkedAt,
      }
    }
  })

const CheckMultipleDependenciesInputSchema = z.object({
  checks: z.array(CheckDependencyInputSchema),
})

/**
 * Server function to check multiple dependencies at once
 */
export const checkMultipleDependenciesServerFn = createServerFn({
  method: 'POST',
})
  .inputValidator(CheckMultipleDependenciesInputSchema)
  .handler(async (ctx): Promise<DependencyCheckResult[]> => {
    console.log(
      '[checkMultipleDependenciesServerFn] Checking:',
      ctx.data.checks.length,
    )
    const { checks } = ctx.data

    const results = await Promise.all(
      checks.map(async ({ dependencyId, checkConfig }) => {
        const result = await checkDependencyServerFn({
          data: { dependencyId, checkConfig },
        })
        return result
      }),
    )

    console.log('[checkMultipleDependenciesServerFn] Completed')
    return results
  })
