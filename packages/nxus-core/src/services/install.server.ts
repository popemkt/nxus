import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const InstallParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  targetPath: z.string(),
})

/**
 * Server function to install a remote repository app.
 * Dynamically imports logic to ensure Node.js modules are isolated from client bundle.
 */
export const installAppServerFn = createServerFn({ method: 'POST' })
  .inputValidator(InstallParamsSchema)
  .handler(async (ctx) => {
    // Dynamic import to strictly isolate server logic from client bundle
    const { installRepo } = await import('./installation-logic')
    return installRepo(ctx.data)
  })
