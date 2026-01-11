/**
 * Server function for providing path values to client components
 *
 * This allows client components to access server-side path constants
 * without directly importing Node.js modules.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PATHS } from '@/paths'

const GetPathsInputSchema = z.object({}).optional()

const GetPathsOutputSchema = z.object({
  nxusCoreRoot: z.string(),
  defaultAppInstallRoot: z.string(),
  reposRoot: z.string(),
})

export type PathValues = z.infer<typeof GetPathsOutputSchema>

/**
 * Server function that returns path values for client use
 *
 * @example
 * ```tsx
 * import { useQuery } from '@tanstack/react-query'
 * import { getPathsServerFn } from '@/services/paths/paths.server'
 *
 * const { data: paths } = useQuery({
 *   queryKey: ['paths'],
 *   queryFn: () => getPathsServerFn(),
 * })
 * ```
 */
export const getPathsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetPathsInputSchema)
  .handler(async (): Promise<PathValues> => {
    return {
      nxusCoreRoot: PATHS.nxusCoreRoot,
      defaultAppInstallRoot: PATHS.defaultAppInstallRoot,
      reposRoot: PATHS.reposRoot,
    }
  })
